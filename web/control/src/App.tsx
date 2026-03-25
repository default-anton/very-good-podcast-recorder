export function App() {
  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Bootstrap baseline</p>
        <h1>Host control plane skeleton</h1>
        <p>This repo now has a runnable React, Vite, and tsgo baseline for the control surface.</p>
        <ul>
          <li>default dev port: 5173</li>
          <li>quality gate: pnpm run check</li>
          <li>backend stub: go run ./cmd/controlplane</li>
        </ul>
      </section>
    </main>
  );
}
