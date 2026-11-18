// Side panel of the Strongholds expansion: raid track, every player's improvement levels, the
// viewer's expansion actions (the advance cards sit on the board: AdvanceHand). Buttons are
// enabled only when getLegalActions contains a matching action; clicking hands those actions to
// the staged chooser.
import type { Action, PlayerView, StrongholdsView } from '@hexgame/engine';
import { SH, TRACKS } from '@hexgame/engine';
import { resKey, useI18n } from '../i18n';
import { useName } from '../shell/names';
import { Button } from '../ui/Button';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { ResourceIcon } from '../ui/ResourceIcon';
import { trackName } from './labels';
import './strongholds.css';

interface PanelProps {
  view: PlayerView;
  sh: StrongholdsView;
  legal: Action[];
  /** Start the staged chooser with these legal actions. */
  onStart: (cands: Action[], title: string) => void;
}

const WARDEN_ACTIONS = ['recruit', 'activate', 'promote', 'moveWarden', 'displace', 'chase'] as const;

export function StrongholdsPanel({ view, sh, legal, onStart }: PanelProps) {
  const { t } = useI18n();
  const name = useName();
  const me = view.viewer;
  const mine = view.players.find((p) => p.id === me);
  const of = (type: string, pred?: (a: Record<string, unknown>) => boolean): Action[] =>
    legal.filter((a) => a.t === type && (!pred || pred(a as unknown as Record<string, unknown>)));

  const wardens = Object.values(view.pieces.occupants ?? {});
  const strength = (id: string) => wardens.filter((o) => o.owner === id && o.active).reduce((s, o) => s + o.level, 0);
  const raiders = Object.values(view.pieces.buildings).filter((b) => b.kind === 'city').length;
  const defenders = view.players.reduce((s, p) => s + strength(p.id), 0);
  const stepsLeft = SH.raidTrack - sh.raid.pos;

  const bazaar = of('sh:bazaarOffer');

  return (
    <section className="sh-panel" aria-label={t('sh_title')}>
      <h3 className="sh-head">{t('sh_title')}</h3>

      <div className="sh-raid" data-pos={sh.raid.pos}>
        <div className="sh-raid-row">
          <span className="sh-label">{t('sh_raid')}</span>
          <ol className="sh-track" aria-label={t('sh_raidLeft', { n: stepsLeft })}>
            {Array.from({ length: SH.raidTrack }, (_, i) => (
              <li key={i} className={i < sh.raid.pos ? 'done' : i === sh.raid.pos ? 'ship' : ''}>
                {i === sh.raid.pos ? '⛵' : ''}
              </li>
            ))}
            <li className="shore" title={t('sh_shore')}>
              ⚑
            </li>
          </ol>
        </div>
        <p className="sh-raid-info">
          {t('sh_raidLeft', { n: stepsLeft })} ·{' '}
          <span className={defenders < raiders ? 'sh-bad' : 'sh-good'}>
            {t('sh_strength', { raiders, defenders })}
          </span>
        </p>
        {sh.eventDie && (
          <p className="sh-raid-info">
            {t('sh_dieLast')}: <b>{sh.eventDie === 'raid' ? t('sh_dieRaid') : trackName(t, sh.eventDie)}</b>
          </p>
        )}
        {!sh.blockerActive && <p className="sh-raid-info sh-muted">{t('sh_blockerWaiting')}</p>}
      </div>

      <table className="sh-levels">
        <thead>
          <tr>
            <th scope="col">{t('sh_player')}</th>
            {TRACKS.map((tr) => (
              <th key={tr} scope="col" title={trackName(t, tr)}>
                {t(`track_${tr}_s`)}
              </th>
            ))}
            <th scope="col" title={t('sh_defence')}>
              🛡
            </th>
            <th scope="col" title={t('sh_shields')}>
              ✚
            </th>
          </tr>
        </thead>
        <tbody>
          {view.players.map((p) => (
            <tr key={p.id} className={p.id === me ? 'me' : undefined}>
              <th scope="row">
                <Emblem id={playerEmblem(p.id)} size={14} color={playerColor(p.id)} /> {name(p.id)}
              </th>
              {TRACKS.map((tr) => (
                <td key={tr} data-track={tr} data-level={sh.levels[p.id][tr]}>
                  {sh.levels[p.id][tr]}
                  {sh.capitals[tr]?.owner === p.id && (
                    <span className="sh-star" title={t('sh_capital')}>
                      ★
                    </span>
                  )}
                </td>
              ))}
              <td>{strength(p.id)}</td>
              <td>{sh.shields[p.id] + sh.vpCards[p.id].length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {me && mine && (
        <>
          <div className="sh-group">
            <span className="sh-label">{t('sh_improve')}</span>
            <div className="sh-buttons">
              {TRACKS.map((tr) => {
                const level = sh.levels[me][tr];
                const cands = of('sh:improve', (a) => a.track === tr);
                const commodity = SH.trackCommodity[tr];
                const done = level >= SH.maxLevel;
                return (
                  <Button
                    key={tr}
                    className="sh-btn"
                    disabled={cands.length === 0}
                    data-improve={tr}
                    title={done ? t('sh_trackDone') : `${level + 1}× ${t(resKey(commodity))}`}
                    onClick={() => onStart(cands, `${t('sh_improve')}: ${trackName(t, tr)}`)}
                  >
                    {trackName(t, tr)} {done ? '✓' : `${level}→${level + 1}`}
                    {!done && (
                      <span className="sh-cost">
                        {level + 1}
                        <ResourceIcon res={commodity} size={13} />
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="sh-group">
            <span className="sh-label">{t('sh_actions')}</span>
            <div className="sh-buttons">
              <Button
                className="sh-btn"
                disabled={of('sh:rampart').length === 0}
                data-sh="rampart"
                title={t('shcost_rampart')}
                onClick={() => onStart(of('sh:rampart'), t('shact_rampart'))}
              >
                {t('shact_rampart')}
              </Button>
              {WARDEN_ACTIONS.map((k) => {
                const cands = of(`sh:${k}`);
                return (
                  <Button
                    key={k}
                    className="sh-btn"
                    disabled={cands.length === 0}
                    data-sh={k}
                    title={t(`shcost_${k}`)}
                    onClick={() => onStart(cands, t(`shact_${k}`))}
                  >
                    {t(`shact_${k}`)}
                  </Button>
                );
              })}
              {bazaar.length > 0 && (
                <Button className="sh-btn" variant="primary" data-sh="bazaarOffer" onClick={() => onStart(bazaar, t('shact_bazaarOffer'))}>
                  {t('shact_bazaarOffer')}
                </Button>
              )}
            </div>
          </div>

          {/* The viewer's advance cards moved to the bottom-left of the board (AdvanceHand). */}
        </>
      )}
    </section>
  );
}
