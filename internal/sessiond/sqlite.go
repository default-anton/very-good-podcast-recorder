package sessiond

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	sessiondmigrations "github.com/default-anton/very-good-podcast-recorder/db/migrations/sessiond"
	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

const (
	claimCookieName         = "vgpr_claim"
	claimStateActive        = "active"
	claimStateDisconnected  = "disconnected"
	claimStateUnclaimed     = "unclaimed"
	defaultRosterVersion    = 1
	recordingHealthHealthy  = "healthy"
	recordingStateDraining  = "draining"
	recordingStateFailed    = "failed"
	recordingStateRecording = "recording"
	recordingStateStopped   = "stopped"
	recordingStateWaiting   = "waiting"
	roleGuest               = "guest"
	roleHost                = "host"
)

var gooseDialectOnce sync.Once

type store struct {
	config             Config
	db                 *sql.DB
	mu                 sync.Mutex
	recordingEpochID   string
	recordingEpochZero time.Time
}

type pickerSeat struct {
	ParticipantSeatID string `json:"participant_seat_id"`
	DisplayName       string `json:"display_name"`
	PickerState       string `json:"picker_state"`
}

type pickerResult struct {
	SessionID   string       `json:"session_id"`
	Role        string       `json:"role"`
	Seats       []pickerSeat `json:"seats"`
	OwnedSeatID *string      `json:"owned_seat_id"`
}

type claimResult struct {
	SessionID         string       `json:"session_id"`
	ParticipantSeatID string       `json:"participant_seat_id"`
	Role              string       `json:"role"`
	ClaimState        string       `json:"claim_state"`
	ClaimVersion      int          `json:"claim_version"`
	LiveKit           liveKitToken `json:"livekit"`
}

type liveKitToken struct {
	Room                string `json:"room"`
	ParticipantIdentity string `json:"participant_identity"`
	Token               string `json:"token"`
}

type sessionView struct {
	SessionID               string  `json:"session_id"`
	ParticipantSeatID       string  `json:"participant_seat_id"`
	Role                    string  `json:"role"`
	RecordingState          string  `json:"recording_state"`
	RecordingHealth         string  `json:"recording_health"`
	RecordingEpochID        *string `json:"recording_epoch_id"`
	RecordingEpochStartedAt *string `json:"recording_epoch_started_at"`
}

type recordingSnapshot struct {
	SessionID               string  `json:"session_id"`
	RecordingState          string  `json:"recording_state"`
	RecordingHealth         string  `json:"recording_health"`
	RecordingEpochID        *string `json:"recording_epoch_id"`
	RecordingEpochStartedAt *string `json:"recording_epoch_started_at"`
}

type clockSyncResult struct {
	RecordingEpochID        string `json:"recording_epoch_id"`
	RecordingState          string `json:"recording_state"`
	RecordingHealth         string `json:"recording_health"`
	RecordingEpochStartedAt string `json:"recording_epoch_started_at"`
	RecordingEpochElapsedUS int64  `json:"recording_epoch_elapsed_us"`
	ServerProcessingTimeUS  int64  `json:"server_processing_time_us"`
}

type claimCookie struct {
	ParticipantSeatID string `json:"participant_seat_id"`
	ClaimVersion      int    `json:"claim_version"`
	Secret            string `json:"secret"`
}

type snapshotRow struct {
	SessionID               string
	HostJoinKeyHash         []byte
	GuestJoinKeyHash        []byte
	RecordingState          string
	RecordingHealth         string
	RecordingEpochID        sql.NullString
	RecordingEpochStartedAt sql.NullString
}

type seatClaimRow struct {
	ParticipantSeatID string
	SessionID         string
	Role              string
	DisplayName       string
	ClaimSecretHash   []byte
	State             string
	ClaimVersion      int
}

func openStore(ctx context.Context, cfg Config) (*store, error) {
	db, err := sql.Open("sqlite", cfg.SQLitePath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite %s: %w", cfg.SQLitePath, err)
	}

	if err := applySQLitePragmas(db); err != nil {
		db.Close()
		return nil, err
	}
	if err := applyMigrations(db); err != nil {
		db.Close()
		return nil, err
	}

	store := &store{config: cfg, db: db}
	if err := store.ensureBootstrapped(ctx); err != nil {
		db.Close()
		return nil, err
	}
	if err := store.loadRecordingClockAnchor(ctx); err != nil {
		db.Close()
		return nil, err
	}

	return store, nil
}

func applySQLitePragmas(db *sql.DB) error {
	for _, pragma := range []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA busy_timeout = 5000",
	} {
		if _, err := db.Exec(pragma); err != nil {
			return fmt.Errorf("apply sqlite pragma %q: %w", pragma, err)
		}
	}

	return nil
}

