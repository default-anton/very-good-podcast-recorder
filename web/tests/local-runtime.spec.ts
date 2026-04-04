import { describe, expect, it } from "vitest";

import topology from "../../deploy/local/topology.json" with { type: "json" };
import {
  createLocalRuntimeTopology,
  isLocalRuntimeOrigin,
  localRuntimeDefaultHost,
  localRuntimePorts,
  localRuntimeUdpRanges,
  resolveLocalControlApiOrigin,
  resolveLocalSessionAppOrigin,
} from "../shared/localRuntime";

describe("local runtime topology", () => {
  it("matches the committed deploy/local topology file", () => {
    expect(localRuntimeDefaultHost).toBe(topology.defaultHost);
    expect(localRuntimePorts).toEqual(topology.ports);
    expect(localRuntimeUdpRanges).toEqual(topology.udpRanges);
  });

  it("uses the requested loopback hostname when deriving app and backend URLs", () => {
    expect(createLocalRuntimeTopology()).toEqual({
      controlApiOrigin: "http://127.0.0.1:8080",
      controlAppOrigin: "http://127.0.0.1:5173",
      liveKitUrl: "ws://127.0.0.1:7880",
      sessionAppOrigin: "http://127.0.0.1:5174",
      sessiondBaseUrl: "http://127.0.0.1:8081",
    });
    expect(createLocalRuntimeTopology("localhost")).toEqual({
      controlApiOrigin: "http://localhost:8080",
      controlAppOrigin: "http://localhost:5173",
      liveKitUrl: "ws://localhost:7880",
      sessionAppOrigin: "http://localhost:5174",
      sessiondBaseUrl: "http://localhost:8081",
    });
  });

  it("recognizes approved loopback origins and rewrites local app origins to the control API", () => {
    expect(isLocalRuntimeOrigin("http://127.0.0.1:5174", localRuntimePorts.sessionApp)).toBe(true);
    expect(isLocalRuntimeOrigin("http://localhost:5174", localRuntimePorts.sessionApp)).toBe(true);
    expect(isLocalRuntimeOrigin("https://localhost:5174", localRuntimePorts.sessionApp)).toBe(
      false,
    );
    expect(isLocalRuntimeOrigin("http://evil.example:5174", localRuntimePorts.sessionApp)).toBe(
      false,
    );
    expect(resolveLocalControlApiOrigin("http://127.0.0.1:5173")).toBe("http://127.0.0.1:8080");
    expect(resolveLocalControlApiOrigin("http://127.0.0.1:5174")).toBe("http://127.0.0.1:8080");
    expect(resolveLocalControlApiOrigin("http://localhost:8080")).toBe("http://localhost:8080");
    expect(resolveLocalControlApiOrigin("https://studio.example")).toBe("https://studio.example");
  });

  it("rewrites local control-plane origins to the session app origin", () => {
    expect(resolveLocalSessionAppOrigin("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5174");
    expect(resolveLocalSessionAppOrigin("http://127.0.0.1:8080")).toBe("http://127.0.0.1:5174");
    expect(resolveLocalSessionAppOrigin("http://localhost:8080")).toBe("http://localhost:5174");
    expect(resolveLocalSessionAppOrigin("https://studio.example")).toBe("https://studio.example");
  });
});
