import type {
  JoinDemoPreset,
  JoinRole,
  LocalCaptureStatus,
  OwnershipStatus,
  RecordingPhase,
  RoomDemoPreset,
  SessionSeat,
  SessionShell,
  UploadStatus,
} from "./types";

export const DEFAULT_SESSION_ID = "amber-session-01";
export const MIC_OPTIONS = ["Studio USB", "Boom Mic", "USB Backup"];
export const CAMERA_OPTIONS = ["Desk Cam", "Mirrorless HDMI", "Laptop Camera"];

export interface SessionAppState {
  joinPreset: JoinDemoPreset;
  roomPreset: RoomDemoPreset;
  session: SessionShell;
  takeoverSeatId: string | null;
}

export type SessionAppAction =
  | { preset: JoinDemoPreset; type: "apply-join-preset" }
  | { preset: RoomDemoPreset; type: "apply-room-preset" }
  | { seatId: string; type: "choose-seat" }
  | { type: "clear-seat-selection" }
  | { type: "confirm-takeover" }
  | { type: "dismiss-takeover" }
  | { type: "fail-recording" }
  | { type: "finish-drain" }
  | { type: "join-room" }
  | { type: "leave-room" }
  | { value: string; type: "select-local-camera" }
  | { value: string; type: "select-local-mic" }
  | { value: string; type: "select-preview-camera" }
  | { value: string; type: "select-preview-mic" }
  | { type: "start-recording" }
  | { type: "stop-recording" }
  | { type: "toggle-local-camera" }
  | { type: "toggle-local-mic" }
  | { type: "toggle-local-screen-share" };

export function createInitialAppState({
  role,
  sessionId,
}: {
  role: JoinRole;
  sessionId: string;
}): SessionAppState {
  return {
    joinPreset: "fresh",
    roomPreset: "steady",
    session: buildSessionForJoinPreset(sessionId, role, "fresh", MIC_OPTIONS[0], CAMERA_OPTIONS[0]),
    takeoverSeatId: null,
  };
}

export function presentSession(state: SessionAppState) {
  const normalized = normalizeSessionState(state.session);

  if (state.roomPreset === "steady" || normalized.joinedSeatId === null) {
    return normalized;
  }

  return applyRoomDemoPreset(normalized, state.roomPreset);
}

