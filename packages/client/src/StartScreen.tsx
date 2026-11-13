import { useState } from 'react';

interface Props {
  onNew: (seed: string, playerCount: number) => void;
  onLoad: (text: string) => void;
  error: string | null;
}

export default function StartScreen({ onNew, onLoad, error }: Props) {
  const [seed, setSeed] = useState('dev');
  const [count, setCount] = useState(4);
  const [logText, setLogText] = useState('');

  return (
    <main className="start">
      <h1>Hex game — hot-seat dev client</h1>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <fieldset>
        <legend>New game</legend>
        <label>
          Seed{' '}
          <input value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Seed" />
        </label>
        <label>
          Players{' '}
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            aria-label="Player count"
          >
            {[3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => onNew(seed, count)}>New game</button>
      </fieldset>
      <fieldset>
        <legend>Load log</legend>
        <p className="hint">Paste a saved log: JSON of shape {'{"init": ..., "actions": [...]}'}</p>
        <textarea
          rows={8}
          value={logText}
          onChange={(e) => setLogText(e.target.value)}
          aria-label="Game log JSON"
          placeholder='{"init": {...}, "actions": [...]}'
        />
        <button onClick={() => onLoad(logText)} disabled={!logText.trim()}>
          Load &amp; replay
        </button>
      </fieldset>
    </main>
  );
}
