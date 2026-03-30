import { routeApiRequest } from "./api/router";

interface FetchAssetBinding {
  fetch: (request: Request) => Promise<Response>;
}

export interface ControlPlaneWorkerEnv {
  ASSETS?: FetchAssetBinding;
}

const worker = {
  async fetch(request: Request, env?: ControlPlaneWorkerEnv) {
    const apiResponse = await routeApiRequest(request);

    if (apiResponse !== null) {
      return apiResponse;
    }

    if (env?.ASSETS !== undefined) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found.", { status: 404 });
  },
};

export default worker;
