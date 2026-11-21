// Text for the Tidelands expansion: log lines and toasts. Display only.
import type { Action, GameEvent, PlayerId } from '@hexgame/engine';
import { resKey } from '../i18n';

type TFn = (key: string, params?: Record<string, string | number>) => string;
type NameFn = (id: PlayerId) => string;

/** Log line for a tidelands action (null: not one). */
export function describeTlAction(a: Action, t: TFn, name: NameFn): string | null {
  if (!a.t.startsWith('tl:')) return null;
  const x = a as Action & Record<string, unknown>;
  const who = name(a.player);
  switch (a.t) {
    case 'tl:stealSilk':
      return t('log_tl_stealSilk', { name: who, name2: name(String(x.target)) });
    case 'tl:claimWonder':
      return t('log_tl_claimWonder', { name: who, wonder: t(`wonder_${String(x.wonder)}`) });
    default:
      return t(`log_${a.t.replace(':', '_')}`, { name: who });
  }
}

/** Toast / feed line for a tidelands event ('' = say nothing). */
export function describeTlEvent(ev: Extract<GameEvent, { e: 'ext' }>, t: TFn, name: NameFn): string {
  const d = (ev.data ?? {}) as Record<string, unknown>;
  const who = typeof d.player === 'string' ? name(d.player) : '';
  switch (d.type) {
    case 'discovered':
      return t('tlev_discovered', { name: who, terrain: t(`terrain_${String(d.terrain)}`) + (d.gain ? ` (+1 ${t(resKey(String(d.gain)))})` : '') });
    case 'landfall':
      return t('tlev_landfall', { name: who, n: Number(d.vp ?? 0) });
    case 'reward':
      return t(`tlev_reward_${String(d.kind)}`, { name: who });
    case 'harborPlaced':
      return t('tlev_harborPlaced', { name: who });
    case 'tradeOpened':
      return t('tlev_tradeOpened', { name: who });
    case 'silk': {
      const gains = (d.gains ?? {}) as Record<string, number>;
      return t('tlev_silk', { text: Object.entries(gains).map(([id, n]) => `${name(id)} +${n}`).join(' · ') });
    }
    case 'silkStolen':
      return t('tlev_silkStolen', { name: name(String(d.to)), name2: name(String(d.from)) });
    case 'wonderClaimed':
      return t('tlev_wonderClaimed', { name: who, wonder: t(`wonder_${String(d.wonder)}`) });
    case 'wonderBuilt':
      return t('tlev_wonderBuilt', { name: who, n: Number(d.level ?? 0) });
    case 'corsairMoved':
      return t('tlev_corsairMoved', { name: who });
    case 'fleet':
      return t('tlev_fleet', { n: Number(d.steps ?? 0) });
    case 'fleetAttack':
      return t(`tlev_fleetAttack_${String(d.result)}`, { name: who, n: Number(d.count ?? 0) });
    case 'fortBattle':
      return t(`tlev_fortBattle_${String(d.result)}`, { name: who, n: Number(d.lairs ?? 0) });
    case 'warship':
      return t('tlev_warship', { name: who });
    case 'corsairArrived':
      return t('tlev_corsairArrived');
    case 'chaseCorsair':
      return t('tlev_chaseCorsair', { name: who });
    default:
      return '';
  }
}
