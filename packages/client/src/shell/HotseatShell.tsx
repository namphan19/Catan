// Hot-seat shell: hides the table behind a "pass the device" cover whenever the acting
// viewer changes, keeps the export-log feature, and provides player names.
import { useEffect, useRef, useState } from 'react';
import { DICE_CHEAT_CODE, normalizeCheat, type Action, type GameEvent, type PlayerId, type PlayerView, type Validation } from '@hexgame/engine';
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
  /** A local bot that is searching for its move right now. */
  thinking?: PlayerId | null;
  /** Seats played by local bots. */
  botSeats?: readonly PlayerId[];
}

export function HotseatShell(props: HotseatShellProps) {
  return (
    <NamesProvider names={props.names}>
      <ShellInner {...props} />
    </NamesProvider>
  );
}

function ShellInner({ names, view, legal, onAction, events, validate, errors, exportLog, onHome, thinking, botSeats }: HotseatShellProps) {
  const { t } = useI18n();
  const name = useName();
  // The pass-device cover only makes sense with 2+ humans at the table; alone against bots there
  // is nobody to hide the hand from.
  const humans = view.players.filter((p) => !botSeats?.includes(p.id)).length;
  const shared = humans > 1;
  const [covered, setCovered] = useState(shared);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  const prevViewer = useRef<string | null | undefined>(undefined);
  // Dice cheat (no chat at a shared device): typing the code anywhere outside a text field unlocks
  // choosing the dice for the player whose view is shown.
  const [cheaters, setCheaters] = useState<readonly PlayerId[]>([]);
  const typed = useRef('');
  const viewerRef = useRef(view.viewer);
  viewerRef.current = view.viewer;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key.length !== 1 || el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      typed.current = normalizeCheat(typed.current + e.key).slice(-DICE_CHEAT_CODE.length);
      const who = viewerRef.current;
      if (typed.current === DICE_CHEAT_CODE && who) {
        typed.current = '';
        setCheaters((c) => (c.includes(who) ? c : [...c, who]));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Cover whenever the acting viewer changes (including the first reveal after a new game).
  useEffect(() => {
    const v = view.viewer;
    if (shared && prevViewer.current !== undefined && v !== prevViewer.current) setCovered(true);
    prevViewer.current = v;
  }, [view.viewer, shared]);

  const actorName = view.viewer ? name(view.viewer) : undefined;
  void names; // only meaningful through the NamesProvider

  return (
    <>
      {shared && view.viewer && covered && (
        <PassDeviceCover
          key={view.viewer}
          name={actorName ?? ''}
          playerId={view.viewer}
          onReady={() => setCovered(false)}
        />
      )}
      <div className="shell">
        <GameTable
          barInfo={
            <>
              <span className="shell-viewing">{t('strip_viewing', { name: actorName ?? t('you') })}</span>
              {thinking && (
                <span className="shell-thinking" role="status" aria-live="polite">
                  {t('strip_botThinking', { name: name(thinking) })}
                </span>
              )}
            </>
          }
          barActions={
            <>
              {shared && (
                <button type="button" className="btn btn-ghost" onClick={() => setCovered(true)}>
                  {t('strip_pass')}
                </button>
              )}
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
            </>
          }
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
          botSeats={botSeats}
          diceCheat={!!view.viewer && cheaters.includes(view.viewer)}
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
