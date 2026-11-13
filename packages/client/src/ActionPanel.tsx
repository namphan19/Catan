import type { Action, PlayerId } from '@hexgame/engine';
import { describeAction } from './labels';

interface Props {
  actor: PlayerId | null;
  legal: Action[];
  onAction: (a: Action) => void;
}

const BUTTON_ORDER = [
  'roll',
  'buyCard',
  'playCard',
  'bankTrade',
  'offerTrade',
  'respondTrade',
  'confirmTrade',
  'cancelTrade',
  'discard',
  'steal',
  'endTurn',
];

const MAP_TYPES: Record<string, string> = {
  placeSettlement: 'settlement',
  buildCity: 'city',
  placeRoad: 'road',
  moveBlocker: 'blocker',
};

const CAP = 30;

export default function ActionPanel({ actor, legal, onAction }: Props) {
  if (!actor) {
    return (
      <section aria-label="Actions">
        <h3>Actions</h3>
        <p className="hint">No player can act right now.</p>
      </section>
    );
  }

  const mapTypes = Object.keys(MAP_TYPES).filter((t) => legal.some((a) => a.t === t));
  const extTypes = [...new Set(legal.map((a) => a.t).filter((t) => t.includes(':')))];
  const buttonTypes = BUTTON_ORDER.filter((t) => legal.some((a) => a.t === t)).concat(extTypes);

  return (
    <section aria-label={`Legal actions for ${actor}`}>
      <h3>{actor} to act</h3>
      {mapTypes.length > 0 && (
        <p className="hint">
          Click a highlighted {mapTypes.map((t) => MAP_TYPES[t]).join(' / ')} spot on the board.
        </p>
      )}
      {buttonTypes.map((t) => {
        const all = legal.filter((a) => a.t === t);
        const shown = all.slice(0, CAP);
        return (
          <div key={t} className="act-group">
            {shown.map((a, i) => (
              <button
                key={i}
                className="act"
                title={describeAction(a)}
                onClick={() => onAction(a)}
              >
                {describeAction(a)}
              </button>
            ))}
            {all.length > shown.length && (
              <p className="hint">
                …{all.length - shown.length} more {t} actions hidden (first {shown.length} shown).
              </p>
            )}
          </div>
        );
      })}
      {buttonTypes.length === 0 && mapTypes.length === 0 && (
        <p className="hint">No legal actions.</p>
      )}
    </section>
  );
}