export function sessionAppReducer(
  state: SessionAppState,
  action: SessionAppAction,
): SessionAppState {
  switch (action.type) {
    case "apply-join-preset": {
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      const session = buildSessionForJoinPreset(
        state.session.id,
        state.session.role,
        action.preset,
        state.session.previewMic,
        state.session.previewCamera,
      );

      return {
        joinPreset: action.preset,
        roomPreset: "steady",
        session,
        takeoverSeatId: null,
      };
    }
    case "apply-room-preset":
      return {
        ...state,
        roomPreset: action.preset,
      };
    case "choose-seat": {
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      const seat = state.session.seats.find((currentSeat) => currentSeat.id === action.seatId);

      if (seat === undefined || seat.role !== state.session.role) {
        return state;
      }

      if (seat.pickerState === "in_use") {
        return {
          ...state,
          takeoverSeatId: seat.id,
        };
      }

      return updateSessionState(state, claimSeat(state.session, seat.id));
    }
    case "clear-seat-selection":
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        selectedSeatId: null,
      });
    case "confirm-takeover":
      if (state.session.joinedSeatId !== null || state.takeoverSeatId === null) {
        return state;
      }

      return {
        ...updateSessionState(state, claimSeat(state.session, state.takeoverSeatId)),
        takeoverSeatId: null,
      };
    case "dismiss-takeover":
      return {
        ...state,
        takeoverSeatId: null,
      };
    case "fail-recording":
      if (state.session.role !== "host" || state.session.joinedSeatId === null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        recordingHealth: "failed",
        recordingPhase: "failed",
      });
    case "finish-drain":
      if (state.session.recordingPhase !== "draining") {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        recordingPhase: "stopped",
      });
    case "join-room": {
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      const selectedSeatId = state.session.selectedSeatId;

      if (selectedSeatId === null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        joinedSeatId: selectedSeatId,
        ownedSeatId: selectedSeatId,
        seats: state.session.seats.map((seat) => {
          if (seat.id !== selectedSeatId) {
            return seat;
          }

          return {
            ...seat,
            claimState: "active",
            joined: true,
            ownershipStatus: "clear",
            selectedCamera: state.session.previewCamera,
            selectedMic: state.session.previewMic,
          };
        }),
      });
    }
    case "leave-room": {
      const joinedSeatId = state.session.joinedSeatId;

      if (joinedSeatId === null) {
        return state;
      }

      const disconnectOnLeave = shouldModelDisconnect(state.session.recordingPhase);

      return updateSessionState(state, {
        ...state.session,
        joinedSeatId: null,
        selectedSeatId: null,
        seats: state.session.seats.map((seat) => {
          if (seat.id !== joinedSeatId) {
            return seat;
          }

          return {
            ...seat,
            claimState: disconnectOnLeave ? "disconnected" : "active",
            joined: false,
            ownershipStatus: "clear",
            screenShareActive: false,
          };
        }),
      });
    }
    case "select-local-camera":
      return updateSessionState(
        state,
        updateLocalSeat(state.session, { selectedCamera: action.value }),
      );
    case "select-local-mic":
      return updateSessionState(
        state,
        updateLocalSeat(state.session, { selectedMic: action.value }),
      );
    case "select-preview-camera":
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        previewCamera: action.value,
      });
    case "select-preview-mic":
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        previewMic: action.value,
      });
    case "start-recording":
      if (state.session.role !== "host" || state.session.joinedSeatId === null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        recordingHealth: "healthy",
        recordingPhase: "recording",
      });
    case "stop-recording":
      if (state.session.role !== "host" || state.session.recordingPhase !== "recording") {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        recordingPhase: "draining",
      });
    case "toggle-local-camera": {
      const localSeat = getLocalSeat(state.session);

      if (localSeat === null) {
        return state;
      }

      return updateSessionState(
        state,
        updateLocalSeat(state.session, { cameraEnabled: !localSeat.cameraEnabled }),
      );
    }
    case "toggle-local-mic": {
      const localSeat = getLocalSeat(state.session);

      if (localSeat === null) {
        return state;
      }

      return updateSessionState(
        state,
        updateLocalSeat(state.session, { micMuted: !localSeat.micMuted }),
      );
    }
    case "toggle-local-screen-share": {
      const localSeat = getLocalSeat(state.session);

      if (localSeat === null) {
        return state;
      }

      return updateSessionState(
        state,
        updateLocalSeat(state.session, { screenShareActive: !localSeat.screenShareActive }),
      );
    }
    default:
      return state;
  }
}

export function isJoinRole(value: string | undefined): value is JoinRole {
  return value === "host" || value === "guest";
}

