// Strongholds on the board's edges (PO 2026-11-27 HUD), instead of a dense side column:
// - RaidLane: the raid fleet sailing a dotted lane under the dice, with raiders vs defence;
// - TrackRail: the viewer's three improvement tracks on the right edge; a click opens a tray with
//   the next level's cost, the level-3 perk, the capital and an "Improve" button;
// - ShLevels: the three levels (and capitals) under each player's name;
// - WardenMenu / WardenTargets: click your own warden on the board and its actions open around it.
// Everything that can be done comes from getLegalActions and goes through the staged chooser.
import { useEffect, useRef, useState } from 'react';
import type { Action, PlayerId, PlayerView, StrongholdsView } from '@hexgame/engine';
import { SH, TRACKS } from '@hexgame/engine';
import { SIZE, vertexPos } from '../board/geom';
import { resKey, useI18n } from '../i18n';
import { useName } from '../shell/names';
import { ResourceIcon } from '../ui/ResourceIcon';
import { trackName } from './labels';
import { WARDEN_ART } from './StrongholdsPanel';
import './strongholds.css';
import { GameIcon, type GameIconName } from '../ui/GameIcon';
import { art2dUrl } from '../board/assets';

type OnStart = (cands: Action[], title: string) => void;

function raidNumbers(view: PlayerView) {
  const wardens = Object.values(view.pieces.occupants ?? {});
  const defenders = wardens.filter((o) => o.active).reduce((s, o) => s + o.level, 0);
  const raiders = Object.values(view.pieces.buildings).filter((b) => b.kind === 'city').length;
  return { raiders, defenders };
}

export function RaidLane({ view, sh }: { view: PlayerView; sh: StrongholdsView }) {
  const { t } = useI18n();
  const { raiders, defenders } = raidNumbers(view);
  const left = SH.raidTrack - sh.raid.pos;
  const weaker = defenders < raiders;
  return (
    <div className="sh-lane" role="img" aria-label={`${t('sh_raidLeft', { n: left })}. ${t('sh_strength', { raiders, defenders })}`}>
      <span className="sh-lane-title">
        {t('sh_raid')} · {t('shhud_stepsLeft', { n: left })}
      </span>
      <span className="sh-lane-track" aria-hidden="true">
        {Array.from({ length: SH.raidTrack }, (_, i) => (
          <i key={i} className={i < sh.raid.pos ? 'done' : i === sh.raid.pos ? 'ship' : ''}>
            {i === sh.raid.pos && <img src={art2dUrl('ui', 'raid-ship')} alt="" width={34} height={34} draggable={false} />}
          </i>
        ))}
        <i className="shore">
          <GameIcon name="flag" size={14} />
        </i>
      </span>
      <span className="sh-lane-power">
        {t('shhud_raiders')} <b>{raiders}</b> · {t('shhud_defence')} <b>{defenders}</b>
        {raiders > 0 && <em className={weaker ? 'bad' : 'good'}> — {t(weaker ? 'shhud_weaker' : 'shhud_stronger')}</em>}
      </span>
      {!sh.blockerActive && <span className="sh-lane-note">{t('sh_blockerWaiting')}</span>}
    </div>
  );
}

/** Level pips of one track: filled up to the level; the next one outlined gold when it can be bought now. */
function Pips({ level, next }: { level: number; next: boolean }) {
  return (
    <span className="sh-pips" aria-hidden="true">
      {Array.from({ length: SH.maxLevel }, (_, i) => (
        <i key={i} className={i < level ? 'on' : i === level && next ? 'next' : ''} />
      ))}
    </span>
  );
}

