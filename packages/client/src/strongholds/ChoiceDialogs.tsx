// Dialogs of the staged chooser: a list of options, and a "pick exactly N cards" dialog.
import { useState } from 'react';
import { resKey, resourceKinds, useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ResourceIcon } from '../ui/ResourceIcon';
import { GameIcon } from '../ui/GameIcon';

export interface Option {
  key: string;
  label: string;
  value: unknown;
}

export function ChoiceDialog({
  title, prompt, options, onPick, onCancel,
}: {
  title: string;
  prompt: string;
  options: Option[];
  onPick: (value: unknown) => void;
  /** Absent for mandatory choices. */
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={title} locked={!onCancel} onClose={onCancel ?? (() => {})}>
      <p className="hint">{prompt}</p>
      <ul className="option-list sh-options">
        {options.map((o) => (
          <li key={o.key}>
            <Button variant="ghost" className="option-btn" onClick={() => onPick(o.value)}>
              {o.label}
            </Button>
          </li>
        ))}
      </ul>
      {onCancel && (
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel}>
            {t('sh_cancel')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

/** Choose exactly `need` cards out of `hand` (own hand, or a hand the viewer may look at). */
export function BagDialog({
  title, hint, hand, need, onSubmit,
}: {
  title: string;
  hint: string;
  hand: Record<string, number>;
  need: number;
  onSubmit: (bag: Record<string, number>) => void;
}) {
  const { t } = useI18n();
  const [pick, setPick] = useState<Record<string, number>>({});
  const total = Object.values(pick).reduce((s, n) => s + n, 0);
  const kinds = resourceKinds(hand).filter((r) => (hand[r] ?? 0) > 0);
  const bump = (r: string, d: number) =>
    setPick((p) => ({ ...p, [r]: Math.max(0, Math.min(hand[r] ?? 0, (p[r] ?? 0) + d)) }));
  const submit = () => {
    const bag: Record<string, number> = {};
    for (const [r, n] of Object.entries(pick)) if (n > 0) bag[r] = n;
    onSubmit(bag);
  };
  return (
    <Dialog title={title} locked onClose={() => {}}>
      <p className="hint">
        {hint} <b className="sh-count">{total}/{need}</b>
      </p>
      <ul className="pick-list">
        {kinds.map((r) => (
          <li key={r} className="pick-row">
            <span className="res-chip">
              <ResourceIcon res={r} size={18} />
              <span className="res-name">{t(resKey(r))}</span>
              <span className="res-count">{hand[r] ?? 0}</span>
            </span>
            <span className="sh-stepper">
              <button type="button" className="btn btn-icon" aria-label={`- ${t(resKey(r))}`} onClick={() => bump(r, -1)}>
                <GameIcon name="minus" size={14} />
              </button>
              <b data-pick={r}>{pick[r] ?? 0}</b>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={`+ ${t(resKey(r))}`}
                disabled={total >= need}
                onClick={() => bump(r, 1)}
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <Button variant="primary" disabled={total !== need} onClick={submit}>
          {t('sh_confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
