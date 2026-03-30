import { QueryClient } from "@tanstack/react-query";

export const controlQueryKeys = {
  bootstrap: (sessionId: string, role: string, joinKey: string) =>
    ["control", "bootstrap", sessionId, role, joinKey] as const,
  session: (sessionId: string) => ["control", "session", sessionId] as const,
};

export function createControlQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 60_000,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 5_000,
      },
    },
  });
}
