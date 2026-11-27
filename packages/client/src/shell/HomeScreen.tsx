// Home screen (PO 2026-11-27 "hub"): the same world as the game table, a dark sea with words on it
// and ONE parchment sheet. Two tabs: same device | online.
// - Top: "Continue" (the auto-saved hot-seat game, or the online room you sit in), else a quick game.
// - Left: four mode cards with terrain art (base, Strongholds, Tidelands, Highlands). Strongholds and
//   Tidelands combine; Highlands plays alone (2-4 players). Tidelands shows its scenario picker,
//   Highlands its map picker.
// - Right, the sheet: same device = player count, seats (name + who plays it), advanced (seed), start;
//   online = your name, seats, advanced (VP, 5-6 mode), create a room, or join one by its code.
// - Footer: the logbook (load a saved log) opens in a dialog.
import { useEffect, useMemo, useState } from 'react';
import { SCENARIOS, SCENARIO_IDS, createGame } from '@hexgame/engine';
import type { HighlandsMap } from '../highlands/HighlandsSelect';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Avatar, defaultAvatar } from '../ui/Avatar';
import { art2dUrl } from '../board/assets';
import { BOT_LEVELS, asLargeTableMode, type BotLevel, type LargeTableMode, type RoomOptions } from '../net/protocol';
import { NAME_KEY, isValidCode, normalizeCode } from './OnlineShell';
import { forgetSave, readSave, savedRoom, summarize, type SaveSummary } from './autosave';
import './hub.css';
import { GameIcon } from '../ui/GameIcon';

type SeatKind = 'human' | BotLevel;

/** What the online client should do once it is connected. */
export type OnlineIntent = { kind: 'create'; playerCount: number; options?: RoomOptions } | { kind: 'join'; code: string };

export interface HomeScreenProps {
  /** `bots[i]` is the bot level of seat i, or null for a human seat. */
  onNew: (seed: string, names: string[], setup: GameSetup, bots: (BotLevel | null)[]) => void;
  onLoad: (text: string) => void;
  /** Open the online client: with an intent it creates / joins at once, without one it rejoins. */
  onOnline: (intent?: OnlineIntent) => void;
  /** Continue the auto-saved hot-seat game. */
  onContinue?: () => void;
  onLangToggle: () => void;
  error?: string | null;
}

/** Engine rulesets chosen on the home screens. */
export interface GameSetup {
  strongholds: boolean;
  /** Tidelands scenario id, or null when the sea expansion is off. */
  tidelands: string | null;
  /** Highlands map mode, or null when off (plays alone, 2-4 players). */
  highlands?: HighlandsMap | null;
}

/** Tidelands scenario picker; scenarios that do not combine with strongholds are disabled then. */
export function ScenarioSelect({ id, value, onChange, strongholds }: { id?: string; value: string; onChange: (v: string) => void; strongholds: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    if (value && strongholds && !SCENARIOS[value]?.strongholds) onChange('');
  }, [value, strongholds, onChange]);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid="scenario-select">
      <option value="">{t('tl_off')}</option>
      {SCENARIO_IDS.map((sc) => (
        <option key={sc} value={sc} disabled={strongholds && !SCENARIOS[sc].strongholds} title={t(`sc_${sc}_desc`)}>
          {t(`sc_${sc}`)}
          {strongholds && !SCENARIOS[sc].strongholds ? ` — ${t('tl_combineNo')}` : ''}
          {strongholds && SCENARIOS[sc].strongholdsFit ? ` — ${t(SCENARIOS[sc].strongholdsFit === 'good' ? 'tl_fitGood' : 'tl_fitHarder')}` : ''}
        </option>
      ))}
    </select>
  );
}

const randomSeed = () => Math.random().toString(36).slice(2, 10);

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function BrandMark() {
  return (
    <svg className="hub-mark" width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.4 L19.4 6.7 L19.4 17.3 L12 21.6 L4.6 17.3 L4.6 6.7 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 5.4 L13.9 10.1 L18.6 12 L13.9 13.9 L12 18.6 L10.1 13.9 L5.4 12 L10.1 10.1 Z" fill="currentColor" opacity=".85" />
      <circle cx="12" cy="12" r="1.5" fill="#8F2F22" />
    </svg>
  );
}

function DieIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <g fill="currentColor">
        <circle cx="8.5" cy="8.5" r="1.5" />
        <circle cx="15.5" cy="8.5" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="8.5" cy="15.5" r="1.5" />
        <circle cx="15.5" cy="15.5" r="1.5" />
      </g>
    </svg>
  );
}

type ModeKey = 'base' | 'sh' | 'tl' | 'hl';
const MODES: Array<{ key: ModeKey; art: string }> = [
  { key: 'base', art: 'field' },
  { key: 'sh', art: 'quarry' },
  { key: 'tl', art: 'harbor' },
  { key: 'hl', art: 'jungle' },
];

/** "5 minutes ago" for the Continue card. */
function ago(t: (k: string, p?: Record<string, string | number>) => string, at: number): string {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return t('hub_justNow');
  if (min < 60) return t('hub_minutes', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('hub_hours', { n: h });
  return t('hub_days', { n: Math.round(h / 24) });
}

export function HomeScreen({ onNew, onLoad, onOnline, onContinue, onLangToggle, error }: HomeScreenProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'local' | 'online'>(() => (savedRoom() && !readSave() ? 'online' : 'local'));
  // Modes: Strongholds and Tidelands combine; Highlands plays alone; none of them = the base game.
  const [sh, setSh] = useState(false);
  const [tl, setTl] = useState(false);
  const [hl, setHl] = useState(false);
  const [scenario, setScenario] = useState<string>(SCENARIO_IDS[0]);
  const [hlMap, setHlMap] = useState<HighlandsMap>('variable');
  const [count, setCount] = useState(4);
  const [names, setNames] = useState<string[]>(['', '', '', '', '', '']);
  const [kinds, setKinds] = useState<SeatKind[]>(['human', 'human', 'human', 'human', 'human', 'human']);
  const [seed, setSeed] = useState('boschtan');
  const [advanced, setAdvanced] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState('');
  // Online
  const [name, setName] = useState(readName);
  const [code, setCode] = useState<string>(() => {
    const fromLink = new URLSearchParams(location.search).get('room') ?? '';
    return isValidCode(fromLink.toUpperCase()) ? fromLink.toUpperCase() : '';
  });
  const [codeBad, setCodeBad] = useState(false);
  const [vp, setVp] = useState('');
  const [largeMode, setLargeMode] = useState<LargeTableMode>('normal');
  const [nameMissing, setNameMissing] = useState(false);
  // A share link (?room=CODE) opens the online tab with the code filled in.
  useEffect(() => {
    if (code) setTab('online');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [save, setSave] = useState<SaveSummary | null>(() => {
    const s = readSave();
    return s ? summarize(s) : null;
  });
  const room = savedRoom();

  // A scenario that does not combine with Strongholds falls back to the first one that does.
  useEffect(() => {
    if (sh && tl && !SCENARIOS[scenario]?.strongholds) {
      const ok = SCENARIO_IDS.find((id) => SCENARIOS[id].strongholds);
      if (ok) setScenario(ok);
    }
  }, [sh, tl, scenario]);

  const maxPlayers = hl ? 4 : 6;
  useEffect(() => {
    if (count > maxPlayers) setCount(maxPlayers);
  }, [count, maxPlayers]);

  const pick = (k: ModeKey) => {
    if (k === 'base') {
      setSh(false);
      setTl(false);
      setHl(false);
    } else if (k === 'hl') {
      setSh(false);
      setTl(false);
      setHl(true);
    } else {
      setHl(false);
      if (k === 'sh') setSh((v) => !v);
      else setTl((v) => !v);
    }
  };
  const on: Record<ModeKey, boolean> = { base: !sh && !tl && !hl, sh, tl, hl };

  const setup: GameSetup = hl
    ? { strongholds: false, tidelands: null, highlands: hlMap }
    : { strongholds: sh, tidelands: tl ? scenario : null };
  const rulesets = hl ? ['base', 'highlands'] : ['base', ...(sh ? ['strongholds'] : []), ...(tl ? ['tidelands'] : [])];

  // The goal of the chosen setup, straight from the engine (display only).
  const vpToWin = useMemo(() => {
    try {
      return createGame({
        seed: 'hub',
        playerCount: count,
        ...(rulesets.length > 1 ? { rulesets } : {}),
        ...(hl ? { options: { map: hlMap } } : tl ? { options: { scenario } } : {}),
      }).init.vpToWin;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, sh, tl, hl, scenario, hlMap]);

  const modeName = (keys: { sh: boolean; tl: boolean; hl: boolean; scenario?: string | null }) => {
    if (keys.hl) return t('hub_mode_hl');
    const parts: string[] = [];
    if (keys.sh) parts.push(t('hub_mode_sh'));
    if (keys.tl) parts.push(keys.scenario ? `${t('hub_mode_tl')} · ${t(`sc_${keys.scenario}`)}` : t('hub_mode_tl'));
    return parts.length ? parts.join(' + ') : t('hub_mode_base');
  };
  const chosen = modeName({ sh, tl, hl, scenario: tl ? scenario : null });
  const chosenShort = modeName({ sh, tl, hl });

  const seats = kinds.slice(0, count);
  const bots = seats.filter((k) => k !== 'human').length;
  const noHuman = !seats.includes('human');
  const summary =
    t('hub_summary', { modes: chosen, vp: vpToWin ?? '?', n: count }) + (bots ? t('hub_summaryBots', { b: bots }) : '');

  const start = () => {
    if (noHuman) return;
    forgetSave();
    onNew(
      seed.trim() || 'boschtan',
      names.slice(0, count).map((n, i) => {
        const k = seats[i];
        if (k !== 'human') return `🤖 ${t('bot_name', { n: i + 1, level: t(`bot_${k}`) })}`;
        return n.trim() || t('player', { n: i + 1 });
      }),
      setup,
      seats.map((k) => (k === 'human' ? null : k)),
    );
  };

  const quickGame = () => {
    forgetSave();
    onNew(
      randomSeed(),
      [t('hub_quickYou'), `🤖 ${t('bot_name', { n: 2, level: t('bot_normal') })}`, `🤖 ${t('bot_name', { n: 3, level: t('bot_normal') })}`],
      { strongholds: false, tidelands: null },
      [null, 'normal', 'normal'],
    );
  };

  const keepName = (n: string) => {
    setName(n);
    setNameMissing(false);
    try {
      if (n.trim()) localStorage.setItem(NAME_KEY, n.trim());
      else localStorage.removeItem(NAME_KEY);
    } catch {
      /* the online client asks again */
    }
  };
  const needName = () => {
    if (name.trim()) return false;
    setNameMissing(true);
    return true;
  };
  const createRoom = () => {
    if (needName()) return;
    const options: RoomOptions = {};
    if (hl) options.highlands = hlMap;
    else {
      // The expansions have no extra build phase: they fall back to normal turns.
      if (count >= 5) options.largeTableMode = (sh || tl) && largeMode === 'extraBuild' ? 'normal' : largeMode;
      if (sh) options.expansion = 'strongholds';
      if (tl) options.tidelands = scenario;
    }
    const n = Number.parseInt(vp, 10);
    if (vp.trim() && Number.isInteger(n) && n >= 1 && n <= 100) options.vpToWin = n;
    onOnline({ kind: 'create', playerCount: count, ...(Object.keys(options).length ? { options } : {}) });
  };
  const joinRoom = () => {
    if (needName()) return;
    const c = normalizeCode(code.trim());
    if (!isValidCode(c)) {
      setCodeBad(true);
      return;
    }
    onOnline({ kind: 'join', code: c });
  };

  const counts = Array.from({ length: maxPlayers - 1 }, (_, i) => i + 2);
  const countPicker = (label: string) => (
    <div className="hub-row">
      <span className="hub-label" id={`hub-count-${tab}`}>
        {label}
      </span>
      <div className="hub-counts" role="radiogroup" aria-labelledby={`hub-count-${tab}`}>
        {counts.map((n) => (
          <label key={n} className={n === count ? 'hub-count on' : 'hub-count'}>
            <input type="radio" name={`hub-count-${tab}`} className="sr-only" checked={n === count} onChange={() => setCount(n)} aria-label={String(n)} />
            <span aria-hidden="true">{n}</span>
          </label>
        ))}
      </div>
    </div>
  );

  // ---- the card on top: continue / rejoin / quick game ----
  let hero: JSX.Element | null = null;
  if (tab === 'local' && save) {
    const modes = modeName({
      sh: save.rulesets.includes('strongholds'),
      tl: save.rulesets.includes('tidelands'),
      hl: save.rulesets.includes('highlands'),
      scenario: save.scenario,
    });
    hero = (
      <div className="hub-hero" data-hero="continue">
        <div className="hub-hero-text">
          <span className="hub-kicker">{t('hub_continueKicker')}</span>
          <h2>{save.setup ? t('hub_continueSetup', { mode: modes }) : t('hub_continueTitle', { mode: modes, n: save.turn })}</h2>
          <p>
            {save.players.map((p) => p.name).join(', ')}
            {save.leader ? ` — ${t('hub_continueLeader', { name: save.leader.name, vp: save.leader.vp })}` : ''}
          </p>
          <div className="hub-hero-actions">
            <button type="button" className="hub-primary" onClick={onContinue}>
              {t('hub_continue')}
            </button>
            <span className="hub-hero-note">{t('hub_savedAgo', { when: ago(t, save.savedAt) })}</span>
            <button
              type="button"
              className="hub-link"
              onClick={() => {
                forgetSave();
                setSave(null);
              }}
            >
              {t('hub_discard')}
            </button>
          </div>
        </div>
      </div>
    );
  } else if (tab === 'online' && room) {
    hero = (
      <div className="hub-hero" data-hero="room">
        <div className="hub-hero-text">
          <span className="hub-kicker">{t('hub_roomKicker')}</span>
          <h2>{t('hub_roomTitle', { code: room })}</h2>
          <p>{t('hub_roomSub')}</p>
          <div className="hub-hero-actions">
            <button type="button" className="hub-primary" onClick={() => onOnline()}>
              {t('hub_roomBack')}
            </button>
          </div>
        </div>
      </div>
    );
  } else if (tab === 'local') {
    hero = (
      <div className="hub-hero" data-hero="quick">
        <div className="hub-hero-text">
          <span className="hub-kicker">{t('hub_quickKicker')}</span>
          <h2>{t('hub_quickTitle')}</h2>
          <p>{t('hub_quickSub')}</p>
          <div className="hub-hero-actions">
            <button type="button" className="hub-primary" onClick={quickGame}>
              {t('hub_quickGo')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="hub">
      <header className="hub-head">
        <div className="hub-brand">
          <BrandMark />
          <div>
            <h1 className="logo">{t('appTitle')}</h1>
            <p className="hub-sub">{t('appSubtitle')}</p>
          </div>
        </div>
        <nav className="hub-tabs" role="tablist" aria-label={t('hub_tabs')}>
          <button type="button" role="tab" aria-selected={tab === 'local'} className="hub-tab" onClick={() => setTab('local')}>
            {t('hub_tabLocal')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'online'} className="hub-tab" onClick={() => setTab('online')}>
            {t('hub_tabOnline')}
          </button>
        </nav>
        <button type="button" className="hub-pill" onClick={onLangToggle} aria-label={t('langToggle')}>
          {t('langToggle')}
        </button>
      </header>

      <div className="hub-main">
        <section className="hub-left">
          {hero}
          <div className="hub-modes-head">
            <h2>{t('hub_modesTitle')}</h2>
            <span>{t('hub_modesHint')}</span>
          </div>
          <div className="hub-modes">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={on[m.key] ? 'hub-mode on' : 'hub-mode'}
                aria-pressed={on[m.key]}
                data-mode={m.key}
                onClick={() => pick(m.key)}
              >
                <img className="hub-mode-art" src={art2dUrl('terrain', m.art)} alt="" draggable={false} />
                <span className="hub-mode-text">
                  <b>{t(`hub_mode_${m.key}`)}</b>
                  <span className="hub-mode-desc">{t(`hub_mode_${m.key}_desc`)}</span>
                  <span className="hub-mode-chips">{t(`hub_mode_${m.key}_chips`)}</span>
                </span>
                {on[m.key] && (
                  <span className="hub-mode-check" aria-hidden="true">
                    <GameIcon name="check" size={16} />
                  </span>
                )}
              </button>
            ))}
          </div>
          {tl && (
            <label className="hub-sub-pick">
              <span>{t('tl_scenario')}</span>
              <span className="hub-select">
                <select value={scenario} onChange={(e) => setScenario(e.target.value)} data-testid="scenario-select">
                  {SCENARIO_IDS.map((sc) => (
                    <option key={sc} value={sc} disabled={sh && !SCENARIOS[sc].strongholds}>
                      {t(`sc_${sc}`)}
                      {sh && !SCENARIOS[sc].strongholds ? ` — ${t('tl_combineNo')}` : ''}
                    </option>
                  ))}
                </select>
              </span>
              <em>{t(`sc_${scenario}_desc`)}</em>
            </label>
          )}
          {hl && (
            <label className="hub-sub-pick">
              <span>{t('hub_hlMap')}</span>
              <span className="hub-select">
                <select value={hlMap} onChange={(e) => setHlMap(e.target.value === 'starter' ? 'starter' : 'variable')} data-testid="highlands-select">
                  <option value="variable">{t('hl_variable')}</option>
                  <option value="starter">{t('hl_starter')}</option>
                </select>
              </span>
            </label>
          )}
        </section>

        <section className="hub-sheet" aria-label={tab === 'local' ? t('hub_newTitle') : t('hub_onlineTitle')}>
          {tab === 'local' ? (
            <form
              className="hub-form"
              onSubmit={(e) => {
                e.preventDefault();
                start();
              }}
            >
              <div>
                <h2>{t('hub_newTitle')}</h2>
                <p className="hub-summary">{summary}</p>
              </div>
              {countPicker(t('home_players'))}
              <fieldset className="hub-seats">
                <legend className="sr-only">{t('seat_list')}</legend>
                {Array.from({ length: count }, (_, i) => (
                  <div key={i} className="hub-seat">
                    <Avatar id={defaultAvatar(`p${i + 1}`)} seat={`p${i + 1}`} size={40} />
                    {kinds[i] === 'human' ? (
                      <input
                        value={names[i] ?? ''}
                        aria-label={t('home_playerName', { n: i + 1 })}
                        placeholder={t('home_playerName', { n: i + 1 })}
                        onChange={(e) => setNames((ns) => ns.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                    ) : (
                      <span className="hub-bot-name"><GameIcon name="bot" size={16} /> {t('bot_name', { n: i + 1, level: t(`bot_${kinds[i]}`) })}</span>
                    )}
                    <span className="hub-select hub-kind">
                      <select
                        value={kinds[i]}
                        aria-label={t('home_seatKind', { n: i + 1 })}
                        onChange={(e) => setKinds((ks) => ks.map((x, j) => (j === i ? (e.target.value as SeatKind) : x)))}
                      >
                        <option value="human">{t('home_seatHuman')}</option>
                        {BOT_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {t(`bot_${l}`)}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </fieldset>
              <button type="button" className="hub-adv-toggle" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
                <GameIcon name={advanced ? 'caretDown' : 'caretRight'} size={14} /> {t('hub_advanced')}
              </button>
              {advanced && (
                <div className="hub-adv">
                  <label className="hub-field">
                    <span>{t('home_seed')}</span>
                    <span className="hub-seed">
                      <input value={seed} onChange={(e) => setSeed(e.target.value)} aria-label={t('home_seed')} />
                      <button type="button" aria-label={t('home_randomSeed')} title={t('home_randomSeed')} onClick={() => setSeed(randomSeed())}>
                        <DieIcon />
                      </button>
                    </span>
                  </label>
                </div>
              )}
              {noHuman && (
                <p className="error-text" role="alert">
                  {t('home_needHuman')}
                </p>
              )}
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="hub-primary hub-start" disabled={noHuman}>
                {t('home_start')}
              </button>
            </form>
          ) : (
            <div className="hub-form">
              <div>
                <h2>{t('hub_onlineTitle')}</h2>
                <p className="hub-summary">{t('hub_onlineIntro')}</p>
              </div>
              <label className="hub-field">
                <span>{t('online_name')}</span>
                <input
                  value={name}
                  maxLength={24}
                  placeholder={t('online_name_ph')}
                  aria-invalid={nameMissing}
                  onChange={(e) => keepName(e.target.value)}
                />
              </label>
              {nameMissing && (
                <p className="error-text" role="alert">
                  {t('online_name_required')}
                </p>
              )}
              {countPicker(t('hub_seats'))}
              <button type="button" className="hub-adv-toggle" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
                <GameIcon name={advanced ? 'caretDown' : 'caretRight'} size={14} /> {t('hub_advancedOnline')}
              </button>
              {advanced && (
                <div className="hub-adv">
                  <label className="hub-field">
                    <span>{t('online_vp')}</span>
                    <input type="number" min={1} max={100} value={vp} placeholder={vpToWin ? String(vpToWin) : t('online_vp_hint')} onChange={(e) => setVp(e.target.value)} />
                  </label>
                  {count >= 5 && !hl && (
                    <label className="hub-field">
                      <span>{t('online_mode')}</span>
                      <span className="hub-select">
                        <select value={(sh || tl) && largeMode === 'extraBuild' ? 'normal' : largeMode} onChange={(e) => setLargeMode(asLargeTableMode(e.target.value))}>
                          <option value="normal">{t('online_mode_normal')}</option>
                          <option value="paired">{t('online_mode_paired')}</option>
                          {!sh && !tl && <option value="extraBuild">{t('online_mode_extraBuild')}</option>}
                        </select>
                      </span>
                    </label>
                  )}
                </div>
              )}
              <button type="button" className="hub-primary hub-start" onClick={createRoom}>
                {t('hub_create', { modes: chosenShort })}
              </button>
              <p className="hub-or">
                <span>{t('hub_or')}</span>
              </p>
              <form
                className="hub-join"
                onSubmit={(e) => {
                  e.preventDefault();
                  joinRoom();
                }}
              >
                {/* No maxLength: a pasted invite link must arrive whole so its code can be read. */}
                <input
                  value={code}
                  className={codeBad ? 'hub-code input-bad' : 'hub-code'}
                  aria-invalid={codeBad}
                  aria-label={t('online_code')}
                  placeholder={t('online_code_ph')}
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(e) => {
                    // A pasted invite link fills in its code.
                    const v = e.target.value;
                    const m = /[?&]room=([A-Za-z0-9]{5})/.exec(v);
                    setCode((m ? m[1] : v).toUpperCase().slice(0, 5));
                    setCodeBad(false);
                  }}
                />
                <button type="submit" className="hub-secondary">
                  {t('online_join')}
                </button>
              </form>
              {codeBad ? (
                <p className="error-text" role="alert">
                  {t('online_code_bad')}
                </p>
              ) : (
                <p className="hub-hint">{t('hub_codeHint')}</p>
              )}
            </div>
          )}
        </section>
      </div>

      <footer className="hub-foot">
        <button type="button" className="hub-link hub-log-open" onClick={() => setLogOpen(true)}>
          {t('hub_logOpen')}
        </button>
        <span className="hub-tip">{t('home_tip')}</span>
      </footer>

      {logOpen && (
        <Dialog title={t('home_loadLog')} onClose={() => setLogOpen(false)}>
          <p className="hint">{t('home_pasteHint')}</p>
          <textarea
            className="export-box"
            rows={8}
            value={logText}
            placeholder={t('home_logPlaceholder')}
            aria-label={t('home_loadLog')}
            onChange={(e) => setLogText(e.target.value)}
          />
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setLogOpen(false)}>
              {t('sh_cancel')}
            </Button>
            <Button variant="primary" onClick={() => onLoad(logText)}>
              {t('home_loadReplay')}
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
