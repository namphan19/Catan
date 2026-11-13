// Contextual action bar. Every button's enabled state comes from getLegalActions; the tooltip
// reason of a disabled button comes from validateAction (passed by the shell), translated by
// error code (BUG-QA-03). No rules logic here.
import { useEffect, useState } from 'react';
import type { Action, PlayerId, PlayerView, Validation } from '@hexgame/engine';
import { useI18n, cardKey } from '../i18n';
import { validationText } from '../net/errors';
import { Button } from '../ui/Button';

export type Pending = 'placeSettlement' | 'placeRoad' | 'buildCity' | 'moveBlocker' | null;

interface ActionBarProps {
  view: PlayerView;
  legal: Action[];
  onAction: (a: Action) => void;
  validate?: (a: Action) => Validation;
  pending: Pending;
  setPending: (p: Pending) => void;
  onOpenTrade: (tab: 'bank' | 'players') => void;
  onOpenCards: (card: 'harvest' | 'claim') => void;
}

const PLACEHOLDER = { v: 'v:0,0,N', e: 'e:0,0,NE', hex: 'h:0,0' };

/** True below the compact breakpoint (tablet ~1024 px): short labels are shown and the
 * full label moves into the tooltip (V6). */
function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1180px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1180px)');
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

export function ActionBar({ view, legal, onAction, validate, pending, setPending, onOpenTrade, onOpenCards }: ActionBarProps) {
  const { t } = useI18n();
  const compact = useCompact();
  const me = (view.viewer ?? 'p1') as PlayerId;
  const has = (tt: string) => legal.some((a) => a.t === tt);

  /** Disabled reason from validateAction on a probe action, translated by code (unknown
   * codes show a generic "not possible right now" line — never raw engine English). */
  const reason = (tt: string): string | undefined => {
    if (has(tt)) return undefined;
    if (!validate) return t('act_unavailable');
    const probe = probeAction(tt, me);
    const v = validate(probe);
    return v.ok ? t('act_unavailable') : validationText(v.code, t);
  };

  /** Tooltip: translated disable reason, or (when compact) the full label that the short
   * on-button text abbreviates. */
  const tipOf = (tt: string, fullKey: string): string | undefined => reason(tt) ?? (compact ? t(fullKey) : undefined);

  const send = (a: Action) => onAction(a);
  const toggle = (p: Exclude<Pending, null>) => setPending(pending === p ? null : p);

  const playable = [...new Set(legal.filter((a) => a.t === 'playCard').map((a) => (a as { card: string }).card))];
  const mustRespond = has('respondTrade');
  const confirmables = legal.filter((a) => a.t === 'confirmTrade');

  /** Full + short label pair; the short one is only visible below the compact breakpoint. */
  const label = (fullKey: string, shortKey: string) => (
    <>
      <span className="lbl-full">{t(fullKey)}</span>
      <span className="lbl-short">{t(shortKey)}</span>
    </>
  );

  return (
    <div className="actionbar" role="toolbar" aria-label={t('appTitle')}>
      <Button
        variant="primary"
        disabled={!has('roll')}
        tip={tipOf('roll', 'act_roll')}
        onClick={() => send({ t: 'roll', player: me })}
      >
        🎲 {label('act_roll', 'act_roll_s')}
      </Button>

      <Button
        disabled={!has('placeSettlement')}
        tip={tipOf('placeSettlement', 'act_buildSettlement')}
        aria-pressed={pending === 'placeSettlement'}
        className={pending === 'placeSettlement' ? 'active' : undefined}
        onClick={() => toggle('placeSettlement')}
      >
        ⌂ {label('act_buildSettlement', 'act_settlement_s')}
      </Button>

      <Button
        disabled={!has('placeRoad')}
        tip={tipOf('placeRoad', 'act_buildRoad')}
        aria-pressed={pending === 'placeRoad'}
        className={pending === 'placeRoad' ? 'active' : undefined}
        onClick={() => toggle('placeRoad')}
      >
        — {label('act_buildRoad', 'act_road_s')}
      </Button>

      <Button
        disabled={!has('buildCity')}
        tip={tipOf('buildCity', 'act_buildCity')}
        aria-pressed={pending === 'buildCity'}
        className={pending === 'buildCity' ? 'active' : undefined}
        onClick={() => toggle('buildCity')}
      >
        🏛 {label('act_buildCity', 'act_city_s')}
      </Button>

      {has('moveBlocker') && (
        <Button
          variant="primary"
          aria-pressed={pending === 'moveBlocker'}
          className={pending === 'moveBlocker' ? 'active' : undefined}
          onClick={() => toggle('moveBlocker')}
        >
          ☠ {t('act_moveBlocker')}
        </Button>
      )}

      <Button disabled={!has('buyCard')} tip={tipOf('buyCard', 'act_buyCard')} onClick={() => send({ t: 'buyCard', player: me })}>
        🃏 {label('act_buyCard', 'act_buyCard_s')}
      </Button>

      {playable.map((card) =>
        card === 'harvest' || card === 'claim' ? (
          <Button key={card} onClick={() => onOpenCards(card)}>
            ✨ {t(cardKey(card))}
          </Button>
        ) : (
          <Button key={card} onClick={() => send({ t: 'playCard', player: me, card } as Action)}>
            ✨ {t(cardKey(card))}
          </Button>
        ),
      )}

      <Button
        variant={mustRespond ? 'primary' : 'ghost'}
        className={mustRespond ? 'pulse' : undefined}
        tip={mustRespond ? undefined : tipOf('bankTrade', 'act_bankTrade')}
        onClick={() => onOpenTrade('bank')}
      >
        🏦 {label('act_bankTrade', 'act_bankTrade_s')}
      </Button>

      <Button
        variant={mustRespond || confirmables.length > 0 ? 'primary' : 'ghost'}
        className={mustRespond ? 'pulse' : undefined}
        tip={mustRespond || confirmables.length > 0 ? t('tradeBadge') : tipOf('offerTrade', 'act_playerTrade')}
        onClick={() => onOpenTrade('players')}
      >
        🤝 {label('act_playerTrade', 'act_playerTrade_s')}
        {mustRespond ? <span className="badge" aria-label={t('tradeBadge')}>1</span> : null}
      </Button>

      {has('cancelTrade') && (
        <Button variant="danger" onClick={() => send({ t: 'cancelTrade', player: me })}>
          ✖ {t('act_cancelOffer')}
        </Button>
      )}

      <Button
        variant="primary"
        disabled={!has('endTurn')}
        tip={tipOf('endTurn', 'act_endTurn')}
        onClick={() => send({ t: 'endTurn', player: me })}
      >
        ⏭ {label('act_endTurn', 'act_endTurn_s')}
      </Button>
    </div>
  );
}

function probeAction(tt: string, me: PlayerId): Action {
  switch (tt) {
    case 'placeSettlement':
      return { t: 'placeSettlement', player: me, v: PLACEHOLDER.v };
    case 'placeRoad':
      return { t: 'placeRoad', player: me, e: PLACEHOLDER.e };
    case 'buildCity':
      return { t: 'buildCity', player: me, v: PLACEHOLDER.v };
    case 'moveBlocker':
      return { t: 'moveBlocker', player: me, hex: PLACEHOLDER.hex };
    default:
      return { t: tt, player: me } as unknown as Action;
  }
}
