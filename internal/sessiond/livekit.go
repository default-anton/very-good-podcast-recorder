package sessiond

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func issueLiveKitToken(cfg Config, claim seatClaimRow) (liveKitToken, error) {
	apiKey := strings.TrimSpace(cfg.LiveKit.APIKey)
	apiSecret := strings.TrimSpace(cfg.LiveKit.APISecret)
	if apiKey == "" || apiSecret == "" {
		return liveKitToken{}, fmt.Errorf("sessiond livekit api_key and api_secret are required to mint claim tokens")
	}

	issuedAt := time.Now().UTC()
	metadata, err := json.Marshal(map[string]string{
		"participant_seat_id": claim.ParticipantSeatID,
		"role":                claim.Role,
		"session_id":          claim.SessionID,
	})
	if err != nil {
		return liveKitToken{}, fmt.Errorf("encode livekit metadata for seat %s: %w", claim.ParticipantSeatID, err)
	}

	payload := map[string]any{
		"exp":      issuedAt.Add(6 * time.Hour).Unix(),
		"iat":      issuedAt.Unix(),
		"iss":      apiKey,
		"metadata": string(metadata),
		"name":     claim.DisplayName,
		"nbf":      issuedAt.Unix(),
		"sub":      claim.ParticipantSeatID,
		"video": map[string]any{
			"room":     cfg.SessionID,
			"roomJoin": true,
		},
	}

	token, err := signJWT(payload, apiSecret)
	if err != nil {
		return liveKitToken{}, fmt.Errorf("sign livekit token for seat %s: %w", claim.ParticipantSeatID, err)
	}

	return liveKitToken{
		Room:                cfg.SessionID,
		ParticipantIdentity: claim.ParticipantSeatID,
		Token:               token,
	}, nil
}

func signJWT(payload map[string]any, secret string) (string, error) {
	headerJSON, err := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		return "", err
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	encodedHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadJSON)
	unsigned := encodedHeader + "." + encodedPayload

	hasher := hmac.New(sha256.New, []byte(secret))
	if _, err := hasher.Write([]byte(unsigned)); err != nil {
		return "", err
	}
	signature := base64.RawURLEncoding.EncodeToString(hasher.Sum(nil))

	return unsigned + "." + signature, nil
}
