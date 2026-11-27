// Discard: pick exactly N cards (N = the engine's owed amount for the viewer, from the phase).
// The bag is checked with validateAction before sending — the UI never counts rules itself.
import { useMemo, useState } from 'react';
import type { Action, Bag, PlayerView, Validation } from '@hexgame/engine';
import { useI18n, resKey, resourceKinds } from '../i18n';
import { RESOURCE_COLORS } from '../ui/colors';
import { ResourceIcon } from '../ui/ResourceIcon';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { GameIcon } from '../ui/GameIcon';

interface DiscardDialogProps {
  view: PlayerView;
  legal: Action[];
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
  onClose: () => void;
}

export function DiscardDialog({ view, legal, validate, onAction, onClose }: DiscardDialogProps) {
  const { t } = useI18n();
  const me = view.viewer;
  const owed = useMemo(() => {
    const ph = view.phase;
    return ph.k === 'discard' ? (ph.owed[me ?? ''] ?? 0) : 0;
  }, [view, me]);

  const hand = view.players.find((p) => p.id === me)?.hand ?? {};
  const [pick, setPick] = useState<Bag>({});

  const total = Object.values(pick).reduce((s, n) => s + (n || 0), 0);
  const bag = useMemo(() => {
    const b: Bag = {};
    for (const [r, n] of Object.entries(pick)) if ((n || 0) > 0) b[r] = n;
    return b;
  }, [pick]);
  const probe: Action = { t: 'discard', player: me ?? 'p1', bag };
  const v = validate(probe);
  const reason = v.ok ? undefined : `${v.code}: ${v.message}`;
  const ready = total === owed && v.ok;

  const bump = (r: string, d: number) =>
    setPick((p) => {
      const n = Math.max(0, Math.min(hand[r] ?? 0, (p[r] ?? 0) + d));
      return { ...p, [r]: n };
    });

  return (
    <Dialog title={t('dlg_discardTitle', { n: owed })} locked onClose={onClose}>
      <p className="hint">{t('dlg_discardLeft', { n: owed - total })}</p>
      <ul className="pick-list">
        {resourceKinds(hand).map((r) => (
          <li key={r} className="pick-row">
            <span className="res-chip" style={{ '--res': RESOURCE_COLORS[r] } as React.CSSProperties}>
              <ResourceIcon res={r} size={18} />
              <span className="res-name">{t(resKey(r))}</span>
              <span className="res-count">{hand[r] ?? 0}</span>
            </span>
            <div className="stepper">
              <Button aria-label={`− ${t(resKey(r))}`} disabled={(pick[r] ?? 0) === 0} onClick={() => bump(r, -1)}>
                <GameIcon name="minus" size={14} />
              </Button>
              <output aria-live="polite">{pick[r] ?? 0}</output>
              <Button
                aria-label={`+ ${t(resKey(r))}`}
                disabled={(pick[r] ?? 0) >= (hand[r] ?? 0) || total >= owed}
                onClick={() => bump(r, 1)}
              >
                +
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {reason && !ready && total === owed && <p className="error-text">{reason}</p>}
      <div className="dialog-actions">
        <Button
          variant="primary"
          disabled={!ready}
          tip={total === owed ? reason : undefined}
          onClick={() => ready && onAction({ t: 'discard', player: me ?? 'p1', bag })}
        >
          {t('dlg_discardConfirm', { n: owed })}
        </Button>
      </div>
    </Dialog>
  );
}
