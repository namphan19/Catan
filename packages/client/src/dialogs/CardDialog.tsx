// Play a harvest (pick exactly N resources from the bank) or claim (pick 1 resource type).
// The choice lists ARE the legal `playCard` actions — nothing is computed here.
import type { Action } from '@hexgame/engine';
import { useI18n, resKey, RESOURCE_ORDER } from '../i18n';
import { RESOURCE_COLORS } from '../ui/colors';
import { ResourceIcon } from '../ui/ResourceIcon';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export type PickCard = 'harvest' | 'claim';

interface CardDialogProps {
  card: PickCard;
  legal: Action[];
  onAction: (a: Action) => void;
  onClose: () => void;
}

export function CardDialog({ card, legal, onAction, onClose }: CardDialogProps) {
  const { t } = useI18n();
  const title = card === 'harvest' ? t('dlg_harvestTitle', { n: 2 }) : t('dlg_claimTitle');
  const options = legal.filter(
    (a) => a.t === 'playCard' && (a as { card: string }).card === card,
  );

  const bagOf = (a: Action): Record<string, number> => {
    const x = a as { resources?: string[]; resource?: string };
    const bag: Record<string, number> = {};
    for (const r of x.resources ?? []) bag[r] = (bag[r] ?? 0) + 1;
    if (x.resource) bag[x.resource] = (bag[x.resource] ?? 0) + 1;
    return bag;
  };

  return (
    <Dialog title={title} onClose={onClose}>
      {options.length === 0 ? (
        <p className="hint">{t('dlg_none')}</p>
      ) : (
        <ul className="option-list">
          {options.map((a, i) => {
            const bag = bagOf(a);
            return (
              <li key={i}>
                <Button variant="ghost" className="option-btn" onClick={() => onAction(a)}>
                  {RESOURCE_ORDER.filter((r) => (bag[r] ?? 0) > 0).map((r) => (
                    <span key={r} className="option-chip" title={t(resKey(r))}>
                      <ResourceIcon res={r} size={20} />
                      <span>{t(resKey(r))}</span>
                      {(bag[r] ?? 0) > 1 && <strong> ×{bag[r]}</strong>}
                    </span>
                  ))}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
