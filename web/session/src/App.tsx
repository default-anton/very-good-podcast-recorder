export function App() {
  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Bootstrap baseline</p>
        <h1>Participant session skeleton</h1>
        <p>This repo now has the browser join surface wired for React, Vite, and tsgo checks.</p>
        <ul>
          <li>default dev port: 5174</li>
          <li>quality gate: pnpm run check</li>
          <li>backend stub: go run ./cmd/sessiond</li>
        </ul>
      </section>
    </main>
  );
}
