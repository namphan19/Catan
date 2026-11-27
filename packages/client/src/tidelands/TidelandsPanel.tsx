// Drawer panel of the Tidelands expansion (PO 2026-11-28): painted harbour hero with the scenario, goal chips, the viewer's sea actions (enabled
// only when getLegalActions holds a matching action) and every player's scenario progress.
import type { Action, PlayerView } from '@hexgame/engine';
import { SCENARIOS } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useAvatar, useName } from '../shell/names';
import { playerColor } from '../ui/colors';
import { Avatar } from '../ui/Avatar';
import { GameIcon } from '../ui/GameIcon';
import { PieceIcon } from '../ui/Icon';
import { PanelHero, UiArt, XpAction, XpSection } from '../ui/Drawer';
import type { TlView } from './view';
import { art2dUrl, useAssets } from '../board/assets';
import './tidelands.css';

/** Small painted wonder card (art2d/card/wonder-<id>.webp) once it has loaded; nothing before. */
function WonderArt({ id }: { id: string }) {
  const url = art2dUrl('card', `wonder-${id}`);
  const ok = useAssets([url])[url];
  return ok ? <img className="tl-wonder-art" src={url} alt="" /> : null;
}

interface PanelProps {
  view: PlayerView;
  tl: TlView;
  legal: Action[];
  /** Arm a board pick for this action type (e.g. tl:buildShip). */
  onPick: (type: string) => void;
  /** Start the staged chooser with these legal actions. */
  onStart: (cands: Action[], title: string) => void;
  onAction: (a: Action) => void;
}

const WONDER_NEEDS: Record<string, string> = {
  cathedral: 'twoCities', seaWall: 'atWall', kingsBridge: 'atBridge', obelisk: 'portCityAndRoute',
  highKeep: 'cityAndVP', beacon: 'atBeacon', scriptorium: 'twoCities',
};