function buildSessionForJoinPreset(
  sessionId: string,
  role: JoinRole,
  preset: JoinDemoPreset,
  previewMic = MIC_OPTIONS[0],
  previewCamera = CAMERA_OPTIONS[0],
): SessionShell {
  const session = createBaseSession(sessionId, role, previewMic, previewCamera);
  const roleSeats = session.seats.filter((seat) => seat.role === role);

  if (roleSeats.length === 0) {
    throw new Error("Session shell requires at least one seat for the active role.");
  }

  const [firstSeat, secondSeat, thirdSeat] = roleSeats;

  if (preset === "owned") {
    return normalizeSessionState({
      ...session,
      ownedSeatId: firstSeat.id,
      selectedSeatId: firstSeat.id,
      seats: session.seats.map((seat) => {
        if (seat.id === firstSeat.id) {
          return {
            ...seat,
            claimState: "active",
            joined: false,
          };
        }

        if (seat.id === secondSeat?.id) {
          return {
            ...seat,
            claimState: "active",
            joined: true,
          };
        }

        if (seat.id === thirdSeat?.id) {
          return {
            ...seat,
            claimState: "disconnected",
            joined: false,
          };
        }

        return seat;
      }),
    });
  }

  if (preset === "recover") {
    return normalizeSessionState({
      ...session,
      seats: session.seats.map((seat) => {
        if (seat.id === firstSeat.id) {
          return {
            ...seat,
            claimState: "disconnected",
            joined: false,
          };
        }

        if (seat.id === secondSeat?.id) {
          return {
            ...seat,
            claimState: "unclaimed",
            joined: false,
          };
        }

        if (seat.id === thirdSeat?.id) {
          return {
            ...seat,
            claimState: "active",
            joined: true,
          };
        }

        return seat;
      }),
    });
  }

  if (preset === "takeover") {
    return normalizeSessionState({
      ...session,
      seats: session.seats.map((seat) => {
        if (seat.id === firstSeat.id) {
          return {
            ...seat,
            claimState: "active",
            joined: true,
            ownershipStatus: "takeover_required",
          };
        }

        if (seat.id === secondSeat?.id) {
          return {
            ...seat,
            claimState: "unclaimed",
            joined: false,
          };
        }

        if (seat.id === thirdSeat?.id) {
          return {
            ...seat,
            claimState: "disconnected",
            joined: false,
          };
        }

        return seat;
      }),
    });
  }

  return normalizeSessionState({
    ...session,
    seats: session.seats.map((seat) => {
      if (seat.id === firstSeat.id) {
        return {
          ...seat,
          claimState: "unclaimed",
          joined: false,
        };
      }

      if (seat.id === secondSeat?.id) {
        return {
          ...seat,
          claimState: "active",
          joined: true,
        };
      }

      if (seat.id === thirdSeat?.id) {
        return {
          ...seat,
          claimState: "disconnected",
          joined: false,
        };
      }

      return seat;
    }),
  });
}

function createBaseSession(
  sessionId: string,
  role: JoinRole,
  previewMic: string,
  previewCamera: string,
): SessionShell {
  return {
    id: sessionId,
    joinedSeatId: null,
    ownedSeatId: null,
    previewCamera,
    previewMic,
    recordingHealth: "healthy",
    recordingPhase: "waiting",
    role,
    seats: role === "host" ? createHostDemoSeats() : createGuestDemoSeats(),
    selectedSeatId: null,
    title: "Late Night Tape Check",
  };
}

function createGuestDemoSeats(): SessionSeat[] {
  return [
    createSeat({
      cameraEnabled: true,
      claimState: "active",
      displayName: "Anton Host",
      id: "seat-host-01",
      joined: true,
      label: "Channel 01",
      micMuted: false,
      role: "host",
      selectedCamera: CAMERA_OPTIONS[0],
      selectedMic: MIC_OPTIONS[0],
    }),
    createSeat({
      cameraEnabled: true,
      claimState: "unclaimed",
      displayName: "Mara Chen",
      id: "seat-guest-02",
      joined: false,
      label: "Channel 02",
      micMuted: false,
      role: "guest",
      selectedCamera: CAMERA_OPTIONS[1],
      selectedMic: MIC_OPTIONS[1],
    }),
    createSeat({
      cameraEnabled: true,
      claimState: "active",
      displayName: "Jules Narrow-Layout-Name Test",
      id: "seat-guest-03",
      joined: true,
      label: "Channel 03",
      micMuted: false,
      role: "guest",
      selectedCamera: CAMERA_OPTIONS[2],
      selectedMic: MIC_OPTIONS[2],
    }),
    createSeat({
      cameraEnabled: false,
      claimState: "disconnected",
      displayName: "Dana Recovery",
      id: "seat-guest-04",
      joined: false,
      label: "Channel 04",
      micMuted: true,
      role: "guest",
      selectedCamera: CAMERA_OPTIONS[0],
      selectedMic: MIC_OPTIONS[2],
    }),
  ];
}

