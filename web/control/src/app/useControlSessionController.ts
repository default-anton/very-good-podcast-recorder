import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createControlSeat,
  deleteControlSeat,
  ensureControlSession,
  updateControlSeat,
  updateControlSession,
  type ControlSessionResponse,
  type UpdateControlSeatInput,
  type UpdateControlSessionInput,
} from "./lib/api";
import { controlQueryKeys } from "./lib/query";
import {
  CAMERA_OPTIONS,
  createInitialSession,
  getHostSeat,
  HOST_SEAT_ID,
  MIC_OPTIONS,
  presentSession,
} from "./lib/state";
import { patchControlSeatResponse, patchControlSessionResponse } from "./lib/session-contract";
import type { ControlSession, DemoPreset, Seat, SessionLinks } from "./lib/types";

export interface ControlSessionController {
  activateSession: () => Promise<void>;
  addSeat: () => Promise<void>;
  applyDemoPreset: (preset: DemoPreset) => void;
  cameraOptions: string[];
  endHostedRun: () => Promise<void>;
  failRecording: () => Promise<void>;
  finishDrain: () => Promise<void>;
  joinOperatorRoom: () => Promise<void>;
  leaveOperatorRoom: () => Promise<void>;
  micOptions: string[];
  operatorSeatId: string;
  removeSeat: (seatId: string) => Promise<void>;
  roleLinks: SessionLinks | null;
  roleLinksStatus: "error" | "loading" | "ready";
  selectHostCamera: (value: string) => Promise<void>;
  selectHostMic: (value: string) => Promise<void>;
  session: ControlSession;
  setSessionStatus: (status: "draft" | "ready") => Promise<void>;
  setTitle: (title: string) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleHostCamera: () => Promise<void>;
  toggleHostMic: () => Promise<void>;
  toggleHostScreenShare: () => Promise<void>;
  updateSeat: (seatId: string, patch: Partial<Pick<Seat, "displayName" | "role">>) => Promise<void>;
}

