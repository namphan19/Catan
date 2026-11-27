// Side panel of the Highlands expansion: every player's tribe and culture track, the viewer's goods
// trade and award powers (enabled only when getLegalActions holds a matching action), and a short
// rules reminder. Dialogs only pick among legal actions; the engine decides legality.
import { useState } from 'react';
import type { Action, PlayerView } from '@hexgame/engine';
import { resKey, useI18n } from '../i18n';
import { useAvatar, useName } from '../shell/names';
import { Avatar } from '../ui/Avatar';
import { PanelHero } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ResourceIcon } from '../ui/ResourceIcon';
import type { HlView } from './labels';
import './highlands.css';
import { GameIcon } from '../ui/GameIcon';

const GOALS = [4, 4, 3];
const KINDS = ['timber', 'clay', 'fiber', 'grain', 'stone', 'plume', 'herb', 'fish'];

type Bag = Record<string, number>;
const clean = (b: Bag): Bag => Object.fromEntries(Object.entries(b).filter(([, n]) => n > 0));
const same = (a: Bag | undefined, b: Bag) => JSON.stringify(clean(a ?? {}), Object.keys(clean(a ?? {})).sort()) ===
  JSON.stringify(clean(b), Object.keys(clean(b)).sort());

/** Culture track of one player: three tribes, filled dots for points, the active tribe framed. */
export function Track({ tribe, cp }: { tribe: number; cp: number[] }) {
  return (
    <span className="hl-track">
      {GOALS.map((goal, i) => (
        <span key={i} className={`hl-tribe${i + 1 === tribe ? ' active' : ''}${i + 1 < tribe ? ' done' : ''}`}>
          {Array.from({ length: goal }, (_, k) => (
            <i key={k} className={k < (cp[i] ?? 0) ? 'on' : ''} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** Pick cards with steppers; `pools` caps each kind. */
function Picker({ label, pools, kinds, pick, setPick, need }: {
  label: string; pools: Bag; kinds: string[]; pick: Bag; setPick: (b: Bag) => void; need: number;
}) {
  const { t } = useI18n();
  const total = Object.values(pick).reduce((s, n) => s + n, 0);
  return (
    <div className="hl-picker">
      <p className="hint">
        {label} <b>{total}/{need}</b>
      </p>
      <ul className="pick-list">
        {kinds.filter((r) => (pools[r] ?? 0) > 0).map((r) => (
          <li key={r} className="pick-row">
            <span className="res-chip">
              <ResourceIcon res={r} size={18} />
              <span className="res-name">{t(resKey(r))}</span>
              <span className="res-count">{pools[r] ?? 0}</span>
            </span>
            <span className="sh-stepper">
              <button type="button" className="btn btn-icon" aria-label={`- ${t(resKey(r))}`}
                onClick={() => setPick({ ...pick, [r]: Math.max(0, (pick[r] ?? 0) - 1) })}>
                <GameIcon name="minus" size={14} />
              </button>
              <b data-pick={r}>{pick[r] ?? 0}</b>
              <button type="button" className="btn btn-icon" aria-label={`+ ${t(resKey(r))}`}
                disabled={total >= need || (pick[r] ?? 0) >= (pools[r] ?? 0)}
                onClick={() => setPick({ ...pick, [r]: (pick[r] ?? 0) + 1 })}>
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Goods set (pick 2 resources) or caravan (give 2 cards, take 1): sends the matching legal action. */
export function HlTradeDialog({ kind, view, legal, onAction, onClose }: {
  kind: 'hl:goodsSet' | 'hl:caravan'; view: PlayerView; legal: Action[]; onAction: (a: Action) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [give, setGive] = useState<Bag>({});
  const [get, setGet] = useState<Bag>({});
  const hand = view.players.find((p) => p.id === view.viewer)?.hand ?? {};
  const cands = legal.filter((a) => a.t === kind) as unknown as Array<Action & { give?: Bag; get: Bag }>;
  const match = cands.find((a) => same(a.get, get) && (kind === 'hl:goodsSet' || same(a.give, give)));
  const getKinds = kind === 'hl:goodsSet' ? KINDS.slice(0, 5) : KINDS.filter((r) => !give[r]);
  return (
    <Dialog title={t(kind === 'hl:goodsSet' ? 'hl_goodsSet' : 'hl_caravan')} onClose={onClose}>
      {kind === 'hl:caravan' && (
        <Picker label={t('hl_caravanGive')} pools={hand} kinds={KINDS} pick={give} setPick={(b) => { setGive(b); setGet({}); }} need={2} />
      )}
      <Picker
        label={kind === 'hl:goodsSet' ? t('hl_goodsSetPick') : t('hl_caravanGet')}
        pools={view.bank.hand}
        kinds={getKinds}
        pick={get}
        setPick={setGet}
        need={kind === 'hl:goodsSet' ? 2 : 1}
      />
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onClose}>
          {t('sh_cancel')}
        </Button>
        <Button variant="primary" disabled={!match} onClick={() => match && (onAction(match), onClose())}>
          {t('sh_confirm')}
        </Button>
      </div>
    </Dialog>
  );
}

export function HighlandsPanel({ view, hl, legal, onAction }: {
  view: PlayerView; hl: HlView; legal: Action[]; onAction: (a: Action) => void;
}) {
  const { t } = useI18n();
  const name = useName();
  const [dialog, setDialog] = useState<'hl:goodsSet' | 'hl:caravan' | null>(null);
  const has = (type: string) => legal.some((a) => a.t === type);
  const recall = legal.find((a) => a.t === 'hl:recall');
  const avatar = useAvatar();
  const me = view.viewer;
  return (
    <section className="hl-panel xp-panel" aria-label={t('hl_panel')}>
      <PanelHero art="jungle" kicker={t('xp_kicker')} title={t('hl_panel')} sub={t('hl_goal')} />
      <div className="xp-body">

      <table className="hl-players">
        <tbody>
          {view.players.map((p) => {
            const s = hl.players[p.id];
            if (!s) return null;
            const total = s.cp.reduce((a, b) => a + b, 0);
            return (
              <tr key={p.id} data-hl-player={p.id} className={p.id === me ? 'me' : undefined}>
                <th scope="row" title={name(p.id)}>
                  <span className="xp-seat">
                    <Avatar id={avatar(p.id)} seat={p.id} size={30} />
                    <span className="xp-seat-name">{name(p.id)}</span>
                  </span>
                </th>
                <td title={t('hl_tribe', { n: s.tribe })}>
                  <Track tribe={s.tribe} cp={s.cp} />
                </td>
                <td className="hl-total" title={t('hl_cultureOf', { n: total })}>{total}/11</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {me && (
        <div className="hl-actions">
          <Button variant="ghost" disabled={!has('hl:goodsSet')} onClick={() => setDialog('hl:goodsSet')} data-hl="goodsSet">
            {t('hl_goodsSet')}
          </Button>
          <Button
            variant="ghost"
            disabled={!has('hl:caravan')}
            onClick={() => setDialog('hl:caravan')}
            title={t('hl_caravanHint')}
            data-hl="caravan"
          >
            {t('hl_caravan')}
            {view.awards.longestRoute === me && hl.caravanUsed ? ` (${t('hl_used')})` : ''}
          </Button>
          <Button variant="ghost" disabled={!recall} onClick={() => recall && onAction(recall)} title={t('hl_recallHint')} data-hl="recall">
            {t('hl_recall')}
            {view.awards.largestForce === me && hl.recallUsed ? ` (${t('hl_used')})` : ''}
          </Button>
        </div>
      )}

      <p className="hl-info">{t('hl_rules_short')}</p>
      <p className="hl-info">
        <b>{t('hl_goods')}:</b> {t('hl_goods_rules')}
      </p>
      <p className="hl-info hl-muted">{hl.stack2Joined ? t('hl_stack2In') : t('hl_stack2', { n: hl.stack2Left })}</p>

      </div>
      {dialog && <HlTradeDialog kind={dialog} view={view} legal={legal} onAction={onAction} onClose={() => setDialog(null)} />}
    </section>
  );
}
