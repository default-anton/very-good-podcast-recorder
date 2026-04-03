import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="panel-surface flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Very Good Podcast Recorder</p>
            <h1 className="mt-3 text-2xl font-semibold text-text">Studio utility control shell</h1>
            <p className="fine-print mt-2 max-w-3xl">
              This slice keeps the responsive host shells local-first while the embedded
              control-plane API now owns the session and seat contract underneath them.
            </p>
          </div>
          <div className="rounded-md border border-line bg-panel-raised px-4 py-3">
            <p className="section-label">Shell status</p>
            <p className="mt-2 font-mono text-sm text-text">
              control / query-backed setup / local-api-ready
            </p>
          </div>
        </header>

        <main className="flex-1 py-6">{children}</main>
      </div>
    </div>
  );
}
