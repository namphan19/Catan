// Action log (newest first), straight from the redacted view's log.
import { useMemo, type ReactNode } from 'react';
import type { PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { describeAction } from './describe';

export function LogPanel({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const name = useName();
  const lines = useMemo(() => {
    const desc = view.log.map((l) => describeAction(l.action, t, name));
    return desc.reverse();
    // view.log is replaced wholesale by each new view; describe on change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, t, name]) as ReactNode[];

  return (
    <div className="logpanel">
      {lines.length === 0 ? (
        <p className="hint">{t('log_empty')}</p>
      ) : (
        <ol className="log-list">
          {lines.map((line, i) => (
            <li key={view.log.length - i} className={i === 0 ? 'log-new' : undefined}>
              {line}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
