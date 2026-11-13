// Top bar: turn, phase label (incl. "paired" actor), dice, everyone's public VP, awards.
import type { PlayerView } from '@hexgame/engine';
import { useI18n, type Lang } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem, seatIndex } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { awardKey } from './describe';

export function TopBar({ view }: { view: PlayerView }) {
  const { t, lang, setLang } = useI18n();
  const name = useName();
  const ph = view.phase;
  const phaseLabel = phaseText(ph, t, name);
  const turnLabel =
    ph.k === 'setup' ? t('setupTurn', { n: Math.floor(ph.idx / (view.players.length || 1)) + 1 }) : view.turn.n > 0 ? t('turn', { n: view.turn.n }) : phaseLabel;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="game-title">{t('appTitle')}</h1>
        <span className="turn-label">{turnLabel}</span>
        <span className="phase-label" data-phase={ph.k}>
          {phaseLabel}
        </span>
      </div>
      {view.turn.roll && view.turn.roll.length > 0 && (
        <div className="topbar-dice" aria-label={`🎲 ${view.turn.roll.join(' + ')}`}>
          {view.turn.roll.map((d, i) => (
            <Die key={i} n={d} />
          ))}
        </div>
      )}
      <ul className="topbar-vps">
        {view.players.map((p) => {
          const vp = p.vp ?? p.publicVP;
          return (
            <li key={p.id} className={`vp-chip${p.id === view.viewer ? ' me' : ''}`} style={{ borderColor: playerColor(p.id) }}>
              <Emblem id={playerEmblem(p.id)} size={16} color={playerColor(p.id)} />
              <span className="vp-name">{name(p.id)}</span>
              <span className="vp-score" aria-label={`${t('vpShort')} ${vp}`}>
                {vp}
                <small> {t('vpShort')}</small>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="topbar-awards">
        {Object.entries(view.awards)
          .filter(([, owner]) => owner)
          .map(([award, owner]) => (
            <span key={award} className="award-chip" title={t(awardKey(award))}>
              🏅 {t(awardKey(award))}: {owner ? name(owner) : ''}
            </span>
          ))}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-lang"
        onClick={() => setLang(lang === 'vi' ? ('en' as Lang) : ('vi' as Lang))}
        aria-label={t('langToggle')}
      >
        {t('langToggle')}
      </button>
    </header>
  );
}

function phaseText(
  ph: PlayerView['phase'],
  t: (k: string, p?: Record<string, string | number>) => string,
  name: (id: string) => string,
): string {
  if (ph.k === 'discard') return t('phase_discard');
  if (ph.k === 'moveBlocker') return t('phase_moveBlocker');
  if (ph.k === 'steal') return t('phase_steal');
  if (ph.k === 'freeRoads') return t('phase_freeRoads');
  if (ph.k === 'extraBuild') return t('phase_extraBuild');
  if (ph.k === 'paired') {
    const actor = (ph as { player?: string }).player;
    return t('phase_paired', { name: actor ? name(actor) : t('player', { n: 2 }) });
  }
  if (ph.k === 'ext') return t('phase_ext', { id: ph.id });
  if (ph.k === 'over') return t('phase_over');
  if (ph.k === 'setup') return t('phase_setup');
  if (ph.k === 'preRoll') return t('phase_preRoll');
  if (ph.k === 'main') return t('phase_main');
  // Unknown extension phase: show the raw key rather than nothing.
  return (ph as { k: string }).k;
}

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[24, 24]],
  2: [[14, 14], [34, 34]],
  3: [[14, 14], [24, 24], [34, 34]],
  4: [[14, 14], [34, 14], [14, 34], [34, 34]],
  5: [[14, 14], [34, 14], [24, 24], [14, 34], [34, 34]],
  6: [[14, 12], [34, 12], [14, 24], [34, 24], [14, 36], [34, 36]],
};

/** Inline dice face (no asset dependency, readable at any size). */
export function Die({ n }: { n: number }) {
  const pips = PIPS[n] ?? PIPS[1] ?? [];
  return (
    <svg className="die" viewBox="0 0 48 48" width={30} height={30} aria-hidden="true">
      <rect x={2} y={2} width={44} height={44} rx={8} fill="var(--parchment)" stroke="var(--ink)" strokeWidth={2.5} />
      {pips.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4.4} fill="var(--ink)" />
      ))}
    </svg>
  );
}
