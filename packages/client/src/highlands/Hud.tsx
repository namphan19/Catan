// Highlands on the board's edges (PO 2026-11-27 HUD), instead of a docked side column:
// - HlSeatLine: each player's three tribes as pip groups under the name (active tribe underlined);
// - HlBuildSlots: the goods set trade and the award powers (caravan, recall) as round buttons that
//   glow while you may use them;
// - FoundMoment: the big "your tribe declined" line over the board while the new tribe is founded.
// Everything that can be done comes from getLegalActions; the full panel stays in the drawer.
import type { Action, PlayerId, PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { art2dUrl } from '../board/assets';
import { ResourceIcon } from '../ui/ResourceIcon';
import { BuildSlot } from '../table/ActionBar';
import { Track } from './HighlandsPanel';
import type { HlView } from './labels';
import './highlands.css';
import { GameIcon } from '../ui/GameIcon';
import { PieceIcon } from '../ui/Icon';
import { playerColor } from '../ui/colors';

export function HlSeatLine({ hl, id }: { hl: HlView; id: PlayerId }) {
  const { t } = useI18n();
  const s = hl.players[id];
  if (!s) return null;
  return (
    <span className="hl-seat-line" title={t('hl_tribe', { n: s.tribe })}>
      <Track tribe={s.tribe} cp={s.cp} />
    </span>
  );
}

function Glyph({ g }: { g: 'undo' }) {
  return <GameIcon name={g} size={30} />;
}

export function HlBuildSlots({
  view,
  hl,
  legal,
  onAction,
  onDialog,
}: {
  view: PlayerView;
  hl: HlView;
  legal: Action[];
  onAction: (a: Action) => void;
  /** Open the goods-set or caravan dialog (rendered by the table, outside the folding build menu). */
  onDialog: (kind: 'hl:goodsSet' | 'hl:caravan') => void;
}) {
  const { t } = useI18n();
  const has = (type: string) => legal.some((a) => a.t === type);
  const recall = legal.find((a) => a.t === 'hl:recall');
  const me = view.viewer;
  const holdsRoute = !!me && view.awards.longestRoute === me;
  const holdsForce = !!me && view.awards.largestForce === me;
  return (
    <>
      <BuildSlot
        icon={<ResourceIcon res="plume" size={28} />}
        label={t('hl_goodsSet')}
        note={t('hlhud_goodsSetNote')}
        cost={{ plume: 1, herb: 1, fish: 1 }}
        hand={view.players.find((p) => p.id === me)?.hand}
        enabled={has('hl:goodsSet')}
        reason={t('hlhud_goodsSetNo')}
        onClick={() => onDialog('hl:goodsSet')}
        data="goodsSet"
      />
      {holdsRoute && (
        <span className={`hl-power${has('hl:caravan') ? ' ready' : ''}`}>
          <BuildSlot
            icon={<PieceIcon kind="caravan" color={playerColor(view.viewer ?? "")} size={32} />}
            label={t('hl_caravan')}
            note={t('hl_caravanHint')}
            enabled={has('hl:caravan')}
            reason={hl.caravanUsed ? t('hl_used') : t('act_unavailable')}
            onClick={() => onDialog('hl:caravan')}
            data="caravan"
          />
        </span>
      )}
      {holdsForce && (
        <span className={`hl-power${recall ? ' ready' : ''}`}>
          <BuildSlot
            icon={<Glyph g="undo" />}
            label={t('hl_recall')}
            note={t('hl_recallHint')}
            enabled={!!recall}
            reason={hl.recallUsed ? t('hl_used') : t('act_unavailable')}
            onClick={() => recall && onAction(recall)}
            data="recall"
          />
        </span>
      )}
    </>
  );
}

/** Over the board while the viewer founds a new tribe (display only; the pick is on the board). */
export function FoundMoment() {
  const { t } = useI18n();
  return (
    <div className="hl-moment" aria-hidden="true">
      <span className="hl-moment-kicker">{t('hlhud_declineKicker')}</span>
      <span className="hl-moment-title">{t('hlhud_declineTitle')}</span>
      <span className="hl-moment-sub">{t('hlhud_declineSub')}</span>
    </div>
  );
}