export function useControlSessionController(sessionId: string): ControlSessionController {
  const [demoPreset, setDemoPreset] = useState<DemoPreset>("healthy");
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queryClient = useQueryClient();
  const sessionQueryKey = useMemo(() => controlQueryKeys.session(sessionId), [sessionId]);
  const sessionContractQuery = useQuery({
    queryFn: ({ signal }) => ensureControlSession(sessionId, { signal }),
    queryKey: sessionQueryKey,
  });
  const baseSession = sessionContractQuery.data?.session ?? createInitialSession(sessionId);
  const session = useMemo(
    () => presentSession({ demoPreset, session: baseSession }),
    [baseSession, demoPreset],
  );
  const roleLinks = sessionContractQuery.data?.session.links ?? null;
  const roleLinksStatus: ControlSessionController["roleLinksStatus"] = sessionContractQuery.isError
    ? "error"
    : sessionContractQuery.isSuccess
      ? "ready"
      : "loading";

  const ensureSessionContract = useCallback(async () => {
    const cached = queryClient.getQueryData<ControlSessionResponse>(sessionQueryKey);

    if (cached !== undefined) {
      return cached;
    }

    return queryClient.ensureQueryData({
      queryFn: ({ signal }) => ensureControlSession(sessionId, { signal }),
      queryKey: sessionQueryKey,
    });
  }, [queryClient, sessionId, sessionQueryKey]);

  const runSessionMutation = useCallback(
    async (
      buildMutation: (current: ControlSessionResponse) => {
        optimisticResponse?: ControlSessionResponse;
        request: () => Promise<ControlSessionResponse>;
      },
    ) => {
      await queryClient.cancelQueries({ queryKey: sessionQueryKey });
      const ensured = await ensureSessionContract();
      const current = queryClient.getQueryData<ControlSessionResponse>(sessionQueryKey) ?? ensured;
      const mutation = buildMutation(current);

      if (mutation.optimisticResponse !== undefined) {
        queryClient.setQueryData(sessionQueryKey, mutation.optimisticResponse);
      }

      const execute = mutationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await mutation.request();

          queryClient.setQueryData(sessionQueryKey, response);
        });

      mutationQueueRef.current = execute;

      try {
        await execute;
      } catch (error) {
        await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
        throw error;
      }
    },
    [ensureSessionContract, queryClient, sessionQueryKey],
  );

  const updateSessionWithOptimistic = useCallback(
    async (patch: UpdateControlSessionInput) => {
      await runSessionMutation((current) => ({
        optimisticResponse: patchControlSessionResponse(current, patch),
        request: () => updateControlSession(sessionId, patch),
      }));
    },
    [runSessionMutation, sessionId],
  );

  const updateSeatWithOptimistic = useCallback(
    async (seatId: string, patch: UpdateControlSeatInput) => {
      await runSessionMutation((current) => ({
        optimisticResponse: patchControlSeatResponse(current, seatId, patch),
        request: () => updateControlSeat(sessionId, seatId, patch),
      }));
    },
    [runSessionMutation, sessionId],
  );

  return useMemo(
    () => ({
      activateSession: async () => {
        await updateSessionWithOptimistic({
          recordingHealth: "healthy",
          recordingPhase: "waiting",
          status: "active",
        });
      },
      addSeat: async () => {
        await runSessionMutation(() => ({
          request: () => createControlSeat(sessionId),
        }));
      },
      applyDemoPreset: (preset: DemoPreset) => {
        setDemoPreset(preset);
      },
      cameraOptions: CAMERA_OPTIONS,
      endHostedRun: async () => {
        await updateSessionWithOptimistic({ status: "ended" });
      },
      failRecording: async () => {
        await updateSessionWithOptimistic({
          recordingHealth: "failed",
          recordingPhase: "failed",
        });
      },
      finishDrain: async () => {
        await updateSessionWithOptimistic({ recordingPhase: "stopped" });
      },
      joinOperatorRoom: async () => {
        await updateSeatWithOptimistic(HOST_SEAT_ID, {
          joined: true,
          ownershipStatus: "clear",
        });
      },
      leaveOperatorRoom: async () => {
        await runSessionMutation((current) => {
          const ownershipStatus =
            current.session.status === "active" ? "rejoin_available" : "clear";
          const patch = {
            joined: false,
            ownershipStatus,
          } satisfies UpdateControlSeatInput;

          return {
            optimisticResponse: patchControlSeatResponse(current, HOST_SEAT_ID, patch),
            request: () => updateControlSeat(sessionId, HOST_SEAT_ID, patch),
          };
        });
      },
      micOptions: MIC_OPTIONS,
      operatorSeatId: HOST_SEAT_ID,
      removeSeat: async (seatId: string) => {
        await runSessionMutation(() => ({
          request: () => deleteControlSeat(sessionId, seatId),
        }));
      },
      roleLinks,
      roleLinksStatus,
      selectHostCamera: async (value: string) => {
        await updateSeatWithOptimistic(HOST_SEAT_ID, { selectedCamera: value });
      },
      selectHostMic: async (value: string) => {
        await updateSeatWithOptimistic(HOST_SEAT_ID, { selectedMic: value });
      },
      session,
      setSessionStatus: async (status: "draft" | "ready") => {
        await updateSessionWithOptimistic({ status });
      },
      setTitle: async (title: string) => {
        await updateSessionWithOptimistic({ title });
      },
      startRecording: async () => {
        await updateSessionWithOptimistic({
          recordingHealth: "healthy",
          recordingPhase: "recording",
          status: "active",
        });
      },
      stopRecording: async () => {
        await updateSessionWithOptimistic({
          recordingPhase: "draining",
          status: "active",
        });
      },
      toggleHostCamera: async () => {
        await runSessionMutation((current) => {
          const patch = {
            cameraEnabled: !getHostSeat(current.session).cameraEnabled,
          } satisfies UpdateControlSeatInput;

          return {
            optimisticResponse: patchControlSeatResponse(current, HOST_SEAT_ID, patch),
            request: () => updateControlSeat(sessionId, HOST_SEAT_ID, patch),
          };
        });
      },
      toggleHostMic: async () => {
        await runSessionMutation((current) => {
          const patch = {
            micMuted: !getHostSeat(current.session).micMuted,
          } satisfies UpdateControlSeatInput;

          return {
            optimisticResponse: patchControlSeatResponse(current, HOST_SEAT_ID, patch),
            request: () => updateControlSeat(sessionId, HOST_SEAT_ID, patch),
          };
        });
      },
      toggleHostScreenShare: async () => {
        await runSessionMutation((current) => {
          const patch = {
            screenShareActive: !getHostSeat(current.session).screenShareActive,
          } satisfies UpdateControlSeatInput;

          return {
            optimisticResponse: patchControlSeatResponse(current, HOST_SEAT_ID, patch),
            request: () => updateControlSeat(sessionId, HOST_SEAT_ID, patch),
          };
        });
      },
      updateSeat: async (seatId: string, patch: Partial<Pick<Seat, "displayName" | "role">>) => {
        await updateSeatWithOptimistic(seatId, patch);
      },
    }),
    [
      roleLinks,
      roleLinksStatus,
      runSessionMutation,
      session,
      sessionId,
      updateSeatWithOptimistic,
      updateSessionWithOptimistic,
    ],
  );
}
