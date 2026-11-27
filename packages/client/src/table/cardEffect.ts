// What a development card does, in words, for the game being played (PO 2026-11-28: every card says
// its effect before it is used, painted or text-only). Expansions change some cards, so the text
// is picked per mode: Highlands (claim takes at most 2, knights raise the hand limit), Tidelands
// (roads or cogs, the corsair, Corsair Coves arms a cog). Numbers come from the configs.
import { baseConfig, HL, type PlayerView } from '@hexgame/engine';
import { tlOf } from '../tidelands/view';

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** i18n key suffix of the variant of `card` played in this game ('' = the base text). */
function variant(card: string, view: PlayerView): string {
  if (view.init.rulesetIds.includes('highlands')) return ['guard', 'harvest', 'claim'].includes(card) ? '_hl' : '';
  const tl = tlOf(view);
  if (!tl) return '';
  if (card === 'guard') return tl.coves ? '_coves' : tl.corsair ? '_tl' : '';
  if (card === 'freeRoads') return '_tl';
  return '';
}

/** The effect text of a development card (guard, freeRoads, harvest, claim, relic) in this game. */
export function devCardEffect(card: string, view: PlayerView, t: TFn): string {
  const hl = view.init.rulesetIds.includes('highlands');
  const force = baseConfig.awards.largestForce;
  const params = {
    roads: baseConfig.freeRoadsCount,
    take: baseConfig.harvestCount,
    fmin: hl ? HL.largestForceMin : force.min,
    fvp: force.vp,
    max: HL.claimMax,
  };
  const key = `cardfx_dev_${card}`;
  const v = variant(card, view);
  const text = t(key + v, params);
  return text === key + v ? t(key, params) : text;
}
