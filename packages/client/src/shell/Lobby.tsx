// Waiting room: big copyable room code + invite link, seat list with connection dots and
// ready state, a Ready toggle, and a host-only start button (server re-checks everything).
import { useEffect, useRef, useState } from 'react';
import { BOT_LEVELS, type BotLevel, type RoomInfo } from '../net/protocol';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { seatIndex, SEAT_EMBLEMS } from '../ui/colors';
import { Emblem } from '../ui/Emblem';

export interface LobbyProps {
  room: RoomInfo;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  /** Host-only, before start: frees a seat and closes that player's connection (KICKED). */
  onKick?: (seat: string) => void;
  /** Host-only, before start: fill the next free seat with a server-side bot. */
  onAddBot?: (level: BotLevel) => void;
  onLangToggle: () => void;
  notice?: string | null;
}

export function Lobby({ room, onReady, onStart, onLeave, onKick, onAddBot, onLangToggle, notice }: LobbyProps) {
  const { t } = useI18n();
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const mine = room.seats.find((s) => s.seat === room.you);
  const isHost = room.you !== null && room.hostSeat === room.you;
  const allFilled = room.seats.length >= room.playerCount;
  const allReady = allFilled && room.seats.every((s) => s.ready);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = (kind: 'code' | 'link') => {
    const text = kind === 'code' ? room.code : `${location.origin}/?room=${room.code}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(kind);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1500);
  };

  return (
    <main className="home">
      <header className="home-head">
        <h1>{t('lobby_title', { code: room.code })}</h1>
        <p>{t('online_title')}</p>
        <Button variant="ghost" onClick={onLangToggle} aria-label={t('langToggle')}>
          🌐 {t('langToggle')}
        </Button>
      </header>

      <Panel title={t('lobby_codeTitle')} className="home-panel">
        <div className="lobby-code-row">
          <span className="lobby-code" aria-label={t('lobby_codeTitle')}>
            {room.code}
          </span>
          <Button variant="ghost" onClick={() => copy('code')}>
            {copied === 'code' ? t('lobby_copied') : t('lobby_copy')}
          </Button>
          <Button variant="ghost" onClick={() => copy('link')}>
            {copied === 'link' ? t('lobby_copied') : t('lobby_share')}
          </Button>
        </div>
        <p className="hint">{t('lobby_codeHint')}</p>
      </Panel>

      <Panel title={t('lobby_seats', { n: room.seats.length, m: room.playerCount })} className="home-panel">
        <ul className="lobby-seats">
          {Array.from({ length: room.playerCount }, (_, i) => {
            const seatId = `p${i + 1}`;
            const seat = room.seats.find((s) => s.seat === seatId);
            const host = room.hostSeat === seatId;
            return (
              <li key={seatId} className="lobby-seat">
                <Emblem id={SEAT_EMBLEMS[i]} size={18} />
                <span className="lobby-seat-name">
                  {seat ? (seat.bot ? `🤖 ${seat.name}` : seat.name) : t('lobby_empty', { n: seatIndex(seatId) })}
                  {seatId === room.you && <span className="seat-you">({t('net_you')})</span>}
                </span>
                {host && <span className="badge">{t('lobby_host')}</span>}
                {seat?.bot && <span className="badge badge-bot">{t(`bot_${seat.bot}`)}</span>}
                {seat && (
                  <span
                    className={`dot ${seat.connected ? 'dot-on' : 'dot-off'}`}
                    role="img"
                    aria-label={t(seat.connected ? 'lobby_connected' : 'lobby_disconnected')}
                  />
                )}
                {seat && <span className="lobby-ready">{t(seat.ready ? 'lobby_ready' : 'lobby_notReady')}</span>}
                {isHost && seat && seatId !== room.you && onKick && (
                  <Button
                    variant="danger"
                    className="btn-kick"
                    onClick={() => onKick(seatId)}
                    aria-label={t(seat.bot ? 'lobby_removeBotTitle' : 'lobby_kickTitle', { name: seat.name })}
                  >
                    ✖ {t(seat.bot ? 'lobby_removeBot' : 'lobby_kick')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {isHost && onAddBot && !allFilled && (
          <div className="lobby-bot-row">
            <label htmlFor="lobby-bot-level">{t('lobby_botLevel')}</label>
            <select id="lobby-bot-level" value={botLevel} onChange={(e) => setBotLevel(e.target.value as BotLevel)}>
              {BOT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`bot_${l}`)}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={() => onAddBot(botLevel)}>
              🤖 {t('lobby_addBot')}
            </Button>
            <span className="hint">{t('lobby_botHint')}</span>
          </div>
        )}
        <div className="lobby-actions">
          <Button variant={mine?.ready ? 'ghost' : 'primary'} onClick={() => onReady(!mine?.ready)}>
            {t(mine?.ready ? 'lobby_notReady' : 'lobby_ready')}
          </Button>
          {isHost ? (
            <Button variant="primary" onClick={onStart} disabled={!allReady} tip={allReady ? undefined : t('lobby_startHint', { n: room.playerCount })}>
              {t('lobby_start')}
            </Button>
          ) : (
            <span className="hint">{t('lobby_waitingHost')}</span>
          )}
          <Button variant="danger" onClick={onLeave}>
            {t('lobby_leave')}
          </Button>
        </div>
      </Panel>

      {notice && (
        <p className="error-text" role="alert">
          {notice}
        </p>
      )}
    </main>
  );
}
