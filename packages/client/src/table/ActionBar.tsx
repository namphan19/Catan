// Contextual action bar, drawn over the foot of the board (PO 2026-11-27 HUD). Every button's
// enabled state comes from getLegalActions; the reason of a disabled button comes from
// validateAction (passed by the shell), translated by error code (BUG-QA-03). No rules logic here.
//
// Left: round icon-only build buttons (road / settlement / city / card, plus expansion builds).
// Hovering or focusing one shows its name, its cost (missing cards dimmed) and, when it is not
// possible, why. Phones fold the build buttons behind one "Build" button. Then the trade button.
// Right: ONE large primary button, "Roll" until the turn can be ended, then "End turn".
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TL, baseConfig, type Action, type PlayerId, type PlayerView, type Validation } from '@hexgame/engine';
import { useI18n, cardKey, resKey, RESOURCE_ORDER } from '../i18n';
import { validationText } from '../net/errors';
import { Button } from '../ui/Button';
import { playerColor } from '../ui/colors';
import { ResourceIcon } from '../ui/ResourceIcon';
import { PieceIcon, UiIcon } from '../ui/Icon';

export type Pending = 'placeSettlement' | 'placeRoad' | 'buildCity' | 'moveBlocker' | 'tl:buildShip' | null;

interface ActionBarProps {
  view: PlayerView;
  legal: Action[];
  onAction: (a: Action) => void;
  validate?: (a: Action) => Validation;
  pending: Pending;
  setPending: (p: Pending) => void;
  onOpenTrade: (tab: 'bank' | 'players') => void;
  onOpenCards: (card: 'harvest' | 'claim') => void;
  /** Dice cheat unlocked: two die pickers next to Roll (? = random) set the roll's `dice`. */
  diceCheat?: boolean;
  /** Expansion build buttons (BuildSlot elements) after the base ones. */
  extraBuild?: ReactNode;
}

const PLACEHOLDER = { v: 'v:0,0,N', e: 'e:0,0,NE', hex: 'h:0,0' };

/** Cost units of a bag in resource order (commodities and goods after the base five). */
function units(bag: Record<string, number>): string[] {
  const order = [...RESOURCE_ORDER, ...Object.keys(bag).filter((r) => !(RESOURCE_ORDER as readonly string[]).includes(r))];
  return order.flatMap((r) => Array.from({ length: bag[r] ?? 0 }, () => r));
}

/**
 * One round build button with its hover card. The visible label is screen-reader text inside the
 * button (so the accessible name and `hasText` lookups stay the full label); phones show it next
 * to the icon in the folded build menu.
 */
export function BuildSlot({
  icon,
  label,
  note,
  cost,
  hand,
  enabled,
  reason,
  pressed,
  onClick,
  data,
}: {
  icon: ReactNode;
  label: string;
  /** Short extra line in the card, e.g. "+1 VP". */
  note?: string;
  cost?: Record<string, number>;
  hand?: Record<string, number>;
  enabled: boolean;
  /** Why it is not possible (validateAction), shown when disabled. */
  reason?: string;
  pressed?: boolean;
  onClick: () => void;
  data?: string;
}) {
  const { t } = useI18n();
  const list = cost ? units(cost) : [];
  const seen: Record<string, number> = {};
  const marks = list.map((r) => {
    seen[r] = (seen[r] ?? 0) + 1;
    return { r, ok: !hand || (hand[r] ?? 0) >= seen[r] };
  });
  const missing: Record<string, number> = {};
  for (const m of marks) if (!m.ok) missing[m.r] = (missing[m.r] ?? 0) + 1;
  const missingText = Object.entries(missing)
    .map(([r, n]) => `${n} ${t(resKey(r))}`)
    .join(', ');
  const can = marks.length > 0 && marks.every((m) => m.ok);
  return (
    <span className={`build-slot${can ? ' affordable' : ''}`}>
      <button
        type="button"
        className={`btn build-btn${pressed ? ' active' : ''}`}
        disabled={!enabled}
        aria-pressed={pressed}
        data-build={data}
        onClick={onClick}
      >
        <span className="build-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="act-lbl">{label}</span>
      </button>
      <span className="build-tip" role="tooltip">
        <b>{label}</b>
        {note && <small>{note}</small>}
        {marks.length > 0 && (
          <span className="build-tip-cost">
            {marks.map((m, i) => (
              <span key={i} className={m.ok ? 'cost-unit' : 'cost-unit missing'}>
                <ResourceIcon res={m.r} size={22} />
              </span>
            ))}
          </span>
        )}
        {!enabled && reason ? (
          <span className="build-tip-why">{reason}</span>
        ) : missingText ? (
          <span className="build-tip-why">{t('cost_missing', { list: missingText })}</span>
        ) : can ? (
          <span className="build-tip-ok">{t('cost_ready')}</span>
        ) : null}
      </span>
    </span>
  );
}

