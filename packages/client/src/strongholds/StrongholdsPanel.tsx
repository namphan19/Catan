// Drawer panel of the Strongholds expansion (PO 2026-11-28, "read on the sea"): a painted hero, the
// raid lane with raiders vs defence, the viewer's three city tracks as cards (level, perk, capital,
// Improve with its cost), the warden actions as round buttons and every player's levels with their
// portrait. Buttons are enabled only when getLegalActions holds a matching action; clicking hands
// those actions to the staged chooser. (The advance cards sit on the board: AdvanceHand.)
import type { Action, PlayerView, StrongholdsView } from '@hexgame/engine';
import { SH, TRACKS } from '@hexgame/engine';
import { resKey, useI18n } from '../i18n';
import { useAvatar, useName } from '../shell/names';
import { Avatar } from '../ui/Avatar';
import { ResourceIcon } from '../ui/ResourceIcon';
import { GameIcon, type GameIconName } from '../ui/GameIcon';
import { PanelHero, UiArt, XpAction, XpSection } from '../ui/Drawer';
import { art2dUrl } from '../board/assets';
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
const WARDEN_ICON: Record<string, GameIconName> = { activate: 'bolt', promote: 'promote', moveWarden: 'move', displace: 'push', chase: 'target' };
/** Painted badges (Tripo, art2d/ui) where one exists; the rest keep the line icon. */
export const WARDEN_ART: Record<string, string> = {
  recruit: 'recruit-warden',
  activate: 'warden-activate',
  promote: 'warden-promote',
  moveWarden: 'warden-move',
  displace: 'warden-displace',
  chase: 'warden-chase',
};

