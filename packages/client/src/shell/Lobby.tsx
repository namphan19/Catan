// Waiting room (PO mock 2026-11-27, "Phòng chờ"): the same world as the home hub, a dark sea with
// words on it and ONE parchment sheet for the players.
// - Left: the room code as the hero (copy code / copy invite link), what is played (modes, goal,
//   seats), the portrait picker (first come first served) and the room chat, inline.
// - Right, the sheet: every seat with portrait, connection dot, you / host, ready state; the host
//   removes a seat with x and fills the first empty seat with a bot of the chosen level; at the foot
//   "I am ready" (toggle) and the host's start button, which says how many are still awaited.
// On phones it is one scrolling column: code, mode, sheet, portraits, chat. The server re-checks
// everything (host, full, ready).
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createGame } from '@hexgame/engine';
import { AVATARS, BOT_LEVELS, CHAT_MAX_LEN, type AvatarId, type BotLevel, type ChatMessage, type RoomInfo, type RoomOptions } from '../net/protocol';
import { useI18n } from '../i18n';
import { Avatar } from '../ui/Avatar';
import { art2dUrl } from '../board/assets';
import { markChatSeen } from './ChatBubble';
import './hub.css';
import { GameIcon } from '../ui/GameIcon';

export interface LobbyProps {
  room: RoomInfo;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  /** Host-only, before start: frees a seat and closes that player's connection (KICKED). */
  onKick?: (seat: string) => void;
  /** Host-only, before start: fill the next free seat with a server-side bot. */
  onAddBot?: (level: BotLevel) => void;
  /** Pick my portrait; the server refuses one another seat already has (AVATAR_TAKEN). */
  onAvatar?: (avatar: AvatarId | null) => void;
  /** The room chat, shown inline (no bubble in the lobby). */
  chat?: ChatMessage[];
  onChat?: (text: string) => void;
  onLangToggle: () => void;
  notice?: string | null;
}

/** The room's goal, straight from the engine unless the host set one. */
function roomVp(options: RoomOptions, playerCount: number): number | null {
  if (options.vpToWin) return options.vpToWin;
  const rulesets = options.highlands
    ? ['base', 'highlands']
    : ['base', ...(options.expansion ? ['strongholds'] : []), ...(options.tidelands ? ['tidelands'] : [])];
  try {
    return createGame({
      seed: 'lobby',
      playerCount,
      ...(rulesets.length > 1 ? { rulesets } : {}),
      ...(options.highlands ? { options: { map: options.highlands } } : options.tidelands ? { options: { scenario: options.tidelands } } : {}),
    }).init.vpToWin;
  } catch {
    return null;
  }
}

