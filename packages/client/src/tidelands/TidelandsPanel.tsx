// Side panel of the Tidelands expansion: the scenario and its goal, the viewer's sea actions (enabled
// only when getLegalActions holds a matching action) and every player's scenario progress.
import type { Action, PlayerView } from '@hexgame/engine';
import { SCENARIOS } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { Button } from '../ui/Button';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import type { TlView } from './view';
import './tidelands.css';

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
  const sc = SCENARIOS[tl.scenario];
  const of = (type: string) => legal.filter((a) => a.t === type);
  const me = view.viewer;
  const mine = view.players.find((p) => p.id === me);

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

  return (
    <section className="tl-panel" aria-label={t('tl_panel')}>
      <h3 className="tl-head">
        {t('tl_panel')} · {t(`sc_${tl.scenario}`)}
      </h3>
      <p className="tl-desc">{t(`sc_${tl.scenario}_desc`)}</p>
      <p className="tl-goal">
        {t('tl_goal', { n: view.init.vpToWin })}
        {sc?.landfall ? ` · ${t('tl_landfall', { n: sc.landfall })}` : ''}
      </p>
      {tl.mistLeft > 0 && <p className="tl-info">{t('tl_mistLeft', { n: tl.mistLeft })}</p>}
      {tl.castaways && <p className="tl-info">{t('tl_rewardsLeft', { n: Object.keys(tl.castaways.rewards).length })}</p>}
      {tl.silk && (
        <p className="tl-info">
          {t('tl_villages', {
            n: Object.values(tl.silk.villages).filter((v) => v.silk > 0).length,
            m: Object.keys(tl.silk.villages).length,
            k: tl.silk.endAt,
          })}
        </p>
      )}

      {me && mine && (
        <div className="tl-actions">
          {visible.map((b) => (
            <Button key={b.key} variant="ghost" disabled={b.acts.length === 0} onClick={b.run} data-tl={b.key}>
              {b.label}
            </Button>
          ))}
          <span className="tl-muted">{t('tl_cogsLeft', { n: mine.supply.ship ?? 0 })}</span>
        </div>
      )}

      <table className="tl-players">
        <tbody>
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
              <tr key={p.id}>
                <th scope="row" style={{ color: playerColor(p.id) }}>
                  <Emblem id={playerEmblem(p.id)} size={14} color={playerColor(p.id)} /> {name(p.id)}
                </th>
                <td>{bits.join(' · ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {tl.works && (
        <ul className="tl-wonders">
          {tl.works.wonders.map((w) => {
            const owner = tl.works!.claims[w];
            return (
              <li key={w}>
                <b>{t(`wonder_${w}`)}</b> — {t(`wneed_${WONDER_NEEDS[w]}`)} ·{' '}
                {owner ? (
                  <span style={{ color: playerColor(owner) }}>
                    {name(owner)} {t('tl_level', { n: tl.works!.levels[owner] ?? 0 })}
                  </span>
                ) : (
                  <span className="tl-muted">{t('tl_free')}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
