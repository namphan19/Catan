// Hot-seat shell: hides the table behind a "pass the device" cover whenever the acting
// viewer changes, keeps the export-log feature, and provides player names.
import { useEffect, useRef, useState } from 'react';
import type { Action, GameEvent, PlayerId, PlayerView, Validation } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { NamesProvider, useName } from './names';
import { PassDeviceCover } from './PassDeviceCover';
import { GameTable } from '../table/GameTable';
import { Dialog } from '../ui/Dialog';

export interface HotseatShellProps {
  /** Display names per player id (from the home screen). */
  names: Record<PlayerId, string>;
  view: PlayerView;
  legal: Action[];
  onAction: (a: Action) => void;
  events: GameEvent[];
  validate: (a: Action) => Validation;
  /** Rejected moves (IllegalActionError messages). */
  errors: string[];
  /** Serialised game log for the export feature. */
  exportLog: () => string;
  onHome: () => void;
}

export function HotseatShell(props: HotseatShellProps) {
  return (
    <NamesProvider names={props.names}>
      <ShellInner {...props} />
    </NamesProvider>
  );
}

function ShellInner({ names, view, legal, onAction, events, validate, errors, exportLog, onHome }: HotseatShellProps) {
  const { t } = useI18n();
  const name = useName();
  const [covered, setCovered] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  const prevViewer = useRef<string | null | undefined>(undefined);

  // Cover whenever the acting viewer changes (including the first reveal after a new game).
  useEffect(() => {
    const v = view.viewer;
    if (prevViewer.current !== undefined && v !== prevViewer.current) setCovered(true);
    prevViewer.current = v;
  }, [view.viewer]);

  const actorName = view.viewer ? name(view.viewer) : undefined;
  void names; // only meaningful through the NamesProvider

  return (
    <>
      {view.viewer && covered && (
        <PassDeviceCover
          key={view.viewer}
          name={actorName ?? ''}
          playerId={view.viewer}
          onReady={() => setCovered(false)}
        />
      )}
      <div className="shell">
        <div className="shell-strip">
          <span className="shell-viewing">{t('strip_viewing', { name: actorName ?? t('you') })}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setCovered(true)}>
            {t('strip_pass')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setExportText(exportLog());
              setExportOpen(true);
            }}
          >
            {t('strip_export')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onHome}>
            {t('strip_home')}
          </button>
        </div>
        <GameTable
          view={view}
          legal={legal}
          onAction={onAction}
          events={events}
          validate={validate}
          errors={errors}
          onExport={() => {
            setExportText(exportLog());
            setExportOpen(true);
          }}
          onHome={onHome}
        />
      </div>
      {exportOpen && (
        <Dialog title={t('strip_exportTitle')} onClose={() => setExportOpen(false)}>
          <p className="hint">{t('strip_exportHint')}</p>
          <textarea className="export-box" readOnly rows={12} value={exportText} onFocus={(e) => e.currentTarget.select()} />
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                navigator.clipboard?.writeText(exportText).catch(() => {});
              }}
            >
              {t('strip_copy')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