export function Lobby({ room, onReady, onStart, onLeave, onKick, onAddBot, onAvatar, chat, onChat, onLangToggle, notice }: LobbyProps) {
  const { t } = useI18n();
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const mine = room.seats.find((s) => s.seat === room.you);
  const isHost = room.you !== null && room.hostSeat === room.you;
  const filled = room.seats.length;
  const allFilled = filled >= room.playerCount;
  const allReady = allFilled && room.seats.every((s) => s.ready);
  const awaited = Math.max(0, room.playerCount - filled) + room.seats.filter((s) => !s.ready).length;
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

  // ---- what is played ----
  const o = room.options ?? {};
  const vp = useMemo(() => roomVp(o, room.playerCount), [o, room.playerCount]);
  let modes: string;
  let art: string;
  if (o.highlands) {
    modes = t('hub_mode_hl');
    art = 'jungle';
  } else {
    const parts: string[] = [];
    if (o.expansion) parts.push(t('hub_mode_sh'));
    if (o.tidelands) parts.push(`${t('hub_mode_tl')} · ${t(`sc_${o.tidelands}`)}`);
    modes = parts.length ? parts.join(' + ') : t('hub_mode_base');
    art = o.tidelands ? 'harbor' : o.expansion ? 'quarry' : 'field';
  }
  const modeSub = [o.highlands ? t(`hl_${o.highlands}`) : null, t('lobby_modeSub')].filter(Boolean).join(' · ');

  // The server fills seats in order, so a bot always goes to the first empty one.
  const firstEmpty = filled + 1;

  return (
    <main className="hub lobby">
      <header className="hub-head lobby-head">
        <button type="button" className="hub-pill" onClick={onLeave}>
          <GameIcon name="arrowLeft" size={16} /> {t('lobby_leave')}
        </button>
        <span className="lobby-kicker">{t('lobby_kicker')}</span>
        <button type="button" className="hub-pill" onClick={onLangToggle} aria-label={t('langToggle')}>
          {t('langToggle')}
        </button>
      </header>

      <div className="lobby-main">
        {/* The code is the hero. */}
        <section className="hub-hero lobby-hero" data-hero="room" aria-label={t('lobby_codeTitle')}>
          <div className="hub-hero-text">
            <span className="hub-kicker">{t('lobby_codeTitle')}</span>
            <span className="lobby-code" data-testid="lobby-code">
              {room.code}
            </span>
            <div className="hub-hero-actions">
              <button type="button" className="lobby-copy" onClick={() => copy('code')}>
                {copied === 'code' ? t('lobby_copiedCode') : t('lobby_copy')}
              </button>
              <button type="button" className="hub-primary lobby-share" onClick={() => copy('link')}>
                {copied === 'link' ? t('lobby_copiedLink') : t('lobby_share')}
              </button>
              <span className="hub-hero-note lobby-code-hint">{t('lobby_codeHint')}</span>
            </div>
          </div>
        </section>

        {/* What is played. */}
        <div className="lobby-mode" data-testid="lobby-expansions">
          <img src={art2dUrl('terrain', art)} alt="" draggable={false} />
          <div>
            <b>{t('lobby_modeLine', { modes, vp: vp ?? '?', n: room.playerCount })}</b>
            <span>{modeSub}</span>
          </div>
        </div>

        {/* The sheet: the players. */}
        <section className="hub-sheet lobby-sheet" aria-label={t('lobby_seatsTitle', { n: filled, m: room.playerCount })}>
          <div className="lobby-sheet-head">
            <h2>{t('lobby_seatsTitle', { n: filled, m: room.playerCount })}</h2>
            <span>{allReady ? t('lobby_allReady') : t('lobby_needAll', { m: room.playerCount })}</span>
          </div>
          <ul className="lobby-seats">
            {Array.from({ length: room.playerCount }, (_, i) => {
              const seatId = `p${i + 1}`;
              const seat = room.seats.find((s) => s.seat === seatId);
              if (!seat) {
                const canAdd = isHost && !!onAddBot && i + 1 === firstEmpty;
                return (
                  <li key={seatId} className="lobby-seat empty">
                    <span className="lobby-seat-hole" aria-hidden="true" />
                    <span className="lobby-seat-wait">{t('lobby_empty', { n: i + 1 })}</span>
                    {canAdd && (
                      <span className="lobby-bot-add">
                        <button type="button" className="lobby-bot-btn" onClick={() => onAddBot(botLevel)}>
                          + {t('lobby_addBot')}
                        </button>
                        <span className="hub-select">
                          <select aria-label={t('lobby_botLevel')} value={botLevel} onChange={(e) => setBotLevel(e.target.value as BotLevel)}>
                            {BOT_LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {t(`bot_${l}`)}
                              </option>
                            ))}
                          </select>
                        </span>
                      </span>
                    )}
                  </li>
                );
              }
              const you = seatId === room.you;
              const host = room.hostSeat === seatId;
              const tags = seat.bot
                ? t('lobby_tagBot', { level: t(`bot_${seat.bot}`) })
                : [you ? t('net_you') : null, host ? t('lobby_host') : null].filter(Boolean).join(' · ') || t('lobby_tagPlayer');
              const dot = seat.bot || seat.connected;
              return (
                <li key={seatId} className={you ? 'lobby-seat mine' : 'lobby-seat'} data-seat={seatId}>
                  <span className="lobby-seat-pic">
                    <Avatar id={seat.avatar} seat={seatId} size={48} />
                    <span
                      className={dot ? 'lobby-dot on' : 'lobby-dot off'}
                      role="img"
                      aria-label={t(dot ? 'lobby_connected' : 'lobby_disconnected')}
                      title={t(dot ? 'lobby_connected' : 'lobby_disconnected')}
                    />
                  </span>
                  <span className="lobby-seat-who">
                    <span className="lobby-seat-name">{seat.bot ? <><GameIcon name="bot" size={16} /> {seat.name}</> : seat.name}</span>
                    <span className="lobby-seat-tags">{tags}</span>
                  </span>
                  <span className={seat.ready ? 'lobby-ready on' : 'lobby-ready'}>
                    {seat.bot ? t('lobby_alwaysReady') : seat.ready ? <><GameIcon name="check" size={14} /> {t('lobby_ready')}</> : t('lobby_notReady')}
                  </span>
                  {isHost && !you && onKick && (
                    <button
                      type="button"
                      className="lobby-kick"
                      onClick={() => onKick(seatId)}
                      aria-label={t(seat.bot ? 'lobby_removeBotTitle' : 'lobby_kickTitle', { name: seat.name })}
                      title={t(seat.bot ? 'lobby_removeBotTitle' : 'lobby_kickTitle', { name: seat.name })}
                    >
                      <GameIcon name="cross" size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="hub-hint lobby-foot-note">{t('lobby_footnote')}</p>
          <div className="lobby-actions">
            <button
              type="button"
              className={mine?.ready ? 'lobby-ready-btn on' : 'lobby-ready-btn'}
              aria-pressed={!!mine?.ready}
              onClick={() => onReady(!mine?.ready)}
            >
              {mine?.ready ? <><GameIcon name="check" size={16} /> {t('lobby_readyOn')}</> : t('lobby_readyGo')}
            </button>
            {isHost ? (
              <button type="button" className="hub-primary lobby-start" onClick={onStart} disabled={!allReady}>
                {allReady ? t('lobby_start') : t('lobby_startWait', { n: awaited })}
              </button>
            ) : (
              <span className="lobby-wait-host">{t('lobby_waitingHost')}</span>
            )}
          </div>
          {notice && (
            <p className="error-text" role="alert">
              {notice}
            </p>
          )}
        </section>

        {/* Portraits. */}
        {onAvatar && room.you && (
          <section className="lobby-pics" aria-labelledby="lobby-pics-title">
            <h2 id="lobby-pics-title">
              {t('lobby_avatarTitle')} <span>— {t('lobby_avatarRule')}</span>
            </h2>
            <ul className="avatar-picker">
              {AVATARS.map((a) => {
                const owner = room.seats.find((s) => s.avatar === a);
                const mineA = owner?.seat === room.you;
                const taken = !!owner && !mineA;
                const label = mineA
                  ? t('lobby_avatarMine')
                  : taken
                    ? t('lobby_avatarTaken', { name: owner.name })
                    : t('lobby_avatarFree');
                return (
                  <li key={a}>
                    <button
                      type="button"
                      className={`avatar-pick${mineA ? ' mine' : ''}${taken ? ' taken' : ''}`}
                      aria-pressed={mineA}
                      disabled={taken}
                      title={label}
                      aria-label={label}
                      onClick={() => onAvatar(mineA ? null : a)}
                    >
                      <Avatar id={a} seat={owner?.seat ?? room.you!} size={72} />
                      <span className="avatar-pick-label">{mineA ? t('net_you') : taken ? owner.name : t('lobby_free')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {onChat && <LobbyChat messages={chat ?? []} you={room.you} onSend={onChat} roomCode={room.code} />}
      </div>
    </main>
  );
}

/** The room chat, inline in the lobby. What is shown counts as read for the game's chat bubble. */
function LobbyChat({ messages, you, onSend, roomCode }: { messages: ChatMessage[]; you: string | null; onSend: (text: string) => void; roomCode: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const lastId = messages.length ? messages[messages.length - 1].id : 0;

  useEffect(() => {
    if (lastId) markChatSeen(roomCode, lastId);
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, roomCode]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text.slice(0, CHAT_MAX_LEN));
    setDraft('');
  };

  return (
    <section className="lobby-chat" aria-label={t('chat_title')}>
      <h2>{t('chat_title')}</h2>
      <ol className="lobby-chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && <li className="lobby-chat-empty">{t('chat_empty')}</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.seat === you ? 'lobby-chat-line mine' : 'lobby-chat-line'}>
            <Avatar id={m.avatar} seat={m.seat} size={22} />
            <b>{m.seat === you ? t('chat_you') : m.name}:</b> <span>{m.text}</span>
          </li>
        ))}
      </ol>
      <form className="lobby-chat-form" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          maxLength={CHAT_MAX_LEN}
          placeholder={t('chat_lobbyPlaceholder')}
          aria-label={t('chat_lobbyPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>
          {t('chat_send')}
        </button>
      </form>
    </section>
  );
}