export function TrackRail({
  view,
  sh,
  legal,
  onStart,
  onPanel,
}: {
  view: PlayerView;
  sh: StrongholdsView;
  legal: Action[];
  onStart: OnStart;
  /** Open the full Strongholds panel (drawer). */
  onPanel: () => void;
}) {
  const { t } = useI18n();
  const name = useName();
  const me = view.viewer;
  const [open, setOpen] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!me) return null;
  const hand = view.players.find((p) => p.id === me)?.hand ?? {};
  const improve = (tr: string) => legal.filter((a) => a.t === 'sh:improve' && (a as unknown as { track: string }).track === tr);

  return (
    <>
      <button
        type="button"
        className="sh-rail"
        aria-expanded={open}
        aria-label={t('sh_improve')}
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="sh-rail-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 20V11M12 20V6M19 20V14M9 6l3-3 3 3" />
        </svg>
        <span className="sh-rail-title">
          <span className="lg">{t('sh_improve')}</span>
          <span className="sm">{t('shhud_improveShort')}</span>
        </span>
        {TRACKS.map((tr) => {
          const level = sh.levels[me]?.[tr] ?? 0;
          const can = improve(tr).length > 0;
          return (
            <span key={tr} className="sh-rail-row" data-track={tr} data-level={level}>
              <span className="sh-rail-text">
                <b>{trackName(t, tr)}</b>
                <small>{level > 0 ? t('shhud_draws', { n: Math.min(6, level + 1) }) : t('shhud_noDraw')}</small>
              </span>
              <Pips level={level} next={can} />
              <ResourceIcon res={SH.trackCommodity[tr]} size={30} />
            </span>
          );
        })}
        <span className="sh-rail-hint">{t('shhud_railHint')}</span>
      </button>
      {open && (
        <div className="sh-tray hud-tray" ref={trayRef} role="dialog" aria-label={t('sh_improve')}>
          <div className="hud-tray-head">
            <h3>{t('sh_improve')}</h3>
            <span className="hud-tray-note">{t('shhud_costRule')}</span>
            <button type="button" className="hud-tray-close" aria-label={t('sh_cardClose')} onClick={() => setOpen(false)}>
              <GameIcon name="cross" size={16} />
            </button>
          </div>
          <div className="sh-tray-grid">
            {TRACKS.map((tr) => {
              const level = sh.levels[me]?.[tr] ?? 0;
              const commodity = SH.trackCommodity[tr];
              const cands = improve(tr);
              const done = level >= SH.maxLevel;
              const have = hand[commodity] ?? 0;
              const need = level + 1;
              const cap = sh.capitals[tr];
              return (
                <div key={tr} className="sh-tray-track" data-track={tr}>
                  <b className="sh-tray-name">
                    <ResourceIcon res={commodity} size={26} /> {trackName(t, tr)} · {t('shhud_level', { n: level })}
                  </b>
                  {done ? (
                    <span>{t('sh_trackDone')}</span>
                  ) : (
                    <span>
                      {t('shhud_next', { n: need, cost: `${need} ${t(resKey(commodity))}` })}{' '}
                      <small>({t('shhud_have', { n: have })})</small>
                    </span>
                  )}
                  <small className="sh-tray-perk">
                    {t('sh_perkAt', { n: SH.perkLevel })} {t(`sh_perk_${tr}`)} ·{' '}
                    {t('sh_capitalAt', { n: SH.capitalLevel, vp: SH.capitalVP })}:{' '}
                    {cap ? name(cap.owner) : t('sh_capitalNone')}
                  </small>
                  {!done && (
                    <button
                      type="button"
                      className={cands.length ? 'btn btn-primary' : 'btn btn-ghost'}
                      disabled={cands.length === 0}
                      data-improve={tr}
                      onClick={() => {
                        setOpen(false);
                        onStart(cands, `${t('sh_improve')}: ${trackName(t, tr)}`);
                      }}
                    >
                      {cands.length
                        ? t('shhud_upgrade', { n: need })
                        : have < need
                          ? t('shhud_missing', { n: need - have, res: t(resKey(commodity)) })
                          : t('act_unavailable')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="btn btn-ghost sh-tray-more"
            onClick={() => {
              setOpen(false);
              onPanel();
            }}
          >
            {t('shhud_panel')}
          </button>
        </div>
      )}
    </>
  );
}

/** Improvement levels (and capitals held) under a player's name. */
export function ShLevels({ sh, id }: { sh: StrongholdsView; id: PlayerId }) {
  const { t } = useI18n();
  return (
    <span className="sh-seat-levels">
      {TRACKS.map((tr) => (
        <span
          key={tr}
          className={sh.capitals[tr]?.owner === id ? 'sh-seat-level capital' : 'sh-seat-level'}
          title={`${trackName(t, tr)}: ${sh.levels[id]?.[tr] ?? 0}${sh.capitals[tr]?.owner === id ? ` · ${t('sh_capital')}` : ''}`}
        >
          <ResourceIcon res={SH.trackCommodity[tr]} size={15} />
          {sh.levels[id]?.[tr] ?? 0}
        </span>
      ))}
    </span>
  );
}

const WARDEN_KINDS = ['promote', 'activate', 'moveWarden', 'displace', 'chase'] as const;

/** The viewer's warden actions grouped by the warden (vertex) they start from. */
export function wardenActions(legal: Action[]): Map<string, Map<string, Action[]>> {
  const out = new Map<string, Map<string, Action[]>>();
  for (const a of legal) {
    const k = a.t.startsWith('sh:') ? a.t.slice(3) : '';
    if (!(WARDEN_KINDS as readonly string[]).includes(k)) continue;
    const x = a as unknown as { v?: string; from?: string };
    const at = x.from ?? x.v;
    if (!at) continue;
    if (!out.has(at)) out.set(at, new Map());
    const m = out.get(at)!;
    m.set(k, [...(m.get(k) ?? []), a]);
  }
  return out;
}

const GLYPH: Record<string, GameIconName> = { promote: 'promote', activate: 'bolt', moveWarden: 'move', displace: 'push', chase: 'target' };

/** The selected warden: its vertex and its centre in board-area pixels (for the HTML action ring). */
export interface WardenPick {
  v: string;
  x: number;
  y: number;
}

/**
 * SVG drawn above the board's click targets: rings on the viewer's wardens that can act. A click
 * selects the warden; its actions open around it as HTML buttons (WardenMenu), sized for fingers
 * whatever the board zoom.
 */
export function WardenLayer({
  legal,
  open,
  setOpen,
  enabled,
}: {
  legal: Action[];
  open: WardenPick | null;
  setOpen: (w: WardenPick | null) => void;
  /** False while another board pick runs (the board then belongs to that pick). */
  enabled: boolean;
}) {
  const { t } = useI18n();
  if (!enabled) return null;
  const byWarden = wardenActions(legal);
  const r = SIZE * 0.42;
  const pick = (v: string, el: Element) => {
    if (open?.v === v) return setOpen(null);
    const area = el.closest('.board-area');
    const a = area?.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (!a) return;
    setOpen({ v, x: (b.left + b.right) / 2 - a.left, y: (b.top + b.bottom) / 2 - a.top });
  };
  return (
    <g className="sh-warden-layer">
      {[...byWarden.keys()].map((v) => {
        const q = vertexPos(v);
        return (
          <circle
            key={v}
            className={open?.v === v ? 'sh-warden-hit open' : 'sh-warden-hit'}
            data-v={v}
            cx={q.x}
            cy={q.y}
            r={r}
            role="button"
            tabIndex={0}
            aria-label={t('shhud_wardenActions')}
            aria-expanded={open?.v === v}
            onClick={(e) => {
              e.stopPropagation();
              pick(v, e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') pick(v, e.currentTarget);
            }}
          />
        );
      })}
    </g>
  );
}

/** The selected warden's actions, fanned around it over the board (HTML, finger-sized). */
export function WardenMenu({
  legal,
  open,
  onClose,
  onStart,
}: {
  legal: Action[];
  open: WardenPick;
  onClose: () => void;
  onStart: OnStart;
}) {
  const { t } = useI18n();
  const items = [...(wardenActions(legal).get(open.v)?.entries() ?? [])];
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // The ring is placed in screen pixels: a press elsewhere or a zoom closes it.
    const away = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el?.closest?.('.sh-wmenu, .sh-warden-hit')) onClose();
    };
    window.addEventListener('keydown', esc);
    window.addEventListener('pointerdown', away);
    window.addEventListener('wheel', onClose, { passive: true });
    return () => {
      window.removeEventListener('keydown', esc);
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('wheel', onClose);
    };
  }, [onClose]);
  if (items.length === 0) return null;
  const R = 70;
  return (
    <div className="sh-wmenu" style={{ left: open.x, top: open.y }} role="menu" aria-label={t('sh_warden')}>
      {items.map(([kind, cands], i) => {
        // Spread over the upper half first (labels read best there).
        const ang = (-90 + (i - (items.length - 1) / 2) * 58) * (Math.PI / 180);
        const x = Math.round(R * Math.cos(ang));
        const y = Math.round(R * Math.sin(ang));
        const right = x >= -4;
        return (
          <button
            key={kind}
            type="button"
            role="menuitem"
            className={right ? 'sh-wmenu-btn' : 'sh-wmenu-btn left'}
            data-sh-warden={kind}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            title={t(`shcost_${kind}`)}
            onClick={() => {
              onClose();
              onStart(cands, t(`shact_${kind}`));
            }}
          >
            <span className="sh-wmenu-glyph" aria-hidden="true">
              {WARDEN_ART[kind] ? (
                <img src={art2dUrl('ui', WARDEN_ART[kind])} alt="" width={34} height={34} draggable={false} />
              ) : (
                GLYPH[kind] && <GameIcon name={GLYPH[kind]} size={22} />
              )}
            </span>
            <span className="sh-wmenu-label">{t(`shact_${kind}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
