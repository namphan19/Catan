// Action log (newest first), straight from the redacted view's log. Each line starts with the
// acting player's emblem in their colour; the numbering counts down so the newest line has
// the highest number.
import { useMemo, type ReactNode } from 'react';
import type { PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { describeAction } from './describe';

export function LogPanel({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const name = useName();
  const lines = useMemo(() => {
    const desc = view.log.map((l) => ({ player: l.action.player, text: describeAction(l.action, t, name, l) as ReactNode }));
    return desc.reverse();
    // view.log is replaced wholesale by each new view; describe on change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, t, name]);

  return (
    <div className="logpanel">
      {lines.length === 0 ? (
        <p className="hint">{t('log_empty')}</p>
      ) : (
        <ol className="log-list" reversed>
          {lines.map((line, i) => (
            <li key={view.log.length - i} className={i === 0 ? 'log-new' : undefined}>
              <Emblem id={playerEmblem(line.player)} size={14} color={playerColor(line.player)} /> {line.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
