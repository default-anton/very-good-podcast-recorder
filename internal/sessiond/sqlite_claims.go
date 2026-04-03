package sessiond

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

func (s *store) seatPicker(ctx context.Context, sessionID string, role string, joinKey string, rawCookie string) (pickerResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.validateJoinKey(ctx, sessionID, role, joinKey); err != nil {
		return pickerResult{}, err
	}

	ownedSeatID, err := s.ownedSeatIDForRole(ctx, rawCookie, role)
	if err != nil {
		return pickerResult{}, err
	}

	rows, err := s.db.QueryContext(
		ctx,
		`select p.id, p.display_name, c.state
		 from participant_seats p
		 join seat_claims c on c.participant_seat_id = p.id
		 where p.session_id = ? and p.role = ?
		 order by p.display_name`,
		sessionID,
		role,
	)
	if err != nil {
		return pickerResult{}, fmt.Errorf("query seat picker rows: %w", err)
	}
	defer rows.Close()

	response := pickerResult{SessionID: sessionID, Role: role}
	if ownedSeatID != "" {
		response.OwnedSeatID = &ownedSeatID
	}

	for rows.Next() {
		var seatID string
		var displayName string
		var state string
		if err := rows.Scan(&seatID, &displayName, &state); err != nil {
			return pickerResult{}, fmt.Errorf("scan seat picker row: %w", err)
		}

		response.Seats = append(response.Seats, pickerSeat{
			ParticipantSeatID: seatID,
			DisplayName:       displayName,
			PickerState:       pickerStateFor(state, ownedSeatID == seatID),
		})
	}
	if err := rows.Err(); err != nil {
		return pickerResult{}, fmt.Errorf("iterate seat picker rows: %w", err)
	}

	return response, nil
}

func (s *store) claimSeat(
	ctx context.Context,
	sessionID string,
	role string,
	joinKey string,
	participantSeatID string,
	rawCookie string,
) (claimResult, string, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.validateJoinKey(ctx, sessionID, role, joinKey); err != nil {
		return claimResult{}, "", 0, err
	}
	if strings.TrimSpace(participantSeatID) == "" {
		return claimResult{}, "", 0, requestBadRequest("invalid_request", "participant_seat_id is required")
	}

	currentClaim, err := s.lookupClaim(ctx, rawCookie)
	if err != nil {
		return claimResult{}, "", 0, err
	}
	if currentClaim != nil {
		if currentClaim.Role != role {
			return claimResult{}, "", 0, requestConflict(
				"seat_already_owned",
				fmt.Sprintf("browser already owns seat %s; reclaim or clear that claim before choosing a different seat", currentClaim.ParticipantSeatID),
			)
		}
		if currentClaim.ParticipantSeatID != participantSeatID {
			return claimResult{}, "", 0, requestConflict(
				"seat_already_owned",
				fmt.Sprintf("browser already owns seat %s; reclaim it instead of silently switching seats", currentClaim.ParticipantSeatID),
			)
		}

		cookie, err := decodeClaimCookie(rawCookie)
		if err != nil {
			return claimResult{}, "", 0, requestUnauthorized(
				"invalid_claim",
				"claim cookie became unreadable before the seat could be reclaimed",
			)
		}
		result, cookieValue, err := s.reactivateClaim(ctx, currentClaim, cookie.Secret)
		if err != nil {
			return claimResult{}, "", 0, err
		}
		return result, cookieValue, http.StatusOK, nil
	}

	row, err := s.loadSeatClaim(ctx, participantSeatID)
	if err != nil {
		return claimResult{}, "", 0, err
	}
	if row == nil {
		return claimResult{}, "", 0, requestNotFound(
			"seat_not_found",
			fmt.Sprintf("seat %s does not exist on session %s", participantSeatID, sessionID),
		)
	}
	if row.SessionID != sessionID {
		return claimResult{}, "", 0, requestForbidden(
			"seat_access_denied",
			fmt.Sprintf("seat %s does not belong to session %s", participantSeatID, sessionID),
		)
	}
	if row.Role != role {
		return claimResult{}, "", 0, requestForbidden(
			"seat_access_denied",
			fmt.Sprintf("role %s may not claim seat %s", role, participantSeatID),
		)
	}
	if row.State == claimStateActive {
		return claimResult{}, "", 0, requestConflict(
			"seat_in_use",
			fmt.Sprintf("seat %s is already owned by another browser; explicit takeover is required", participantSeatID),
		)
	}

	secret, err := randomHex(32)
	if err != nil {
		return claimResult{}, "", 0, fmt.Errorf("mint claim secret for seat %s: %w", participantSeatID, err)
	}
	updatedAt := timestampNow()
	lastSeenAt := updatedAt
	claimVersion := row.ClaimVersion + 1
	claimedSeat := *row
	claimedSeat.State = claimStateActive
	claimedSeat.ClaimVersion = claimVersion
	result, cookieValue, err := s.claimSuccessResponse(claimedSeat, secret)
	if err != nil {
		return claimResult{}, "", 0, err
	}
	if _, err := s.db.ExecContext(
		ctx,
		`update seat_claims
		 set claim_secret_hash = ?,
		     state = ?,
		     current_connection_id = null,
		     last_seen_at = ?,
		     claim_version = ?,
		     updated_at = ?
		 where participant_seat_id = ?`,
		hashSecret(secret),
		claimStateActive,
		lastSeenAt,
		claimVersion,
		updatedAt,
		participantSeatID,
	); err != nil {
		return claimResult{}, "", 0, fmt.Errorf("activate seat claim %s: %w", participantSeatID, err)
	}

	return result, cookieValue, http.StatusCreated, nil
}

