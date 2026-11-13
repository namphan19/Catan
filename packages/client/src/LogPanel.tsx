export default function LogPanel({ lines }: { lines: string[] }) {
  return (
    <section className="log" aria-label="Event log">
      <h3>Log</h3>
      <ol className="log-lines" aria-live="polite">
        {lines.map((l, i) => (
          <li key={i} className={l.startsWith('\u2717') ? 'log-err' : undefined}>
            {l}
          </li>
        ))}
        {lines.length === 0 && <li className="hint">no events yet</li>}
      </ol>
    </section>
  );
}
