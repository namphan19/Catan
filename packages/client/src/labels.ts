// Readable labels for actions, events and phases. Display code only: the engine decides what is
// legal; this file never computes anything about the game.
import type { Action, Bag, GameEvent, Phase } from '@hexgame/engine';

export function fmtBag(b?: Bag): string {
  if (!b) return 'nothing';
  return (
    Object.entries(b)
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `${n} ${r}`)
      .join(', ') || 'nothing'
  );
}

/** "v:1,-2,N" -> "(1,-2 N)", "e:0,3,W" -> "[0,3 W]", "h:2,1" -> "{2,1}" */
export function shortId(id: string): string {
  const tag = id.slice(0, 1);
  const rest = id.slice(2);
  if (tag === 'h') return `{${rest}}`;
  const [a, b, c] = rest.split(',');
  return tag === 'v' ? `(${a},${b} ${c})` : `[${a},${b} ${c}]`;
}

export function describeAction(a: Action): string {
  switch (a.t) {
    case 'placeSettlement':
      return `place settlement at ${shortId(a.v)}`;
    case 'placeRoad':
      return `place road at ${shortId(a.e)}`;
    case 'buildCity':
      return `build a city at ${shortId(a.v)}`;
    case 'roll':
      return 'roll the dice';
    case 'endTurn':
      return 'end turn';
    case 'buyCard':
      return 'buy a card';
    case 'playCard': {
      if (a.card === 'harvest') return `play harvest: take ${(a.resources ?? []).join(' + ') || 'nothing'} from the bank`;
      if (a.card === 'claim') return `play claim: take 1 ${a.resource} from every player`;
      return `play ${a.card}`;
    }
    case 'bankTrade':
      return `bank trade ${fmtBag(a.give)} -> ${fmtBag(a.get)}`;
    case 'offerTrade':
      return `offer trade: give ${fmtBag(a.give)}, get ${fmtBag(a.get)}`;
    case 'respondTrade':
      return a.accept ? 'accept the trade' : 'decline the trade';
    case 'confirmTrade':
      return `confirm trade with ${a.with}`;
    case 'cancelTrade':
      return 'cancel the trade';
    case 'discard':
      return `discard ${fmtBag(a.bag)}`;
    case 'steal':
      return `steal from ${a.target}`;
    case 'moveBlocker':
      return `move blocker to ${shortId(a.hex)}`;
    default: {
      const { t, player, ...rest } = a;
      return `${t}${Object.keys(rest).length ? ' ' + JSON.stringify(rest) : ''}`;
    }
  }
}

export function describeEvent(ev: GameEvent): string {
  switch (ev.e) {
    case 'placed':
      return `${ev.player} placed ${ev.kind} at ${shortId(ev.at)}${ev.free ? ' (free)' : ''}`;
    case 'rolled':
      return `${ev.player} rolled ${ev.dice.join(' + ')} = ${ev.sum}`;
    case 'produced': {
      const parts = Object.entries(ev.gains)
        .filter(([, bag]) => Object.values(bag).some((n) => n > 0))
        .map(([p, bag]) => `${p} +${fmtBag(bag)}`);
      return parts.length ? `production: ${parts.join('; ')}` : 'production: nothing';
    }
    case 'discarded':
      return `${ev.player} discarded ${fmtBag(ev.bag)}`;
    case 'blockerMoved':
      return `${ev.player} moved the blocker to ${shortId(ev.hex)}`;
    case 'stole':
      return `${ev.to} stole ${ev.resource ?? 'an unknown card'} from ${ev.from}`;
    case 'traded':
      return `${ev.a} gave ${fmtBag(ev.aGave)} to ${ev.b} for ${fmtBag(ev.bGave)}`;
    case 'tradeOffered':
      return `${ev.player} offered ${fmtBag(ev.give)} for ${fmtBag(ev.get)}`;
    case 'tradeResponse':
      return `${ev.player} ${ev.accept ? 'accepted' : 'declined'} the trade`;
    case 'tradeCancelled':
      return `${ev.player} cancelled the trade`;
    case 'cardBought':
      return `${ev.player} bought a card${ev.card ? ` (${ev.card})` : ''}`;
    case 'cardPlayed':
      return `${ev.player} played ${ev.card}`;
    case 'awardChanged':
      return `award ${ev.award}: now held by ${ev.to ?? 'nobody'}${ev.from ? ` (was ${ev.from})` : ''}`;
    case 'phase':
      return `phase: ${ev.phase}`;
    case 'turnStarted':
      return `turn ${ev.n} started: ${ev.player}`;
    case 'won':
      return `${ev.player} wins with ${ev.vp} VP!`;
    case 'ext':
      return `ext ${ev.id}: ${JSON.stringify(ev.data)}`;
    default:
      return JSON.stringify(ev);
  }
}

export function phaseText(p: Phase): string {
  switch (p.k) {
    case 'setup':
      return `setup: seat ${p.idx}, place ${p.step}${p.at ? ` near ${shortId(p.at)}` : ''}`;
    case 'discard':
      return `discard: owed ${Object.entries(p.owed)
        .filter(([, n]) => n > 0)
        .map(([pl, n]) => `${pl}:${n}`)
        .join(', ')}`;
    case 'moveBlocker':
      return `move blocker (then ${p.resume})`;
    case 'steal':
      return `steal from ${p.from.join(', ')} (then ${p.resume})`;
    case 'freeRoads':
      return `free roads: ${p.left} left`;
    case 'extraBuild':
      return `extra build: queue ${p.queue.join(', ')}`;
    default:
      return p.k;
  }
}
