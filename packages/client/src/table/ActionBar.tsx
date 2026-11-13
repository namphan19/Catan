// Contextual action bar. Every button's enabled state comes from getLegalActions; the tooltip
// reason of a disabled button comes from validateAction (passed by the shell). No rules here.
import type { Action, PlayerId, PlayerView, Validation } from '@hexgame/engine';
import { useI18n, cardKey } from '../i18n';
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

export function ActionBar({ view, legal, onAction, validate, pending, setPending, onOpenTrade, onOpenCards }: ActionBarProps) {
  const { t } = useI18n();
  const me = (view.viewer ?? 'p1') as PlayerId;
  const has = (tt: string) => legal.some((a) => a.t === tt);

  /** Disabled reason from validateAction on a probe action (engine message, shown as tooltip). */
  const reason = (tt: string): string | undefined => {
    if (has(tt)) return undefined;
    if (!validate) return t('act_unavailable');
    const probe = probeAction(tt, me);
    const v = validate(probe);
    return v.ok ? t('act_unavailable') : `${v.code}: ${v.message}`;
  };

  const send = (a: Action) => onAction(a);
  const toggle = (p: Exclude<Pending, null>) => setPending(pending === p ? null : p);

  const playable = [...new Set(legal.filter((a) => a.t === 'playCard').map((a) => (a as { card: string }).card))];
  const mustRespond = has('respondTrade');
  const confirmables = legal.filter((a) => a.t === 'confirmTrade');

  return (
    <div className="actionbar" role="toolbar" aria-label={t('appTitle')}>
      <Button
        variant="primary"
        disabled={!has('roll')}
        tip={reason('roll')}
        onClick={() => send({ t: 'roll', player: me })}
      >
        🎲 {t('act_roll')}
      </Button>

      <Button
        disabled={!has('placeSettlement')}
        tip={reason('placeSettlement')}
        aria-pressed={pending === 'placeSettlement'}
        className={pending === 'placeSettlement' ? 'active' : undefined}
        onClick={() => toggle('placeSettlement')}
      >
        ⌂ {t('act_buildSettlement')}
      </Button>

      <Button
        disabled={!has('placeRoad')}
        tip={reason('placeRoad')}
        aria-pressed={pending === 'placeRoad'}
        className={pending === 'placeRoad' ? 'active' : undefined}
        onClick={() => toggle('placeRoad')}
      >
        — {t('act_buildRoad')}
      </Button>

      <Button
        disabled={!has('buildCity')}
        tip={reason('buildCity')}
        aria-pressed={pending === 'buildCity'}
        className={pending === 'buildCity' ? 'active' : undefined}
        onClick={() => toggle('buildCity')}
      >
        🏛 {t('act_buildCity')}
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

      <Button disabled={!has('buyCard')} tip={reason('buyCard')} onClick={() => send({ t: 'buyCard', player: me })}>
        🃏 {t('act_buyCard')}
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
        tip={mustRespond ? undefined : reason('bankTrade')}
        onClick={() => onOpenTrade('bank')}
      >
        🏦 {t('act_bankTrade')}
      </Button>

      <Button
        variant={mustRespond || confirmables.length > 0 ? 'primary' : 'ghost'}
        className={mustRespond ? 'pulse' : undefined}
        tip={mustRespond || confirmables.length > 0 ? t('tradeBadge') : reason('offerTrade')}
        onClick={() => onOpenTrade('players')}
      >
        🤝 {t('act_playerTrade')}
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
        tip={reason('endTurn')}
        onClick={() => send({ t: 'endTurn', player: me })}
      >
        ⏭ {t('act_endTurn')}
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
