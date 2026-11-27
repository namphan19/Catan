// Tidelands on the board's edges (PO 2026-11-27 HUD), instead of a docked side column:
// - ScenarioBadge: scenario name + goal in the turn line, an (i) opens the scenario's own rules;
// - tlSeatLine: each player's scenario progress (landfall, silk, rewards, wonder, coves) under the name;
// - GoldPicker: the gold-mine choice as big resource buttons right over the hand (no dialog);
// - tlBuildSlots: cog moves and the scenario actions as round buttons next to the build buttons.
// Everything that can be done comes from getLegalActions; the full panel stays in the drawer.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, PlayerId, PlayerView } from '@hexgame/engine';
import { SCENARIOS } from '@hexgame/engine';
import { RESOURCE_ORDER, resKey, useI18n } from '../i18n';
import { ResourceIcon } from '../ui/ResourceIcon';
import { BuildSlot } from '../table/ActionBar';
import type { TlView } from './view';
import './tidelands.css';
import { GameIcon } from '../ui/GameIcon';
import { art2dUrl } from '../board/assets';

type TFn = (k: string, p?: Record<string, string | number>) => string;

export function ScenarioBadge({ view, tl }: { view: PlayerView; tl: TlView }) {
  const { t } = useI18n();
  const sc = SCENARIOS[tl.scenario];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span className="tl-badge" ref={ref}>
      <span>
        {t(`sc_${tl.scenario}`)} · {t('tl_goal', { n: view.init.vpToWin })}
      </span>
      <button
        type="button"
        className="tl-badge-info"
        aria-label={t('tlhud_rules')}
        title={t('tlhud_rules')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <span className="tl-badge-pop" role="dialog" aria-label={t(`sc_${tl.scenario}`)}>
          <b>{t(`sc_${tl.scenario}`)}</b>
          <span>{t(`sc_${tl.scenario}_desc`)}</span>
          <span>
            {t('tl_goal', { n: view.init.vpToWin })}
            {sc?.landfall ? ` · ${t('tl_landfall', { n: sc.landfall })}` : ''}
          </span>
          {tl.mistLeft > 0 && <span>{t('tl_mistLeft', { n: tl.mistLeft })}</span>}
          {tl.castaways && <span>{t('tl_rewardsLeft', { n: Object.keys(tl.castaways.rewards).length })}</span>}
          {tl.silk && (
            <span>
              {t('tl_villages', {
                n: Object.values(tl.silk.villages).filter((v) => v.silk > 0).length,
                m: Object.keys(tl.silk.villages).length,
                k: tl.silk.endAt,
              })}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** One short line of a player's scenario progress (display only). */
export function tlSeatBits(tl: TlView, id: PlayerId, t: TFn): string[] {
  const sc = SCENARIOS[tl.scenario];
  const bits: string[] = [];
  if (sc?.landfall) bits.push(t('tlhud_landfall', { n: tl.landfall[id]?.length ?? 0 }));
  if (tl.silk) bits.push(`${t('tl_silk')} ${tl.silk.silk[id] ?? 0}`);
  if (tl.castaways) {
    bits.push(`${t('tl_vpTokens')} ${tl.castaways.vpTokens[id] ?? 0}`);
    const held = tl.castaways.held[id]?.length ?? 0;
    if (held) bits.push(`${t('tl_heldHarbors')} ${held}`);
  }
  if (tl.works) {
    const w = Object.keys(tl.works.claims).find((k) => tl.works!.claims[k] === id);
    if (w) bits.push(`${t(`wonder_${w}`)} ${t('tl_level', { n: tl.works.levels[id] ?? 0 })}`);
  }
  if (tl.coves) {
    const lairs = tl.coves.lairs[id] ?? 0;
    bits.push(lairs ? t('tl_fort', { n: lairs }) : t('tl_fortTaken'));
    bits.push(t('tl_war', { n: tl.coves.war[id] ?? 0 }));
  }
  return bits;
}

export function TlSeatLine({ tl, id }: { tl: TlView; id: PlayerId }) {
  const { t } = useI18n();
  const bits = tlSeatBits(tl, id, t);
  return bits.length ? <span className="tl-seat-line">{bits.join(' · ')}</span> : null;
}

const sameBag = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  return true;
};

/**
 * The gold-mine (or reward) choice: N resources of your choice from the bank. Big buttons over the
 * hand; with one card to take a click takes it, with more the picks collect and Take sends them.
 * Only bags that getLegalActions offers can be sent.
 */
export function GoldPicker({ golds, onAction }: { golds: Action[]; onAction: (a: Action) => void }) {
  const { t } = useI18n();
  const need = useMemo(
    () => Object.values((golds[0] as unknown as { bag: Record<string, number> }).bag).reduce((x, y) => x + y, 0),
    [golds],
  );
  const [bag, setBag] = useState<Record<string, number>>({});
  const total = Object.values(bag).reduce((x, y) => x + y, 0);
  const find = (b: Record<string, number>) =>
    golds.find((a) => sameBag((a as unknown as { bag: Record<string, number> }).bag, b));
  // A kind can be added while some legal bag still holds the picks so far plus one of it.
  const canAdd = (r: string) =>
    total < need &&
    golds.some((a) => {
      const g = (a as unknown as { bag: Record<string, number> }).bag;
      return (g[r] ?? 0) >= (bag[r] ?? 0) + 1 && Object.entries(bag).every(([k, n]) => (g[k] ?? 0) >= n);
    });
  const add = (r: string) => {
    const next = { ...bag, [r]: (bag[r] ?? 0) + 1 };
    if (need === 1) {
      const a = find(next);
      if (a) onAction(a);
      return;
    }
    setBag(next);
  };
  const ready = total === need ? find(bag) : undefined;
  return (
    <div className="tl-gold" role="group" aria-label={t('tl_goldTitle', { n: need })}>
      <span className="tl-gold-title">{t('tl_goldTitle', { n: need })}</span>
      <span className="tl-gold-row">
        {RESOURCE_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            className="tl-gold-btn"
            data-res={r}
            disabled={!canAdd(r)}
            aria-label={`${t('tlhud_take')} ${t(resKey(r))}`}
            title={t(resKey(r))}
            onClick={() => add(r)}
          >
            <ResourceIcon res={r} size={40} />
            {(bag[r] ?? 0) > 0 && <span className="tl-gold-n">{bag[r]}</span>}
          </button>
        ))}
      </span>
      {need > 1 && (
        <span className="tl-gold-row">
          <button type="button" className="btn btn-ghost" disabled={total === 0} onClick={() => setBag({})}>
            {t('tlhud_reset')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => ready && onAction(ready)}>
            {t('tlhud_takeN', { n: total, m: need })}
          </button>
        </span>
      )}
    </div>
  );
}

function GlyphIcon({ g }: { g: 'anchor' | 'swords' | 'flag' | 'tower' }) {
  return <GameIcon name={g} size={30} />;
}

/** Cog moves and the scenario's own actions, as round buttons in the build row. */
export function TlBuildSlots({
  view,
  tl,
  legal,
  onStart,
  onAction,
}: {
  view: PlayerView;
  tl: TlView;
  legal: Action[];
  onStart: (cands: Action[], title: string) => void;
  onAction: (a: Action) => void;
}) {
  const { t } = useI18n();
  const of = (type: string) => legal.filter((a) => a.t === type);
  const me = view.players.find((p) => p.id === view.viewer);
  const slots: JSX.Element[] = [];
  if (!tl.coves) {
    const moves = of('tl:moveShip');
    slots.push(
      <BuildSlot
        key="move"
        icon={<img src={art2dUrl('ui', 'move-ship')} alt="" width={38} height={38} draggable={false} />}
        label={t('tl_moveShip')}
        note={t(tl.moved ? 'tlhud_movedAlready' : 'tlhud_moveRule')}
        enabled={moves.length > 0}
        reason={t(tl.moved ? 'tlhud_movedAlready' : 'tlhud_noMove')}
        onClick={() => onStart(moves, t('tl_moveShip'))}
        data="moveShip"
      />,
    );
  }
  if (tl.castaways) {
    const acts = of('tl:placeHarbor');
    slots.push(
      <BuildSlot key="harbor" icon={<GlyphIcon g="anchor" />} label={t('tl_placeHarbor')} enabled={acts.length > 0}
        reason={t('act_unavailable')} onClick={() => onStart(acts, t('tl_placeHarbor'))} data="harbor" />,
    );
  }
  if (tl.coves) {
    const acts = of('tl:arm');
    slots.push(
      <BuildSlot key="arm" icon={<GlyphIcon g="swords" />} label={t('tl_arm')} enabled={acts.length > 0}
        reason={t('act_unavailable')} onClick={() => acts[0] && onAction(acts[0])} data="arm" />,
    );
  }
  if (tl.works) {
    const claim = of('tl:claimWonder');
    const build = of('tl:buildWonder');
    slots.push(
      <BuildSlot key="claim" icon={<GlyphIcon g="flag" />} label={t('tl_claimWonder')} enabled={claim.length > 0}
        reason={t('act_unavailable')} onClick={() => onStart(claim, t('tl_claimWonder'))} data="claimWonder" />,
      <BuildSlot key="wonder" icon={<GlyphIcon g="tower" />} label={t('tl_buildWonder')} enabled={build.length > 0}
        reason={t('act_unavailable')} onClick={() => build[0] && onAction(build[0])} data="buildWonder" />,
    );
  }
  void me;
  return <>{slots}</>;
}
