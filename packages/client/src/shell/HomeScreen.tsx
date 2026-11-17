// Home screen: a hand-drawn chart on the guild-hall desk. New hot-seat game, the old
// logbook (load a saved game) and the online gate all live on one parchment sheet.
import { useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Emblem } from '../ui/Emblem';
import { SEAT_EMBLEMS, playerHex } from '../ui/colors';
import { HomeMap } from './HomeMap';
import { BOT_LEVELS, type BotLevel } from '../net/protocol';

type SeatKind = 'human' | BotLevel;

export interface HomeScreenProps {
  /** `bots[i]` is the bot level of seat i, or null for a human seat. */
  onNew: (seed: string, names: string[], expansion: boolean, bots: (BotLevel | null)[]) => void;
  onLoad: (text: string) => void;
  onOnline: (fresh?: boolean) => void;
  onLangToggle: () => void;
  error?: string | null;
}

const randomSeed = () => Math.random().toString(36).slice(2, 10);

function BrandMark() {
  return (
    <svg className="brand-mark" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.4 L19.4 6.7 L19.4 17.3 L12 21.6 L4.6 17.3 L4.6 6.7 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 5.4 L13.9 10.1 L18.6 12 L13.9 13.9 L12 18.6 L10.1 13.9 L5.4 12 L10.1 10.1 Z"
        fill="currentColor"
        opacity=".85"
      />
      <circle cx="12" cy="12" r="1.5" fill="#8F2F22" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="home-icon" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8.5" />
        <ellipse cx="12" cy="12" rx="3.8" ry="8.5" />
        <path d="M3.8 12h16.4M5 7.5h14M5 16.5h14" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function DieIcon() {
  return (
    <svg className="home-icon" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="var(--parchment)" stroke="currentColor" strokeWidth="1.8" />
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

function CompassIcon() {
  return (
    <svg className="home-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="8.6" />
        <path d="M12 6.2l2.1 3.7L18 12l-3.9 2.1L12 17.8l-2.1-3.7L6 12l3.9-2.1z" fill="currentColor" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="1.3" fill="var(--parchment)" stroke="none" />
      </g>
    </svg>
  );
}

function ShipIcon() {
  return (
    <svg className="home-icon" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M4 15.5Q12 19.5 20 15.5l-2.2 4.1Q12 22.5 6.2 19.6Z" fill="currentColor" fillOpacity=".2" />
        <path d="M12 4v11.2M12 5.2q5 1.2 4.4 6.1Q13 11.5 12 9.2ZM11 6.8Q7 7.8 7.4 12q3.4-.9 3.6-3" />
        <path d="M12 4l3 1.1L12 6.4" fill="currentColor" fillOpacity=".3" />
      </g>
    </svg>
  );
}

function ScrollIcon() {
  return (
    <svg className="home-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M7 4h10a2 2 0 0 1 2 2v13H8a2 2 0 0 1-2-2V6a2 2 0 0 1 1-2Z" fill="currentColor" fillOpacity=".08" />
        <path d="M5 6.5a2 2 0 0 1 4 0V19M9 19a2 2 0 0 1-4 0M10 9h6M10 12.5h6M10 16h4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function HomeScreen({ onNew, onLoad, onOnline, onLangToggle, error }: HomeScreenProps) {
  const { t } = useI18n();
  const [count, setCount] = useState(3);
  const [names, setNames] = useState<string[]>(['', '', '', '', '', '']);
  const [seed, setSeed] = useState('boschtan');
  const [expansion, setExpansion] = useState(false);
  const [logText, setLogText] = useState('');
  const [kinds, setKinds] = useState<SeatKind[]>(['human', 'human', 'human', 'human', 'human', 'human']);
  const seats = kinds.slice(0, count);
  const noHuman = !seats.includes('human');

  return (
    <main className="home home-landing">
      <article className="chart">
        <span className="chart-vignette" aria-hidden="true" />
        <span className="chart-corners" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <header className="chart-head">
          <div className="brand-lockup">
            <span className="brand-seal" aria-hidden="true">
              <BrandMark />
            </span>
            <div className="brand-words">
              <h1 className="logo">{t('appTitle')}</h1>
              <p className="brand-sub">{t('appSubtitle')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="lang-switch"
            onClick={onLangToggle}
            aria-label={t('langToggle')}
            title={t('langToggle')}
          >
            <GlobeIcon />
            <span>{t('langToggle')}</span>
          </Button>
        </header>

        <div className="chart-main">
          <section className="chart-atlas">
            <div className="atlas-frame">
              <HomeMap label={t('home_atlasCaption')} />
            </div>
            <p className="atlas-caption" aria-hidden="true">
              <span className="caption-rule" />
              <span>{t('home_atlasCaption')}</span>
              <span className="caption-rule" />
            </p>
            <aside className="online-ticket">
              <span className="ticket-stamp" aria-hidden="true">
                <ShipIcon />
              </span>
              <div className="ticket-copy">
                <h2>{t('home_joinOnline')}</h2>
                <p>{t('home_onlineHint')}</p>
              </div>
              <div className="ticket-actions">
                <Button variant="ghost" className="ticket-btn" onClick={() => onOnline(true)}>
                  {t('home_onlineCreate')}
                </Button>
                <Button variant="ghost" className="ticket-btn" onClick={() => onOnline()}>
                  {t('home_onlineJoin')}
                </Button>
              </div>
            </aside>
          </section>

          <section className="chart-ledger" aria-labelledby="home-ledger-title">
            <div className="ledger-head">
              <p className="ledger-kicker">{t('home_kicker')}</p>
              <h2 id="home-ledger-title">
                {t('home_newGameTitle')}
                <span className="title-tag">{t('home_localTag')}</span>
              </h2>
              <p className="ledger-intro">{t('home_intro')}</p>
            </div>

            <form
              className="ledger-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (noHuman) return;
                onNew(
                  seed.trim() || 'boschtan',
                  names.slice(0, count).map((n, i) => {
                    const k = seats[i];
                    if (k !== 'human') return `🤖 ${t('bot_name', { n: i + 1, level: t(`bot_${k}`) })}`;
                    return n.trim() || t('player', { n: i + 1 });
                  }),
                  expansion,
                  seats.map((k) => (k === 'human' ? null : k)),
                );
              }}
            >
              <div className="ledger-field">
                <label htmlFor="home-count">{t('home_players')}</label>
                <span className="select-wrap">
                  <select id="home-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                    {[3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </span>
              </div>

              <div className="ledger-field">
                <label htmlFor="home-expansion">{t('exp_label')}</label>
                <label className="exp-check">
                  <input
                    id="home-expansion"
                    type="checkbox"
                    checked={expansion}
                    onChange={(e) => setExpansion(e.target.checked)}
                  />
                  <span>{t('exp_enable')}</span>
                </label>
              </div>

              <div className="ledger-field">
                <label htmlFor="home-seed">{t('home_seed')}</label>
                <div className="seed-wrap">
                  <input id="home-seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
                  <button
                    type="button"
                    className="seed-dice"
                    aria-label={t('home_randomSeed')}
                    title={t('home_randomSeed')}
                    onClick={() => setSeed(randomSeed())}
                  >
                    <DieIcon />
                  </button>
                </div>
              </div>

              <fieldset className="ledger-names">
                <legend>{t('seat_list')}</legend>
                {Array.from({ length: count }, (_, i) => (
                  <label key={i} className="ledger-name-row">
                    <span className="seat-badge">
                      <Emblem id={SEAT_EMBLEMS[i]} size={16} color={playerHex(`p${i + 1}`)} />
                    </span>
                    {kinds[i] === 'human' ? (
                      <input
                        value={names[i] ?? ''}
                        aria-label={t('home_playerName', { n: i + 1 })}
                        placeholder={t('home_playerName', { n: i + 1 })}
                        onChange={(e) => setNames((ns) => ns.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                    ) : (
                      <span className="ledger-bot-name">🤖 {t('bot_name', { n: i + 1, level: t(`bot_${kinds[i]}`) })}</span>
                    )}
                    <span className="select-wrap seat-kind">
                      <select
                        value={kinds[i]}
                        aria-label={t('home_seatKind', { n: i + 1 })}
                        onChange={(e) => setKinds((ks) => ks.map((x, j) => (j === i ? (e.target.value as SeatKind) : x)))}
                      >
                        <option value="human">{t('home_seatHuman')}</option>
                        {BOT_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            🤖 {t(`bot_${l}`)}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                ))}
              </fieldset>
              {noHuman && (
                <p className="error-text ledger-error" role="alert">
                  {t('home_needHuman')}
                </p>
              )}

              {error && (
                <p className="error-text ledger-error" role="alert">
                  {error}
                </p>
              )}

              <Button variant="primary" type="submit" className="ledger-start" disabled={noHuman}>
                <CompassIcon />
                <span>{t('home_start')}</span>
              </Button>
            </form>

            <div className="ledger-tip">
              <span className="tip-mark" aria-hidden="true">
                ✧
              </span>
              <p>{t('home_tip')}</p>
            </div>
          </section>
        </div>

        <section className="chart-archive">
          <div className="archive-head">
            <span className="archive-icon" aria-hidden="true">
              <ScrollIcon />
            </span>
            <div>
              <h2>{t('home_loadLog')}</h2>
              <p className="hint">{t('home_pasteHint')}</p>
            </div>
          </div>
          <div className="archive-row">
            <textarea
              className="export-box"
              rows={2}
              value={logText}
              placeholder={t('home_logPlaceholder')}
              aria-label={t('home_loadLog')}
              onChange={(e) => setLogText(e.target.value)}
            />
            <Button variant="ghost" className="archive-btn" onClick={() => onLoad(logText)}>
              {t('home_loadReplay')}
            </Button>
          </div>
        </section>

        <footer className="chart-foot">
          <span className="foot-mark" aria-hidden="true">
            ✦
          </span>
          <span>Boschtan</span>
          <span className="foot-note">{t('home_footerNote')}</span>
        </footer>
      </article>
    </main>
  );
}