function createHostDemoSeats(): SessionSeat[] {
  return [
    createSeat({
      cameraEnabled: true,
      claimState: "unclaimed",
      displayName: "Anton Host",
      id: "seat-host-01",
      joined: false,
      label: "Channel 01",
      micMuted: false,
      role: "host",
      selectedCamera: CAMERA_OPTIONS[0],
      selectedMic: MIC_OPTIONS[0],
    }),
    createSeat({
      cameraEnabled: true,
      claimState: "active",
      displayName: "Producer Desk",
      id: "seat-host-02",
      joined: true,
      label: "Channel 02",
      micMuted: false,
      role: "host",
      selectedCamera: CAMERA_OPTIONS[1],
      selectedMic: MIC_OPTIONS[1],
    }),
    createSeat({
      cameraEnabled: true,
      claimState: "active",
      displayName: "Mara Chen",
      id: "seat-guest-03",
      joined: true,
      label: "Channel 03",
      micMuted: false,
      role: "guest",
      selectedCamera: CAMERA_OPTIONS[1],
      selectedMic: MIC_OPTIONS[1],
    }),
    createSeat({
      cameraEnabled: true,
      claimState: "disconnected",
      displayName: "Jules Narrow-Layout-Name Test",
      id: "seat-guest-04",
      joined: false,
      label: "Channel 04",
      micMuted: false,
      role: "guest",
      selectedCamera: CAMERA_OPTIONS[2],
      selectedMic: MIC_OPTIONS[2],
    }),
  ];
}

function createSeat({
  cameraEnabled,
  claimState,
  displayName,
  id,
  joined,
  label,
  micMuted,
  ownershipStatus = "clear",
  role,
  selectedCamera,
  selectedMic,
}: {
  cameraEnabled: boolean;
  claimState: SessionSeat["claimState"];
  displayName: string;
  id: string;
  joined: boolean;
  label: string;
  micMuted: boolean;
  ownershipStatus?: OwnershipStatus;
  role: JoinRole;
  selectedCamera: string;
  selectedMic: string;
}): SessionSeat {
  return {
    cameraEnabled,
    claimState,
    displayName,
    id,
    joined,
    label,
    liveCallStatus: joined ? "connected" : "disconnected",
    localCaptureStatus: "not_recording",
    micMuted,
    ownershipStatus,
    pickerState: "available",
    role,
    screenShareActive: false,
    selectedCamera,
    selectedMic,
    uploadStatus: "synced",
  };
}

function normalizeSessionState(session: SessionShell): SessionShell {
  return {
    ...session,
    seats: session.seats.map((seat) => normalizeSeat(session, seat)),
  };
}

function normalizeSeat(session: SessionShell, seat: SessionSeat): SessionSeat {
  const joined = seat.claimState === "active" && (seat.id === session.joinedSeatId || seat.joined);
  const ownedByCurrentBrowser = seat.id === session.ownedSeatId;
  const baseOwnershipStatus =
    seat.ownershipStatus === "takeover_required" ? "takeover_required" : "clear";
  const ownershipStatus =
    joined || seat.claimState !== "disconnected" ? baseOwnershipStatus : "rejoin_available";

  return {
    ...seat,
    joined,
    liveCallStatus: joined ? "connected" : "disconnected",
    localCaptureStatus: joined
      ? phaseJoinedCaptureStatus(session.recordingPhase)
      : seat.claimState === "disconnected"
        ? phaseInterruptedCaptureStatus(session.recordingPhase)
        : "not_recording",
    ownershipStatus,
    pickerState: ownedByCurrentBrowser
      ? "you"
      : ownershipStatus === "takeover_required" || seat.claimState === "active"
        ? "in_use"
        : seat.claimState === "disconnected"
          ? "rejoin_available"
          : "available",
    uploadStatus: joined
      ? phaseJoinedUploadStatus(session.recordingPhase)
      : seat.claimState === "disconnected"
        ? phaseBacklogStatus(session.recordingPhase)
        : "synced",
  };
}