export function StrongholdsPanel({ view, sh, legal, onStart }: PanelProps) {
  const { t } = useI18n();
  const name = useName();
  const avatar = useAvatar();
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

  const sub = [t('tl_goal', { n: view.init.vpToWin })];
  if (sh.eventDie) sub.push(`${t('sh_dieLast')}: ${sh.eventDie === 'raid' ? t('sh_dieRaid') : trackName(t, sh.eventDie)}`);

  return (
    <section className="sh-panel xp-panel" aria-label={t('sh_title')}>
      <PanelHero art="quarry" kicker={t('xp_kicker')} title={t('sh_title')} sub={sub.join(' · ')} />

      <div className="xp-body">
        <XpSection label={t('sh_raid')} aside={<>{t('sh_stepsLeft', { n: stepsLeft })}</>} className="sh-raid">
          <ol className="sh-track" aria-label={t('sh_raidLeft', { n: stepsLeft })} data-pos={sh.raid.pos}>
            {Array.from({ length: SH.raidTrack }, (_, i) => (
              <li key={i} className={i < sh.raid.pos ? 'done' : i === sh.raid.pos ? 'ship' : ''}>
                {i === sh.raid.pos ? <img src={art2dUrl('ui', 'raid-ship')} alt="" width={34} height={34} draggable={false} /> : null}
              </li>
            ))}
            <li className="shore" title={t('sh_shore')}>
              <GameIcon name="flag" size={14} />
            </li>
          </ol>
          <div className="xp-stats">
            <div className="xp-stat">
              <span>{t('sh_raiders')}</span>
              <b>{raiders}</b>
            </div>
            <div className={`xp-stat ${defenders < raiders ? 'bad' : 'good'}`}>
              <span>{t('sh_defenders')}</span>
              <b>{defenders}</b>
            </div>
          </div>
          {!sh.blockerActive && <p className="xp-note">{t('sh_blockerWaiting')}.</p>}
        </XpSection>

        <XpSection
          label={me && mine ? t('sh_yourCities') : t('sh_tracks')}
          aside={t('sh_tracksAside', { p: SH.perkLevel, c: SH.capitalLevel })}
        >
          <div className="sh-cards">
            {TRACKS.map((tr) => {
              const level = me ? sh.levels[me]?.[tr] ?? 0 : 0;
              const commodity = SH.trackCommodity[tr];
              const cap = sh.capitals[tr];
              const fixed = !!cap && sh.levels[cap.owner]?.[tr] >= SH.maxLevel;
              const done = level >= SH.maxLevel;
              const cands = of('sh:improve', (a) => a.track === tr);
              const have = mine?.hand?.[commodity] ?? 0;
              const missing = Math.max(0, level + 1 - have);
              return (
                <div key={tr} className={`sh-trackinfo${cands.length ? ' ready' : ''}`} data-track={tr}>
                  <ResourceIcon res={commodity} size={30} />
                  <div className="sh-trackinfo-main">
                    <div className="sh-trackinfo-head">
                      <b>{trackName(t, tr)}</b>
                      {me && (
                        <span className="sh-lvl" aria-label={t('sh_levelOf', { n: level, m: SH.maxLevel })} data-level={level}>
                          {Array.from({ length: SH.maxLevel }, (_, i) => (
                            <i key={i} className={i < level ? 'on' : i + 1 === SH.perkLevel || i + 1 === SH.capitalLevel ? 'mark' : ''} />
                          ))}
                        </span>
                      )}
                      <span className="sh-trackinfo-deck">{t('sh_deckLeft', { n: sh.deckCounts[tr] ?? 0 })}</span>
                    </div>
                    <p className={level >= SH.perkLevel ? 'sh-trackinfo-row sh-reached' : 'sh-trackinfo-row'}>
                      <span className="sh-trackinfo-lvl">{t('sh_perkAt', { n: SH.perkLevel })}:</span> {t(`sh_perk_${tr}`)}
                      {level >= SH.perkLevel && (
                        <span className="sh-tick" title={t('sh_reached')} aria-label={t('sh_reached')}>
                          <GameIcon name="check" size={13} />
                        </span>
                      )}
                    </p>
                    <p className="sh-trackinfo-row">
                      <span className="sh-trackinfo-lvl">{t('sh_capitalAt', { n: SH.capitalLevel, vp: SH.capitalVP })}:</span>{' '}
                      {cap ? (
                        <span className="sh-trackinfo-owner">
                          {name(cap.owner)}
                          {fixed && <span className="xp-muted"> ({t('sh_capitalFixed')})</span>}
                        </span>
                      ) : (
                        <span className="xp-muted">{t('sh_capitalNone')}</span>
                      )}
                    </p>
                  </div>
                  {me && mine && (
                    <button
                      type="button"
                      className={`xp-pill${cands.length ? ' hot' : ''}`}
                      disabled={cands.length === 0}
                      data-improve={tr}
                      title={done ? t('sh_trackDone') : `${level + 1}× ${t(resKey(commodity))}`}
                      onClick={() => onStart(cands, `${t('sh_improve')}: ${trackName(t, tr)}`)}
                    >
                      {done ? (
                        <GameIcon name="check" size={16} />
                      ) : cands.length || missing === 0 ? (
                        <>
                          {t('sh_improveTo', { n: level + 1 })} · {level + 1}
                          <ResourceIcon res={commodity} size={16} />
                        </>
                      ) : (
                        <>
                          {t('sh_missing', { n: missing })}
                          <ResourceIcon res={commodity} size={16} />
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </XpSection>

        {me && mine && (
          <XpSection label={t('sh_actions')} className="sh-acts">
            <div className="xp-acts">
              <XpAction
                icon={<img src={art2dUrl('piece', 'rampart')} alt="" width={36} height={36} draggable={false} />}
                label={t('shact_rampart')}
                disabled={of('sh:rampart').length === 0}
                title={t('shcost_rampart')}
                data={{ sh: 'rampart' }}
                onClick={() => onStart(of('sh:rampart'), t('shact_rampart'))}
              />
              {WARDEN_ACTIONS.map((k) => {
                const cands = of(`sh:${k}`);
                return (
                  <XpAction
                    key={k}
                    icon={WARDEN_ART[k] ? <UiArt name={WARDEN_ART[k]} size={38} /> : <GameIcon name={WARDEN_ICON[k]} size={24} />}
                    label={t(`shact_${k}`)}
                    disabled={cands.length === 0}
                    title={t(`shcost_${k}`)}
                    data={{ sh: k }}
                    onClick={() => onStart(cands, t(`shact_${k}`))}
                  />
                );
              })}
            </div>
            {bazaar.length > 0 && (
              <button type="button" className="xp-pill hot xp-pill-wide" data-sh="bazaarOffer" onClick={() => onStart(bazaar, t('shact_bazaarOffer'))}>
                {t('shact_bazaarOffer')}
              </button>
            )}
          </XpSection>
        )}

        <XpSection
          label={t('sh_table')}
          aside={sh.caravan ? t('sh_caravanHolder', { name: name(sh.caravan.owner), vp: SH.caravanVP }) : t('sh_caravanNone')}
        >
          <table className="sh-levels xp-seats">
            <thead>
              <tr>
                <th scope="col">
                  <span className="xp-sr">{t('sh_player')}</span>
                </th>
                {TRACKS.map((tr) => (
                  <th key={tr} scope="col" title={trackName(t, tr)}>
                    <ResourceIcon res={SH.trackCommodity[tr]} size={16} />
                  </th>
                ))}
                <th scope="col" title={t('sh_defence')}>
                  <GameIcon name="shield" size={16} />
                </th>
                <th scope="col" title={t('sh_shields')}>
                  <GameIcon name="plusCircle" size={16} />
                </th>
              </tr>
            </thead>
            <tbody>
              {view.players.map((p) => (
                <tr key={p.id} className={p.id === me ? 'me' : undefined}>
                  <th scope="row">
                    <span className="xp-seat">
                      <Avatar id={avatar(p.id)} seat={p.id} size={30} />
                      <span className="xp-seat-name">{name(p.id)}</span>
                    </span>
                  </th>
                  {TRACKS.map((tr) => (
                    <td key={tr} data-track={tr} data-level={sh.levels[p.id][tr]}>
                      {sh.levels[p.id][tr]}
                      {sh.capitals[tr]?.owner === p.id && (
                        <span className="sh-star" title={t('sh_capital')}>
                          <GameIcon name="tower" size={12} />
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
        </XpSection>
      </div>
    </section>
  );
}