export function TidelandsPanel({ view, tl, legal, onPick, onStart, onAction }: PanelProps) {
  const { t } = useI18n();
  const name = useName();
  const avatar = useAvatar();
  const sc = SCENARIOS[tl.scenario];
  const of = (type: string) => legal.filter((a) => a.t === type);
  const me = view.viewer;
  const mine = view.players.find((p) => p.id === me);

  const icons: Record<string, React.ReactNode> = {
    build: <PieceIcon kind="ship" color={me ? playerColor(me) : '#e9e0cc'} size={38} />,
    move: <UiArt name="move-ship" size={38} />,
    harbor: <GameIcon name="anchor" size={26} />,
    arm: <GameIcon name="swords" size={26} />,
    claim: <GameIcon name="flag" size={26} />,
    wonder: <GameIcon name="tower" size={26} />,
  };
  const buttons: Array<{ key: string; label: string; acts: Action[]; run: () => void }> = [
    { key: 'build', label: t('tl_buildShip'), acts: of('tl:buildShip'), run: () => onPick('tl:buildShip') },
    { key: 'move', label: t('tl_moveShip'), acts: of('tl:moveShip'), run: () => onStart(of('tl:moveShip'), t('tl_moveShip')) },
    { key: 'harbor', label: t('tl_placeHarbor'), acts: of('tl:placeHarbor'), run: () => onStart(of('tl:placeHarbor'), t('tl_placeHarbor')) },
    { key: 'arm', label: t('tl_arm'), acts: of('tl:arm'), run: () => onAction(of('tl:arm')[0]) },
    { key: 'claim', label: t('tl_claimWonder'), acts: of('tl:claimWonder'), run: () => onStart(of('tl:claimWonder'), t('tl_claimWonder')) },
    { key: 'wonder', label: t('tl_buildWonder'), acts: of('tl:buildWonder'), run: () => onAction(of('tl:buildWonder')[0]) },
  ];
  const showWonder = !!tl.works;
  const showArm = !!tl.coves;
  const showHarbor = !!tl.castaways;
  const visible = buttons.filter(
    (b) =>
      ((b.key === 'claim' || b.key === 'wonder') && showWonder) ||
      (b.key === 'arm' && showArm) ||
      (b.key === 'harbor' && showHarbor) ||
      b.key === 'build' ||
      (b.key === 'move' && !tl.coves),
  );

  const chips: string[] = [t('tl_goal', { n: view.init.vpToWin })];
  if (sc?.landfall) chips.push(t('tl_landfallChip', { n: sc.landfall }));
  if (tl.mistLeft > 0) chips.push(t('tl_mistLeft', { n: tl.mistLeft }));
  if (tl.castaways) chips.push(t('tl_rewardsLeft', { n: Object.keys(tl.castaways.rewards).length }));
  if (tl.silk)
    chips.push(
      t('tl_villages', {
        n: Object.values(tl.silk.villages).filter((v) => v.silk > 0).length,
        m: Object.keys(tl.silk.villages).length,
        k: tl.silk.endAt,
      }),
    );

  return (
    <section className="tl-panel xp-panel" aria-label={t('tl_panel')}>
      <PanelHero art="harbor" kicker={t('tl_panel')} title={t(`sc_${tl.scenario}`)} sub={t(`sc_${tl.scenario}_desc`)} />

      <div className="xp-body">
        <ul className="xp-chips">
          {chips.map((c, i) => (
            <li key={i} className={i === 0 ? 'gold' : undefined}>
              {c}
            </li>
          ))}
        </ul>

        {me && mine && (
          <XpSection label={t('tl_myFleet')} aside={t('tl_cogsLeft', { n: mine.supply.ship ?? 0 })}>
            <div className="xp-acts">
              {visible.map((b) => (
                <XpAction
                  key={b.key}
                  icon={icons[b.key]}
                  label={b.label}
                  disabled={b.acts.length === 0}
                  hot={b.key === 'build'}
                  data={{ tl: b.key }}
                  onClick={b.run}
                />
              ))}
            </div>
          </XpSection>
        )}

        <XpSection label={t('tl_progress')}>
          <ul className="tl-players xp-rows">
            {view.players.map((p) => {
              const bits: string[] = [];
              const lf = tl.landfall[p.id]?.length ?? 0;
              if (sc?.landfall) bits.push(`${t('tl_explored')}: ${lf}`);
              if (tl.silk) bits.push(`${t('tl_silk')}: ${tl.silk.silk[p.id] ?? 0}`);
              if (tl.castaways) {
                bits.push(`${t('tl_vpTokens')}: ${tl.castaways.vpTokens[p.id] ?? 0}`);
                const held = tl.castaways.held[p.id]?.length ?? 0;
                if (held) bits.push(`${t('tl_heldHarbors')}: ${held}`);
              }
              if (tl.works) {
                const w = Object.keys(tl.works.claims).find((k) => tl.works!.claims[k] === p.id);
                if (w) bits.push(`${t(`wonder_${w}`)} ${t('tl_level', { n: tl.works.levels[p.id] ?? 0 })}`);
              }
              if (tl.coves) {
                const lairs = tl.coves.lairs[p.id] ?? 0;
                bits.push(lairs ? t('tl_fort', { n: lairs }) : t('tl_fortTaken'));
                bits.push(t('tl_war', { n: tl.coves.war[p.id] ?? 0 }));
                bits.push(t('tl_line', { n: tl.coves.lines[p.id]?.length ?? 0 }));
              }
              return (
                <li key={p.id} className={p.id === me ? 'me' : undefined}>
                  <Avatar id={avatar(p.id)} seat={p.id} size={34} />
                  <span className="xp-row-main">
                    <b>{name(p.id)}</b>
                    {bits.length > 0 && <span className="xp-row-sub">{bits.join(' · ')}</span>}
                  </span>
                  {sc?.landfall ? <b className={lf ? 'xp-row-num' : 'xp-row-num zero'}>+{lf * sc.landfall}</b> : null}
                </li>
              );
            })}
          </ul>
        </XpSection>

        {tl.works && (
          <XpSection label={t('tl_wondersLabel')}>
            <ul className="tl-wonders">
              {tl.works.wonders.map((w) => {
                const owner = tl.works!.claims[w];
                return (
                  <li key={w}>
                    <WonderArt id={w} />
                    <span className="xp-row-main">
                      <b>{t(`wonder_${w}`)}</b>
                      <span className="xp-row-sub">{t(`wneed_${WONDER_NEEDS[w]}`)}</span>
                    </span>
                    {owner ? (
                      <span className="tl-wonder-owner">
                        <Avatar id={avatar(owner)} seat={owner} size={24} /> {t('tl_level', { n: tl.works!.levels[owner] ?? 0 })}
                      </span>
                    ) : (
                      <span className="xp-muted">{t('tl_free')}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </XpSection>
        )}
      </div>
    </section>
  );
}