function applyRoomDemoPreset(session: SessionShell, preset: RoomDemoPreset): SessionShell {
  const demoSeatId = session.role === "host" ? findRemoteDemoSeatId(session) : session.joinedSeatId;

  if (demoSeatId === null) {
    return session;
  }

  if (preset === "reconnecting") {
    return {
      ...session,
      recordingHealth: session.recordingPhase === "failed" ? "failed" : "degraded",
      seats: session.seats.map((seat) => {
        if (seat.id !== demoSeatId) {
          return seat;
        }

        return {
          ...seat,
          liveCallStatus: "reconnecting",
          uploadStatus: "catching_up",
        };
      }),
    };
  }

  if (preset === "catching_up") {
    return {
      ...session,
      recordingHealth: session.recordingPhase === "failed" ? "failed" : "degraded",
      seats: session.seats.map((seat) => {
        if (seat.id !== demoSeatId) {
          return seat;
        }

        return {
          ...seat,
          uploadStatus: "catching_up",
        };
      }),
    };
  }

  return {
    ...session,
    recordingHealth: "failed",
    seats: session.seats.map((seat) => {
      if (seat.id !== demoSeatId) {
        return seat;
      }

      return {
        ...seat,
        localCaptureStatus: "issue",
        uploadStatus: "failed",
      };
    }),
  };
}

function findRemoteDemoSeatId(session: SessionShell) {
  const remoteSeat = session.seats.find(
    (seat) => seat.id !== session.joinedSeatId && seat.role === "guest",
  );

  return remoteSeat?.id ?? session.joinedSeatId;
}

function claimSeat(session: SessionShell, seatId: string): SessionShell {
  return {
    ...session,
    ownedSeatId: seatId,
    selectedSeatId: seatId,
    seats: session.seats.map((seat) => {
      if (seat.role !== session.role) {
        return seat;
      }

      if (seat.id === seatId) {
        return {
          ...seat,
          claimState: "active",
          joined: false,
          ownershipStatus: "clear",
          screenShareActive: false,
        };
      }

      if (seat.id !== session.ownedSeatId) {
        return seat;
      }

      return {
        ...seat,
        claimState: seat.claimState === "disconnected" ? "disconnected" : "unclaimed",
        joined: false,
        ownershipStatus: "clear",
        screenShareActive: false,
      };
    }),
  };
}

function updateLocalSeat(session: SessionShell, patch: Partial<SessionSeat>): SessionShell {
  const joinedSeatId = session.joinedSeatId;

  if (joinedSeatId === null) {
    return session;
  }

  return {
    ...session,
    previewCamera: patch.selectedCamera ?? session.previewCamera,
    previewMic: patch.selectedMic ?? session.previewMic,
    seats: session.seats.map((seat) => {
      if (seat.id !== joinedSeatId) {
        return seat;
      }

      return {
        ...seat,
        ...patch,
      };
    }),
  };
}

function getLocalSeat(session: SessionShell) {
  if (session.joinedSeatId === null) {
    return null;
  }

  return session.seats.find((seat) => seat.id === session.joinedSeatId) ?? null;
}

function updateSessionState(state: SessionAppState, session: SessionShell): SessionAppState {
  return {
    ...state,
    session: normalizeSessionState(session),
  };
}

function shouldModelDisconnect(recordingPhase: RecordingPhase) {
  return (
    recordingPhase === "recording" || recordingPhase === "draining" || recordingPhase === "failed"
  );
}

function phaseJoinedCaptureStatus(recordingPhase: RecordingPhase): LocalCaptureStatus {
  if (recordingPhase === "recording") {
    return "recording";
  }

  if (recordingPhase === "failed") {
    return "issue";
  }

  return "not_recording";
}

function phaseInterruptedCaptureStatus(recordingPhase: RecordingPhase): LocalCaptureStatus {
  return recordingPhase === "recording" || recordingPhase === "failed" ? "issue" : "not_recording";
}

function phaseJoinedUploadStatus(recordingPhase: RecordingPhase): UploadStatus {
  if (recordingPhase === "recording") {
    return "uploading";
  }

  if (recordingPhase === "draining") {
    return "catching_up";
  }

  if (recordingPhase === "failed") {
    return "failed";
  }

  return "synced";
}

function phaseBacklogStatus(recordingPhase: RecordingPhase): UploadStatus {
  if (recordingPhase === "failed") {
    return "failed";
  }

  return recordingPhase === "recording" || recordingPhase === "draining" ? "catching_up" : "synced";
}
