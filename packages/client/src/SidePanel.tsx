import type { PlayerView } from '@hexgame/engine';
import { fmtBag, phaseText } from './labels';

const PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00'];

export default function SidePanel({ view }: { view: PlayerView | null }) {
  if (!view) return null;
  const dice = view.turn.roll;
  const sum = dice ? dice.reduce((a, b) => a + b, 0) : null;

  return (
    <section aria-label="Game status">
      <h3>Status</h3>
      <p>
        phase: {phaseText(view.phase)} · turn {view.turn.n} · acting: {view.turn.current}
        {dice ? ` · last dice: ${dice.join(' + ')} = ${sum}` : ''}
      </p>
      <p>
        bank: {fmtBag(view.bank.hand)} · deck: {view.bank.deckCount} cards left
      </p>
      <p>
        awards:{' '}
        {Object.entries(view.awards)
          .map(([k, v]) => `${k}: ${v ?? '—'}`)
          .join(' · ')}
      </p>
      {view.trade && (
        <p>
          trade on the table: {view.trade.from} gives {fmtBag(view.trade.give)} for{' '}
          {fmtBag(view.trade.get)} ({Object.entries(view.trade.responses).map(([p, r]) => `${p}:${r}`).join(', ') || 'no responses yet'})
        </p>
      )}
      <p className="hint">hands are shown from {view.viewer ?? 'spectator'}'s view</p>
      <table className="players">
        <caption className="sr-only">Players</caption>
        <thead>
          <tr>
            <th scope="col">player</th>
            <th scope="col">VP</th>
            <th scope="col">hand</th>
            <th scope="col">cards</th>
            <th scope="col">supply (road/settle/city)</th>
          </tr>
        </thead>
        <tbody>
          {view.players.map((p, i) => {
            const played = Object.entries(p.played).filter(([, n]) => n > 0);
            return (
              <tr key={p.id}>
                <td>
                  <span
                    className="chip"
                    style={{ background: PALETTE[i % PALETTE.length] }}
                    aria-hidden="true"
                  />{' '}
                  {p.id}
                </td>
                <td>{p.vp != null ? `${p.vp}` : `${p.publicVP} (public)`}</td>
                <td>
                  {p.hand ? (
                    fmtBag(p.hand)
                  ) : (
                    <span title="hidden: another player's hand">{p.handCount} cards</span>
                  )}
                </td>
                <td>
                  {p.cardCount}
                  {played.length > 0 && (
                    <span className="hint"> · played: {played.map(([c, n]) => `${c}×${n}`).join(', ')}</span>
                  )}
                </td>
                <td>
                  {p.supply['road'] ?? 0}/{p.supply['settlement'] ?? 0}/{p.supply['city'] ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