func (s *store) reclaimSeat(ctx context.Context, sessionID string, role string, joinKey string, rawCookie string) (claimResult, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.validateJoinKey(ctx, sessionID, role, joinKey); err != nil {
		return claimResult{}, "", err
	}

	claim, err := s.lookupClaim(ctx, rawCookie)
	if err != nil {
		return claimResult{}, "", err
	}
	if claim == nil {
		return claimResult{}, "", requestUnauthorized(
			"invalid_claim",
			"reclaim requires the current claim cookie for this browser",
		)
	}
	if claim.SessionID != sessionID {
		return claimResult{}, "", requestUnauthorized(
			"invalid_claim",
			"claim cookie does not belong to this session",
		)
	}
	if claim.Role != role {
		return claimResult{}, "", requestUnauthorized(
			"invalid_claim",
			"claim cookie does not belong to the requested role link",
		)
	}
	if claim.State != claimStateActive && claim.State != claimStateDisconnected {
		return claimResult{}, "", requestConflict(
			"invalid_reclaim_target",
			fmt.Sprintf("seat %s is not recoverable with reclaim while claim state is %s", claim.ParticipantSeatID, claim.State),
		)
	}

	cookie, err := decodeClaimCookie(rawCookie)
	if err != nil {
		return claimResult{}, "", requestUnauthorized(
			"invalid_claim",
			"claim cookie became unreadable before the seat could be reclaimed",
		)
	}
	result, cookieValue, err := s.reactivateClaim(ctx, claim, cookie.Secret)
	if err != nil {
		return claimResult{}, "", err
	}

	return result, cookieValue, nil
}

func (s *store) reactivateClaim(ctx context.Context, claim *seatClaimRow, secret string) (claimResult, string, error) {
	activatedClaim := *claim
	activatedClaim.State = claimStateActive
	result, cookieValue, err := s.claimSuccessResponse(activatedClaim, secret)
	if err != nil {
		return claimResult{}, "", err
	}

	updatedAt := timestampNow()
	if _, err := s.db.ExecContext(
		ctx,
		`update seat_claims
		 set state = ?,
		     last_seen_at = ?,
		     updated_at = ?
		 where participant_seat_id = ?`,
		claimStateActive,
		updatedAt,
		updatedAt,
		claim.ParticipantSeatID,
	); err != nil {
		return claimResult{}, "", fmt.Errorf("reactivate seat claim %s: %w", claim.ParticipantSeatID, err)
	}
	claim.State = claimStateActive

	return result, cookieValue, nil
}

func (s *store) claimSuccessResponse(claim seatClaimRow, secret string) (claimResult, string, error) {
	liveKit, err := issueLiveKitToken(s.config, claim)
	if err != nil {
		return claimResult{}, "", err
	}
	cookieValue, err := encodeClaimCookie(claimCookie{ParticipantSeatID: claim.ParticipantSeatID, ClaimVersion: claim.ClaimVersion, Secret: secret})
	if err != nil {
		return claimResult{}, "", fmt.Errorf("encode claim cookie for seat %s: %w", claim.ParticipantSeatID, err)
	}

	return claimResult{
		SessionID:         claim.SessionID,
		ParticipantSeatID: claim.ParticipantSeatID,
		Role:              claim.Role,
		ClaimState:        claimStateActive,
		ClaimVersion:      claim.ClaimVersion,
		LiveKit:           liveKit,
	}, cookieValue, nil
}

