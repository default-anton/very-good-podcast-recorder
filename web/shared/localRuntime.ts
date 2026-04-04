import topology from "../../deploy/local/topology.json" with { type: "json" };

interface LocalRuntimeConfig {
  defaultHost: string;
  loopbackHosts: string[];
  ports: {
    controlApp: number;
    sessionApp: number;
    controlApi: number;
    sessiond: number;
    liveKit: number;
    caddyHttp: number;
    caddyHttps: number;
    coturn: number;
    coturnTls: number;
  };
  udpRanges: {
    liveKit: {
      end: number;
      start: number;
    };
  };
}

const localRuntimeConfig = topology satisfies LocalRuntimeConfig;

export const localRuntimeDefaultHost = localRuntimeConfig.defaultHost;
export const localRuntimeLoopbackHosts = [...localRuntimeConfig.loopbackHosts];
export const localRuntimePorts = { ...localRuntimeConfig.ports };
export const localRuntimeUdpRanges = {
  liveKit: { ...localRuntimeConfig.udpRanges.liveKit },
};

export interface LocalRuntimeTopology {
  controlApiOrigin: string;
  controlAppOrigin: string;
  liveKitUrl: string;
  sessionAppOrigin: string;
  sessiondBaseUrl: string;
}

export function createLocalRuntimeTopology(hostname?: string | null): LocalRuntimeTopology {
  const host = resolveLocalRuntimeHost(hostname);

  return {
    controlApiOrigin: createLoopbackOrigin("http", host, localRuntimePorts.controlApi),
    controlAppOrigin: createLoopbackOrigin("http", host, localRuntimePorts.controlApp),
    liveKitUrl: createLoopbackOrigin("ws", host, localRuntimePorts.liveKit),
    sessionAppOrigin: createLoopbackOrigin("http", host, localRuntimePorts.sessionApp),
    sessiondBaseUrl: createLoopbackOrigin("http", host, localRuntimePorts.sessiond),
  };
}

export function getLocalControlApiOrigin(hostname?: string | null) {
  return createLocalRuntimeTopology(hostname).controlApiOrigin;
}

export function getLocalControlAppOrigin(hostname?: string | null) {
  return createLocalRuntimeTopology(hostname).controlAppOrigin;
}

export function getLocalSessionAppOrigin(hostname?: string | null) {
  return createLocalRuntimeTopology(hostname).sessionAppOrigin;
}

export function getLocalSessiondBaseUrl(hostname?: string | null) {
  return createLocalRuntimeTopology(hostname).sessiondBaseUrl;
}

export function getLocalLiveKitUrl(hostname?: string | null) {
  return createLocalRuntimeTopology(hostname).liveKitUrl;
}

export function isLocalRuntimeOrigin(origin: string, port: number) {
  try {
    const url = new URL(origin);

    return (
      url.protocol === "http:" && isLocalRuntimeLoopbackHost(url.hostname) && url.port === `${port}`
    );
  } catch {
    return false;
  }
}

export function resolveLocalRuntimeHost(hostname?: string | null) {
  if (hostname !== undefined && hostname !== null && isLocalRuntimeLoopbackHost(hostname)) {
    return hostname;
  }

  return localRuntimeDefaultHost;
}

export function resolveLocalControlApiOrigin(origin: string) {
  const url = new URL(origin);

  if (!isControlPlaneLocalRuntimeOrigin(url)) {
    return origin;
  }

  return getLocalControlApiOrigin(url.hostname);
}

export function resolveLocalSessionAppOrigin(origin: string) {
  const url = new URL(origin);

  if (!isControlPlaneLocalRuntimeOrigin(url)) {
    return origin;
  }

  return getLocalSessionAppOrigin(url.hostname);
}

function createLoopbackOrigin(protocol: "http" | "ws", host: string, port: number) {
  return `${protocol}://${host}:${port}`;
}

function isControlPlaneLocalRuntimeOrigin(url: URL) {
  if (!isLocalRuntimeLoopbackHost(url.hostname)) {
    return false;
  }

  return (
    url.port === `${localRuntimePorts.controlApi}` ||
    url.port === `${localRuntimePorts.controlApp}` ||
    url.port === `${localRuntimePorts.sessionApp}`
  );
}

function isLocalRuntimeLoopbackHost(hostname: string) {
  return localRuntimeConfig.loopbackHosts.includes(hostname);
}
