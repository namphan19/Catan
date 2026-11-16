// Text for the Strongholds expansion: log lines, toasts and option labels. Display only.
import type { Action, GameEvent, PlayerId } from '@hexgame/engine';
import { resKey } from '../i18n';

export type TFn = (key: string, params?: Record<string, string | number>) => string;
export type NameFn = (id: PlayerId) => string;

export const trackName = (t: TFn, track: unknown): string => t(`track_${String(track)}`);

/** Label of one option in a choice dialog. */
export function valueLabel(field: string, value: unknown, t: TFn, name: NameFn): string {
  if (value === undefined) {
    if (field === 'rebuild') return t('sh_noRebuild');
    return field.startsWith('vs') ? t('sh_done') : t('sh_skip');
  }
  switch (field) {
    case 'track':
    case 'deck':
      return trackName(t, value);
    case 'target':
      return name(String(value));
    case 'resource':
      return t(resKey(String(value)));
    case 'level':
      return t('sh_rank', { n: Number(value) });
    case 'card':
      return `${t(String(value))}: ${t(`cardfx_${String(value)}`)}`;
    case 'rebuild':
      return t('sh_rebuild');
    case 'skip':
      return t('sh_skip');
    default:
      return String(value);
  }
}

/** Question shown for a stage, e.g. "Chọn giao điểm". */
export const stagePrompt = (field: string, t: TFn): string => t(`sh_pick_${field.replace('.', '')}`);

/** Log line for an expansion action (null: not an expansion action). */
export function describeShAction(a: Action, t: TFn, name: NameFn): string | null {
  if (!a.t.startsWith('sh:')) return null;
  const who = name(a.player);
  const x = a as unknown as Record<string, unknown>;
  switch (a.t) {
    case 'sh:improve':
      return t('shlog_improve', { name: who, track: trackName(t, x.track) });
    case 'sh:play':
      return t('shlog_play', { name: who, card: t(String(x.card)) });
    case 'sh:resolve':
      return t('shlog_resolve', { name: who });
    default:
      return t(`shlog_${a.t.slice(3)}`, { name: who });
  }
}

/** Toast / feed line for an expansion event ('' = say nothing). */
export function describeShEvent(ev: Extract<GameEvent, { e: 'ext' }>, t: TFn, name: NameFn): string {
  const d = (ev.data ?? {}) as Record<string, unknown>;
  const who = (k: string): string => (typeof d[k] === 'string' ? name(d[k] as string) : '—');
  const res = (k: string): string => t(resKey(String(d[k])));
  switch (d.type) {
    case 'eventDie':
      return d.face === 'raid' ? t('shev_die_raid') : t('shev_die_track', { track: trackName(t, d.face) });
    case 'raidMoved':
      return t('shev_raidMoved', { n: 7 - Number(d.pos) });
    case 'raid': {
      const base = { raiders: Number(d.raiders), defenders: Number(d.defenders) };
      if (d.result === 'pillage') {
        const names = ((d.victims as string[] | undefined) ?? []).map(name).join(', ') || '—';
        return t('shev_raidLost', { ...base, names });
      }
      return typeof d.hero === 'string'
        ? t('shev_raidHero', { ...base, name: name(d.hero) })
        : t('shev_raidTie', base);
    }
    case 'blockerArrived':
      return t('shev_blocker');
    case 'vpCard':
      return t('shev_vpCard', { name: who('player'), card: t(String(d.card)) });
    case 'drew': {
      const card = (ev.secret as { card?: string } | undefined)?.card;
      const line = t('shev_drew', { name: who('player'), track: trackName(t, d.track) });
      return card ? `${line}: ${t(card)}` : line;
    }
    case 'provision':
      return t('shev_provision', { name: who('player'), res: res('resource') });
    case 'improved':
      return t('shev_improved', { name: who('player'), track: trackName(t, d.track), level: Number(d.level) });
    case 'capital':
      return t('shev_capital', { name: who('to'), track: trackName(t, d.track) });
    case 'pillaged':
      return t('shev_pillaged', { name: who('player') });
    case 'rampart':
      return t('shev_rampart', { name: who('player') });
    case 'played':
      return t('shev_played', { name: who('player'), card: t(String(d.card)) });
    case 'bounty':
      return t('shev_bounty', { name: who('player'), n: Number(d.count), res: res('resource') });
    case 'collected': {
      const n = Object.values((d.taken as Record<string, number> | undefined) ?? {}).reduce((a, b) => a + b, 0);
      return t('shev_collected', { name: who('player'), n, res: res('resource') });
    }
    case 'caravan':
      return t('shev_caravan', { name: who('to') });
    case 'warden':
      return t(`shev_warden_${String(d.op)}`, { name: who('player') });
    case 'roadRemoved':
      return t('shev_roadRemoved', { name: who('owner') });
    case 'rallied':
      return t('shev_rallied', { name: who('player') });
    case 'tithe':
      return t('shev_tithe', { name: who('player'), target: who('target'), n: Number(d.count) });
    case 'dowry':
      return t('shev_dowry', { from: who('from'), to: who('to'), n: Number(d.count) });
    case 'informant':
      return t('shev_informant', { name: who('player'), target: who('target') });
    case 'bazaar':
      return d.gave ? t('shev_bazaar', { from: who('from'), to: who('to') }) : t('shev_bazaarNone', { to: who('to') });
    case 'tokensSwapped':
      return t('shev_swap');
    case 'cardDiscarded':
      return t('shev_cardDiscarded', { name: who('player') });
    default:
      return '';
  }
}