func (s *store) requireActiveClaim(ctx context.Context, rawCookie string) (*seatClaimRow, error) {
	claim, err := s.lookupClaim(ctx, rawCookie)
	if err != nil {
		return nil, err
	}
	if claim == nil || claim.State != claimStateActive {
		return nil, requestUnauthorized(
			"invalid_claim",
			"request requires the current active seat claim cookie",
		)
	}

	return claim, nil
}

func (s *store) ownedSeatIDForRole(ctx context.Context, rawCookie string, role string) (string, error) {
	claim, err := s.lookupClaim(ctx, rawCookie)
	if err != nil {
		return "", err
	}
	if claim == nil || claim.Role != role {
		return "", nil
	}
	if claim.State != claimStateActive && claim.State != claimStateDisconnected {
		return "", nil
	}

	return claim.ParticipantSeatID, nil
}

func (s *store) lookupClaim(ctx context.Context, rawCookie string) (*seatClaimRow, error) {
	if strings.TrimSpace(rawCookie) == "" {
		return nil, nil
	}
	cookie, err := decodeClaimCookie(rawCookie)
	if err != nil {
		return nil, nil
	}
	row, err := s.loadSeatClaim(ctx, cookie.ParticipantSeatID)
	if err != nil {
		return nil, err
	}
	if row == nil || len(row.ClaimSecretHash) == 0 {
		return nil, nil
	}
	if row.ClaimVersion != cookie.ClaimVersion {
		return nil, nil
	}
	if subtle.ConstantTimeCompare(row.ClaimSecretHash, hashSecret(cookie.Secret)) != 1 {
		return nil, nil
	}

	return row, nil
}

func (s *store) validateJoinKey(ctx context.Context, sessionID string, role string, joinKey string) error {
	if strings.TrimSpace(sessionID) == "" {
		return requestBadRequest("invalid_request", "session_id is required")
	}
	if sessionID != s.config.SessionID {
		return requestNotFound(
			"session_not_found",
			fmt.Sprintf("session %s is not hosted by this sessiond process", sessionID),
		)
	}
	if role != roleHost && role != roleGuest {
		return requestBadRequest("invalid_request", fmt.Sprintf("role must be %s or %s", roleHost, roleGuest))
	}
	if strings.TrimSpace(joinKey) == "" {
		return requestBadRequest("invalid_request", "join_key is required")
	}

	snapshot, err := s.loadSnapshot(ctx)
	if err != nil {
		return err
	}

	storedHash := snapshot.GuestJoinKeyHash
	if role == roleHost {
		storedHash = snapshot.HostJoinKeyHash
	}
	if subtle.ConstantTimeCompare(storedHash, hashSecret(joinKey)) != 1 {
		return requestUnauthorized(
			"invalid_join_key",
			fmt.Sprintf("join key does not match the %s link for session %s", role, sessionID),
		)
	}

	return nil
}

func (s *store) loadSeatClaim(ctx context.Context, participantSeatID string) (*seatClaimRow, error) {
	row := s.db.QueryRowContext(
		ctx,
		`select p.id,
		        p.session_id,
		        p.role,
		        p.display_name,
		        c.claim_secret_hash,
		        c.state,
		        c.claim_version
		 from participant_seats p
		 join seat_claims c on c.participant_seat_id = p.id
		 where p.id = ?`,
		participantSeatID,
	)

	var claim seatClaimRow
	if err := row.Scan(
		&claim.ParticipantSeatID,
		&claim.SessionID,
		&claim.Role,
		&claim.DisplayName,
		&claim.ClaimSecretHash,
		&claim.State,
		&claim.ClaimVersion,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("load seat claim %s: %w", participantSeatID, err)
	}

	return &claim, nil
}

func pickerStateFor(claimState string, owned bool) string {
	if owned {
		return "you"
	}

	switch claimState {
	case claimStateActive:
		return "in_use"
	case claimStateDisconnected:
		return "rejoin_available"
	default:
		return "available"
	}
}