func applyMigrations(db *sql.DB) error {
	gooseDialectOnce.Do(func() {
		goose.SetBaseFS(sessiondmigrations.Files)
	})

	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("set goose sqlite dialect: %w", err)
	}
	if err := goose.Up(db, "."); err != nil {
		return fmt.Errorf("apply sessiond sqlite migrations: %w", err)
	}

	return nil
}

func (s *store) close() error {
	return s.db.Close()
}

func (s *store) ensureBootstrapped(ctx context.Context) error {
	if err := s.config.Bootstrap.validate(); err != nil {
		return fmt.Errorf("validate sessiond bootstrap config: %w", err)
	}

	count, err := countRows(ctx, s.db, "select count(*) from session_snapshot")
	if err != nil {
		return fmt.Errorf("check session snapshot bootstrap state: %w", err)
	}
	if count > 0 {
		snapshot, err := s.loadSnapshot(ctx)
		if err != nil {
			return err
		}
		if snapshot.SessionID != s.config.SessionID {
			return fmt.Errorf(
				"sessiond sqlite snapshot serves session %s, but config requests %s",
				snapshot.SessionID,
				s.config.SessionID,
			)
		}
		seats, err := s.loadBootstrapSeats(ctx)
		if err != nil {
			return err
		}
		if err := s.ensureBootstrapMatchesConfig(snapshot, seats); err != nil {
			return err
		}

		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin sessiond bootstrap transaction: %w", err)
	}
	defer tx.Rollback()

	now := timestampNow()
	if _, err := tx.ExecContext(
		ctx,
		`insert into session_snapshot (
			session_id,
			host_join_key_hash,
			guest_join_key_hash,
			roster_version,
			recording_state,
			recording_health,
			updated_at
		) values (?, ?, ?, ?, ?, ?, ?)`,
		s.config.SessionID,
		hashSecret(s.config.Bootstrap.HostJoinKey),
		hashSecret(s.config.Bootstrap.GuestJoinKey),
		defaultRosterVersion,
		recordingStateWaiting,
		recordingHealthHealthy,
		now,
	); err != nil {
		return fmt.Errorf("insert sessiond bootstrap snapshot: %w", err)
	}

	seats := append([]BootstrapSeat(nil), s.config.Bootstrap.Seats...)
	sort.Slice(seats, func(left int, right int) bool {
		return seats[left].DisplayName < seats[right].DisplayName
	})

	for _, seat := range seats {
		if _, err := tx.ExecContext(
			ctx,
			`insert into participant_seats (id, session_id, role, display_name, last_synced_at)
			 values (?, ?, ?, ?, ?)`,
			seat.ID,
			s.config.SessionID,
			seat.Role,
			seat.DisplayName,
			now,
		); err != nil {
			return fmt.Errorf("insert bootstrap participant seat %s: %w", seat.ID, err)
		}
		if _, err := tx.ExecContext(
			ctx,
			`insert into seat_claims (participant_seat_id, state, claim_version, updated_at)
			 values (?, ?, 0, ?)`,
			seat.ID,
			claimStateUnclaimed,
			now,
		); err != nil {
			return fmt.Errorf("insert bootstrap seat claim %s: %w", seat.ID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit sessiond bootstrap snapshot: %w", err)
	}

	return nil
}

func (s *store) loadSnapshot(ctx context.Context) (snapshotRow, error) {
	row := s.db.QueryRowContext(
		ctx,
		`select session_id,
		        host_join_key_hash,
		        guest_join_key_hash,
		        recording_state,
		        recording_health,
		        recording_epoch_id,
		        recording_epoch_started_at
		 from session_snapshot
		 where session_id = ?`,
		s.config.SessionID,
	)

	var snapshot snapshotRow
	if err := row.Scan(
		&snapshot.SessionID,
		&snapshot.HostJoinKeyHash,
		&snapshot.GuestJoinKeyHash,
		&snapshot.RecordingState,
		&snapshot.RecordingHealth,
		&snapshot.RecordingEpochID,
		&snapshot.RecordingEpochStartedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return snapshotRow{}, fmt.Errorf("session snapshot %s is missing from sqlite", s.config.SessionID)
		}
		return snapshotRow{}, fmt.Errorf("load session snapshot %s: %w", s.config.SessionID, err)
	}

	return snapshot, nil
}

func hashSecret(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func timestampNow() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func parseStoredTimestamp(raw string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, raw)
}

func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	copyValue := value.String
	return &copyValue
}

func randomID(prefix string) (string, error) {
	suffix, err := randomHex(10)
	if err != nil {
		return "", err
	}

	return prefix + "_" + suffix, nil
}

func randomHex(bytesLen int) (string, error) {
	raw := make([]byte, bytesLen)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	return hex.EncodeToString(raw), nil
}

