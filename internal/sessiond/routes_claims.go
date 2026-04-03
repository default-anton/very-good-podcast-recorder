package sessiond

import "net/http"

type seatPickerRequest struct {
	SessionID string `json:"session_id"`
	Role      string `json:"role"`
	JoinKey   string `json:"join_key"`
}

type claimSeatRequest struct {
	SessionID         string `json:"session_id"`
	Role              string `json:"role"`
	JoinKey           string `json:"join_key"`
	ParticipantSeatID string `json:"participant_seat_id"`
}

type reclaimSeatRequest struct {
	SessionID string `json:"session_id"`
	Role      string `json:"role"`
	JoinKey   string `json:"join_key"`
}

func (s *Server) handleSeatPicker(writer http.ResponseWriter, request *http.Request) {
	var body seatPickerRequest
	if err := decodeJSONBody(request, &body); err != nil {
		writeRequestError(writer, err)
		return
	}

	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, err := store.seatPicker(request.Context(), body.SessionID, body.Role, body.JoinKey, claimCookieValue(request))
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	writeJSON(writer, http.StatusOK, response)
}

func (s *Server) handleClaimSeat(writer http.ResponseWriter, request *http.Request) {
	var body claimSeatRequest
	if err := decodeJSONBody(request, &body); err != nil {
		writeRequestError(writer, err)
		return
	}

	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, cookieValue, statusCode, err := store.claimSeat(
		request.Context(),
		body.SessionID,
		body.Role,
		body.JoinKey,
		body.ParticipantSeatID,
		claimCookieValue(request),
	)
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	setClaimCookie(writer, request, cookieValue)
	writeJSON(writer, statusCode, response)
}

func (s *Server) handleReclaimSeat(writer http.ResponseWriter, request *http.Request) {
	var body reclaimSeatRequest
	if err := decodeJSONBody(request, &body); err != nil {
		writeRequestError(writer, err)
		return
	}

	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, cookieValue, err := store.reclaimSeat(
		request.Context(),
		body.SessionID,
		body.Role,
		body.JoinKey,
		claimCookieValue(request),
	)
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	setClaimCookie(writer, request, cookieValue)
	writeJSON(writer, http.StatusOK, response)
}
