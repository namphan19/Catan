// Home screen: new hot-seat game (3-6 players, names, seed), load a saved log,
// or go online (create / join a room on the M2 server).
import { useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { Emblem } from '../ui/Emblem';
import { SEAT_EMBLEMS } from '../ui/colors';

export interface HomeScreenProps {
  onNew: (seed: string, names: string[]) => void;
  onLoad: (text: string) => void;
  onOnline: () => void;
  onLangToggle: () => void;
  error?: string | null;
}

export function HomeScreen({ onNew, onLoad, onOnline, onLangToggle, error }: HomeScreenProps) {
  const { t } = useI18n();
  const [count, setCount] = useState(3);
  const [names, setNames] = useState<string[]>(['', '', '', '', '', '']);
  const [seed, setSeed] = useState('boschtan');
  const [logText, setLogText] = useState('');

  return (
    <main className="home">
      <header className="home-head">
        <h1>{t('appTitle')}</h1>
        <p>{t('appSubtitle')}</p>
        <Button variant="ghost" onClick={onLangToggle} aria-label={t('langToggle')}>
          🌐 {t('langToggle')}
        </Button>
      </header>

      <Panel title={t('home_newGame')} className="home-panel">
        <form
          className="home-form"
          onSubmit={(e) => {
            e.preventDefault();
            onNew(
              seed.trim() || 'boschtan',
              names.slice(0, count).map((n, i) => n.trim() || t('player', { n: i + 1 })),
            );
          }}
        >
          <label>
            {t('home_players')}
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('home_seed')}
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <fieldset className="fieldset">
            <legend>{t('seat_list')}</legend>
            {Array.from({ length: count }, (_, i) => (
              <label key={i} className="name-row">
                <Emblem id={SEAT_EMBLEMS[i]} size={18} />
                <input
                  value={names[i] ?? ''}
                  aria-label={t('home_playerName', { n: i + 1 })}
                  placeholder={t('home_playerName', { n: i + 1 })}
                  onChange={(e) => setNames((ns) => ns.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </label>
            ))}
          </fieldset>
          <Button variant="primary" type="submit">
            {t('home_start')}
          </Button>
        </form>
      </Panel>

      <Panel title={t('home_loadLog')} className="home-panel">
        <p className="hint">{t('home_pasteHint')}</p>
        <textarea
          className="export-box"
          rows={6}
          value={logText}
          placeholder={t('home_logPlaceholder')}
          onChange={(e) => setLogText(e.target.value)}
        />
        <Button variant="ghost" onClick={() => onLoad(logText)}>
          {t('home_loadReplay')}
        </Button>
      </Panel>

      <Panel title={t('home_joinOnline')} className="home-panel home-online">
        <p className="hint">{t('home_onlineHint')}</p>
        <div className="online-buttons">
          <Button variant="primary" onClick={onOnline}>
            {t('home_onlineCreate')}
          </Button>
          <Button variant="primary" onClick={onOnline}>
            {t('home_onlineJoin')}
          </Button>
        </div>
      </Panel>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