func (s *store) loadBootstrapSeats(ctx context.Context) ([]BootstrapSeat, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`select id, role, display_name
		 from participant_seats
		 where session_id = ?
		 order by id`,
		s.config.SessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("query participant seats for session %s: %w", s.config.SessionID, err)
	}
	defer rows.Close()

	var seats []BootstrapSeat
	for rows.Next() {
		var seat BootstrapSeat
		if err := rows.Scan(&seat.ID, &seat.Role, &seat.DisplayName); err != nil {
			return nil, fmt.Errorf("scan participant seat for session %s: %w", s.config.SessionID, err)
		}
		seats = append(seats, seat)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate participant seats for session %s: %w", s.config.SessionID, err)
	}

	return seats, nil
}

func (s *store) ensureBootstrapMatchesConfig(snapshot snapshotRow, seats []BootstrapSeat) error {
	differences := make([]string, 0, 4)
	if !bytes.Equal(snapshot.HostJoinKeyHash, hashSecret(s.config.Bootstrap.HostJoinKey)) {
		differences = append(differences, "host join key changed")
	}
	if !bytes.Equal(snapshot.GuestJoinKeyHash, hashSecret(s.config.Bootstrap.GuestJoinKey)) {
		differences = append(differences, "guest join key changed")
	}

	configSeats := make(map[string]BootstrapSeat, len(s.config.Bootstrap.Seats))
	for _, seat := range s.config.Bootstrap.Seats {
		configSeats[seat.ID] = seat
	}
	sqliteSeats := make(map[string]BootstrapSeat, len(seats))
	for _, seat := range seats {
		sqliteSeats[seat.ID] = seat
	}

	seatIDs := make([]string, 0, len(configSeats)+len(sqliteSeats))
	seenSeatIDs := make(map[string]struct{}, len(configSeats)+len(sqliteSeats))
	for seatID := range configSeats {
		seatIDs = append(seatIDs, seatID)
		seenSeatIDs[seatID] = struct{}{}
	}
	for seatID := range sqliteSeats {
		if _, seen := seenSeatIDs[seatID]; seen {
			continue
		}
		seatIDs = append(seatIDs, seatID)
	}
	sort.Strings(seatIDs)

	for _, seatID := range seatIDs {
		configSeat, configOK := configSeats[seatID]
		sqliteSeat, sqliteOK := sqliteSeats[seatID]
		switch {
		case !configOK:
			differences = append(differences, fmt.Sprintf("sqlite keeps unexpected seat %s", seatID))
		case !sqliteOK:
			differences = append(differences, fmt.Sprintf("sqlite is missing configured seat %s", seatID))
		default:
			if configSeat.Role != sqliteSeat.Role {
				differences = append(differences, fmt.Sprintf("seat %s role changed from %s to %s", seatID, sqliteSeat.Role, configSeat.Role))
			}
			if configSeat.DisplayName != sqliteSeat.DisplayName {
				differences = append(differences, fmt.Sprintf("seat %s display_name changed from %q to %q", seatID, sqliteSeat.DisplayName, configSeat.DisplayName))
			}
		}
	}

	if len(differences) == 0 {
		return nil
	}

	return fmt.Errorf(
		"sessiond sqlite bootstrap state drifted from config for session %s: %s; reset sqlite state at %s or restore matching bootstrap config",
		s.config.SessionID,
		strings.Join(differences, "; "),
		s.config.SQLitePath,
	)
}

func (s *store) ensureSQLiteWritable(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin sqlite writable probe: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`update session_snapshot set updated_at = updated_at where session_id = ?`,
		s.config.SessionID,
	); err != nil {
		tx.Rollback()
		return fmt.Errorf("probe sqlite write access for session %s: %w", s.config.SessionID, err)
	}
	if err := tx.Rollback(); err != nil {
		return fmt.Errorf("rollback sqlite writable probe: %w", err)
	}

	return nil
}

func countRows(ctx context.Context, db *sql.DB, query string) (int, error) {
	var count int
	if err := db.QueryRowContext(ctx, query).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func encodeClaimCookie(cookie claimCookie) (string, error) {
	raw, err := json.Marshal(cookie)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func decodeClaimCookie(rawCookie string) (claimCookie, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(rawCookie)
	if err != nil {
		return claimCookie{}, err
	}
	var cookie claimCookie
	if err := json.Unmarshal(decoded, &cookie); err != nil {
		return claimCookie{}, err
	}
	if strings.TrimSpace(cookie.ParticipantSeatID) == "" || strings.TrimSpace(cookie.Secret) == "" || cookie.ClaimVersion <= 0 {
		return claimCookie{}, fmt.Errorf("claim cookie payload is incomplete")
	}

	return cookie, nil
}
