// Steal target choice: the candidate list comes straight from the legal `steal` actions.
import type { Action } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

interface StealDialogProps {
  legal: Action[];
  onAction: (a: Action) => void;
  onClose: () => void;
}

export function StealDialog({ legal, onAction, onClose }: StealDialogProps) {
  const { t } = useI18n();
  const name = useName();
  const targets = [...new Set(legal.filter((a) => a.t === 'steal').map((a) => (a as { target: string }).target))];

  return (
    <Dialog title={t('dlg_stealTitle')} locked onClose={onClose}>
      {targets.length === 0 ? (
        <p className="hint">{t('dlg_none')}</p>
      ) : (
        <ul className="target-list">
          {targets.map((target) => {
            const a = legal.find((x) => x.t === 'steal' && (x as { target: string }).target === target)!;
            return (
              <li key={target}>
                <Button
                  variant="ghost"
                  className="target-btn"
                  tip={undefined}
                  onClick={() => onAction(a)}
                  style={{ borderColor: playerColor(target) }}
                >
                  <Emblem id={playerEmblem(target)} size={18} color={playerColor(target)} />
                  {name(target)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
