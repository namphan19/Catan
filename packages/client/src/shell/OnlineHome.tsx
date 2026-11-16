// Online home: pick a display name, create a room (3-6 players, 5-6 mode, VP target) or
// join one by its 5-character code. A share link (?room=CODE) pre-fills the join code.
import { useState } from 'react';
import type { RoomOptions } from '../net/protocol';
import { isValidCode, normalizeCode } from './OnlineShell';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

export interface OnlineHomeProps {
  name: string;
  onName: (n: string) => void;
  onCreate: (playerCount: number, options?: RoomOptions) => void;
  onJoin: (code: string) => void;
  onBack: () => void;
  onLangToggle: () => void;
  notice?: string | null;
}

export function OnlineHome({ name, onName, onCreate, onJoin, onBack, onLangToggle, notice }: OnlineHomeProps) {
  const { t } = useI18n();
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<'paired' | 'extraBuild'>('paired');
  const [vp, setVp] = useState('');
  const [expansion, setExpansion] = useState(false);
  const [code, setCode] = useState<string>(() => {
    const fromLink = new URLSearchParams(location.search).get('room') ?? '';
    return isValidCode(fromLink.toUpperCase()) ? fromLink.toUpperCase() : '';
  });
  const [codeBad, setCodeBad] = useState(false);

  const submitCreate = () => {
    const parsedVp = Number.parseInt(vp, 10);
    const options: RoomOptions = {};
    if (count >= 5) options.largeTableMode = expansion ? 'paired' : mode;
    if (expansion) options.expansion = 'strongholds';
    if (vp.trim() && Number.isInteger(parsedVp) && parsedVp >= 1 && parsedVp <= 100) options.vpToWin = parsedVp;
    onCreate(count, Object.keys(options).length ? options : undefined);
  };

  const submitJoin = () => {
    const c = normalizeCode(code.trim());
    if (!isValidCode(c)) {
      setCodeBad(true);
      return;
    }
    setCodeBad(false);
    onJoin(c);
  };

  return (
    <main className="home">
      <header className="home-head">
        <h1 className="logo">{t('appTitle')}</h1>
        <p>{t('online_title')}</p>
        <Button variant="ghost" onClick={onLangToggle} aria-label={t('langToggle')}>
          🌐 {t('langToggle')}
        </Button>
      </header>

      <Panel title={t('online_nameTitle')} className="home-panel">
        <form
          className="home-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
        >
          <label>
            {t('online_name')}
            <input
              value={name}
              maxLength={24}
              placeholder={t('online_name_ph')}
              aria-label={t('online_name')}
              onChange={(e) => onName(e.target.value)}
            />
          </label>
          <label>
            {t('online_players')}
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('online_mode')}
            <select
              value={mode}
              disabled={count < 5 || expansion}
              onChange={(e) => setMode(e.target.value === 'extraBuild' ? 'extraBuild' : 'paired')}
            >
              <option value="paired">{t('online_mode_paired')}</option>
              <option value="extraBuild">{t('online_mode_extraBuild')}</option>
            </select>
          </label>
          <label className="exp-check">
            <input type="checkbox" checked={expansion} onChange={(e) => setExpansion(e.target.checked)} />
            {t('exp_enable')}
          </label>
          <label>
            {t('online_vp')}
            <input
              type="number"
              min={1}
              max={100}
              value={vp}
              placeholder={t('online_vp_hint')}
              aria-label={t('online_vp')}
              onChange={(e) => setVp(e.target.value)}
            />
          </label>
          <Button variant="primary" type="submit">
            {t('online_create')}
          </Button>
        </form>
      </Panel>

      <Panel title={t('online_joinTitle')} className="home-panel">
        <form
          className="home-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitJoin();
          }}
        >
          <label>
            {t('online_code')}
            <input
              value={code}
              maxLength={5}
              className={codeBad ? 'input-bad' : undefined}
              aria-invalid={codeBad}
              placeholder={t('online_code_ph')}
              aria-label={t('online_code')}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCodeBad(false);
              }}
            />
          </label>
          <Button variant="primary" type="submit">
            {t('online_join')}
          </Button>
          {codeBad && (
            <p className="error-text" role="alert">
              {t('online_code_bad')}
            </p>
          )}
        </form>
      </Panel>

      <Button variant="ghost" onClick={onBack}>
        {t('online_back')}
      </Button>

      {notice && (
        <p className="error-text" role="alert">
          {notice}
        </p>
      )}
    </main>
  );
}