export function ActionBar({
  view,
  legal,
  onAction,
  validate,
  pending,
  setPending,
  onOpenTrade,
  onOpenCards,
  diceCheat,
  extraBuild,
}: ActionBarProps) {
  const { t } = useI18n();
  const me = (view.viewer ?? 'p1') as PlayerId;
  const color = playerColor(me);
  const hand = view.players.find((p) => p.id === me)?.hand;
  const has = (tt: string) => legal.some((a) => a.t === tt);

  /** Disabled reason from validateAction on a probe action, translated by code (unknown
   * codes show a generic "not possible right now" line — never raw engine English). */
  const reason = (tt: string): string | undefined => {
    if (has(tt)) return undefined;
    if (!validate) return t('act_unavailable');
    const probe = probeAction(tt, me);
    const v = validate(probe);
    if (v.ok) return t('act_unavailable');
    // The probe uses a placeholder spot, so a location error only means "affordable, but no
    // valid spot anywhere": say that, with what to do about it.
    if (LOCATION_CODES.has(v.code) && (tt === 'placeSettlement' || tt === 'placeRoad' || tt === 'buildCity'))
      return t(`act_noSpot_${tt}`);
    return validationText(v.code, t);
  };

  const send = (a: Action) => onAction(a);

  /** Dice cheat: the chosen face of each production die (null = random); reset after each roll. */
  const [pick, setPick] = useState<(number | null)[]>([null, null]);
  const cycle = (i: number) => setPick((p) => p.map((v, j) => (j !== i ? v : v === null ? 1 : v === 6 ? null : v + 1)));
  const rollNow = () => {
    if (diceCheat && pick.some((v) => v !== null)) {
      const dice = pick.map((v) => v ?? 1 + Math.floor(Math.random() * 6)) as [number, number];
      send({ t: 'roll', player: me, dice });
    } else send({ t: 'roll', player: me });
    setPick([null, null]);
  };

  // Phones: the build buttons fold behind one "Build" button; a pick or a click outside closes it.
  const [buildOpen, setBuildOpen] = useState(false);
  const buildRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!buildOpen) return;
    const away = (e: PointerEvent) => {
      if (!buildRef.current?.contains(e.target as Node)) setBuildOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuildOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [buildOpen]);

  const toggle = (p: Exclude<Pending, null>) => setPending(pending === p ? null : p);

  const playable = [...new Set(legal.filter((a) => a.t === 'playCard').map((a) => (a as { card: string }).card))];
  const mustRespond = has('respondTrade');
  const confirmables = legal.filter((a) => a.t === 'confirmTrade');
  const tradeHot = mustRespond || confirmables.length > 0;
  const tradeOk = tradeHot || has('bankTrade') || has('offerTrade') || has('cancelTrade');
  const vpNote = (item: string) => {
    const vp = baseConfig.buildingVP[item];
    return vp ? `+${vp} ${t('vpShort')}` : undefined;
  };
  const anyBuild =
    has('placeRoad') || has('placeSettlement') || has('buildCity') || has('buyCard') || has('tl:buildShip') ||
    legal.some((a) => a.t === 'sh:rampart' || a.t === 'sh:recruit');

  return (
    <div className="actionbar" role="toolbar" aria-label={t('appTitle')}>
      <div className="act-strip">
        <div className="act-build-wrap" ref={buildRef}>
          <button
            type="button"
            className={`btn hud-round act-build-toggle${anyBuild ? ' ready' : ''}`}
            aria-expanded={buildOpen}
            onClick={() => setBuildOpen((o) => !o)}
          >
            <UiIcon name="build" size={22} />
            <span className="act-lbl">{t('act_build')}</span>
          </button>
          <div className="act-group act-build" data-open={buildOpen ? 'true' : undefined} onClick={(e) => {
            if ((e.target as HTMLElement).closest('button:not([disabled])')) setBuildOpen(false);
          }}>
            <BuildSlot
              icon={<PieceIcon kind="road" color={color} size={22} />}
              label={t('act_buildRoad')}
              cost={baseConfig.costs.road as Record<string, number>}
              hand={hand}
              enabled={has('placeRoad')}
              reason={reason('placeRoad')}
              pressed={pending === 'placeRoad'}
              onClick={() => toggle('placeRoad')}
              data="road"
            />
            {!!view.ext?.tidelands && (
              <BuildSlot
                icon={<PieceIcon kind="ship" color={color} size={26} />}
                label={t('cost_ship')}
                cost={TL.costs.ship as Record<string, number>}
                hand={hand}
                enabled={has('tl:buildShip')}
                reason={has('tl:buildShip') ? undefined : t('act_unavailable')}
                pressed={pending === 'tl:buildShip'}
                onClick={() => toggle('tl:buildShip')}
                data="ship"
              />
            )}
            <BuildSlot
              icon={<PieceIcon kind="settlement" color={color} size={28} />}
              label={t('act_buildSettlement')}
              note={vpNote('settlement')}
              cost={baseConfig.costs.settlement as Record<string, number>}
              hand={hand}
              enabled={has('placeSettlement')}
              reason={reason('placeSettlement')}
              pressed={pending === 'placeSettlement'}
              onClick={() => toggle('placeSettlement')}
              data="settlement"
            />
            <BuildSlot
              icon={<PieceIcon kind="city" color={color} size={30} />}
              label={t('act_buildCity')}
              note={vpNote('city')}
              cost={baseConfig.costs.city as Record<string, number>}
              hand={hand}
              enabled={has('buildCity')}
              reason={reason('buildCity')}
              pressed={pending === 'buildCity'}
              onClick={() => toggle('buildCity')}
              data="city"
            />
            {/* Strongholds has no base card deck (rules section 1): no "buy card" button there. */}
            {!view.ext?.strongholds && (
              <BuildSlot
                icon={<UiIcon name="card" size={24} />}
                label={t('act_buyCard')}
                cost={baseConfig.costs.card as Record<string, number>}
                hand={hand}
                enabled={has('buyCard')}
                reason={reason('buyCard')}
                onClick={() => send({ t: 'buyCard', player: me })}
                data="card"
              />
            )}
            {extraBuild}
          </div>
        </div>

        {has('moveBlocker') && (
          <Button
            variant="primary"
            aria-pressed={pending === 'moveBlocker'}
            className={pending === 'moveBlocker' ? 'act-pill active' : 'act-pill'}
            onClick={() => toggle('moveBlocker')}
          >
            {t('act_moveBlocker')}
          </Button>
        )}

        {playable.map((card) => (
          <Button
            key={card}
            className="btn-play act-pill"
            onClick={() =>
              card === 'harvest' || card === 'claim' ? onOpenCards(card) : send({ t: 'playCard', player: me, card } as Action)
            }
          >
            <UiIcon name="card" size={18} /> {t('act_playCards')}: {t(cardKey(card))}
          </Button>
        ))}

        <div className="act-group act-trade">
          <Button
            className={`hud-round act-trade-btn${tradeHot ? ' hot pulse' : ''}`}
            tip={tradeHot ? t('tradeBadge') : tradeOk ? undefined : reason('bankTrade')}
            onClick={() => onOpenTrade(tradeHot || view.trade ? 'players' : 'bank')}
          >
            <UiIcon name="trade" size={24} />
            <span className="act-lbl">{t('act_trade')}</span>
            {mustRespond ? <span className="badge" aria-label={t('tradeBadge')}>1</span> : null}
          </Button>

          {has('cancelTrade') && (
            <Button variant="danger" className="act-pill" onClick={() => send({ t: 'cancelTrade', player: me })}>
              ✖ {t('act_cancelOffer')}
            </Button>
          )}
        </div>

        {diceCheat && has('roll') && (
          <div className="act-group act-dice" role="group" aria-label={t('cheat_pick')}>
            {pick.map((v, i) => (
              <button
                key={i}
                type="button"
                className={`btn btn-ghost die-pick${v === null ? '' : ' set'}`}
                title={t('cheat_pickTip')}
                aria-label={`${t('cheat_pick')} ${i + 1}: ${v ?? '?'}`}
                onClick={() => cycle(i)}
              >
                {v ?? '?'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="act-group act-primary">
        {has('endTurn') ? (
          <Button
            variant="primary"
            // Nothing left to build or play: remind the player to pass the turn.
            className={legal.some((a) => BUILD_LIKE.has(a.t)) ? undefined : 'pulse'}
            onClick={() => send({ t: 'endTurn', player: me })}
          >
            <UiIcon name="end" size={20} /> <span className="lbl-full">{t('act_endTurn')}</span>
          </Button>
        ) : (
          <Button
            variant="primary"
            className={has('roll') ? 'pulse' : undefined}
            disabled={!has('roll')}
            tip={reason('roll')}
            onClick={rollNow}
          >
            <UiIcon name="roll" size={20} /> <span className="lbl-full">{t('act_roll')}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Actions that still make the turn worth staying in (trades and moves of wardens do not count). */
const BUILD_LIKE = new Set([
  'placeRoad', 'placeSettlement', 'buildCity', 'buyCard', 'playCard',
  'sh:improve', 'sh:rampart', 'sh:recruit', 'sh:promote', 'sh:activate', 'sh:play',
]);

const LOCATION_CODES = new Set([
  'BAD_VERTEX', 'BAD_EDGE', 'DISTANCE_RULE', 'NOT_CONNECTED', 'OCCUPIED', 'NOT_YOUR_SETTLEMENT',
]);

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
