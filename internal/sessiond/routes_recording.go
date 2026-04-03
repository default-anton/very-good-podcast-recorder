package sessiond

import (
	"net/http"
	"time"
)

func (s *Server) handleSessionSnapshot(writer http.ResponseWriter, request *http.Request) {
	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, err := store.sessionSnapshot(request.Context(), claimCookieValue(request))
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	writeJSON(writer, http.StatusOK, response)
}

func (s *Server) handleStartRecording(writer http.ResponseWriter, request *http.Request) {
	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, statusCode, err := store.startRecording(request.Context(), claimCookieValue(request))
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	writeJSON(writer, statusCode, response)
}

func (s *Server) handleClockSync(writer http.ResponseWriter, request *http.Request) {
	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, err := store.clockSync(request.Context(), claimCookieValue(request), time.Now())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	writeJSON(writer, http.StatusOK, response)
}

func (s *Server) handleStopRecording(writer http.ResponseWriter, request *http.Request) {
	store, err := s.ensureStore(request.Context())
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	response, err := store.stopRecording(request.Context(), claimCookieValue(request))
	if err != nil {
		writeRequestError(writer, err)
		return
	}

	writeJSON(writer, http.StatusOK, response)
}
