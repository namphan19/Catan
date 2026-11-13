// Online shell: owns the WebSocket connection and turns server messages into screen
// state. Screens: OnlineHome (create/join), Lobby (before start), and the GameTable fed
// by the server's redacted `state` (view + legal) and `events` — identical props to the
// hot-seat shell, only their source changes (docs/PROTOCOL.md).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameEvent, PlayerView } from '@hexgame/engine';
import { Connection } from '../net/connection';
import type { RoomInfo, RoomOptions, ServerMsg } from '../net/protocol';
import { CODE_RE } from '../net/protocol';
import { useErrorText } from '../net/errors';
import { useI18n } from '../i18n';
import { NamesProvider } from './names';
import { OnlineHome } from './OnlineHome';
import { Lobby } from './Lobby';
import { GameTable } from '../table/GameTable';

const NAME_KEY = 'boschtan.name';
const ROOM_KEY = 'boschtan.room';

export interface OnlineShellProps {
  onHome: () => void;
  onLangToggle: () => void;
}

export function OnlineShell({ onHome, onLangToggle }: OnlineShellProps) {
  const { t } = useI18n();
  const errText = useErrorText();

  const [name, setName] = useState<string>(() => localStorage.getItem(NAME_KEY) ?? '');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [legal, setLegal] = useState<Action[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Latest values for the connection callbacks (created once, closure-safe via refs).
  const nameRef = useRef(name);
  nameRef.current = name;
  const roomRef = useRef<RoomInfo | null>(room);
  roomRef.current = room;
  const errRef = useRef(errText);
  errRef.current = errText;

  const handleMessage = useCallback((msg: ServerMsg) => {
    switch (msg.type) {
      case 'welcome':
        break; // token already stored by the connection
      case 'room': {
        const info: RoomInfo = {
          code: msg.code,
          hostSeat: msg.hostSeat,
          playerCount: msg.playerCount,
          options: msg.options,
          seats: msg.seats,
          you: msg.you,
          started: msg.started,
        };
        setRoom(info);
        setNotice(null);
        if (info.you !== null) localStorage.setItem(ROOM_KEY, info.code);
        break;
      }
      case 'state': {
        setView(msg.view as PlayerView);
        setLegal(msg.legal as Action[]);
        break;
      }
      case 'events': {
        // The server sends only fresh events per action; GameTable keeps a cumulative feed.
        setEvents((prev) => [...prev, ...(msg.events as GameEvent[])]);
        break;
      }
      case 'error': {
        const text = errRef.current(msg.code, msg.message);
        if (msg.code === 'NO_SUCH_ROOM') {
          // The room is gone (expired/deleted): forget it and show the home screen.
          localStorage.removeItem(ROOM_KEY);
          setRoom(null);
          setView(null);
          setNotice(text);
        } else if (roomRef.current?.started) {
          setErrors((prev) => [...prev, text]);
        } else {
          setNotice(text);
        }
        break;
      }
    }
  }, []);

  const connRef = useRef<Connection | null>(null);
  useEffect(() => {
    const conn = new Connection({
      getName: () => nameRef.current,
      getToken: () => localStorage.getItem('boschtan.sessionToken'),
      setToken: (token) => localStorage.setItem('boschtan.sessionToken', token),
      // Stored code so a reload or a drop rejoins automatically; cleared on leave.
      getRoom: () => roomRef.current?.code ?? localStorage.getItem(ROOM_KEY),
      onMessage: handleMessage,
      onStatus: setOnline,
    });
    connRef.current = conn;
    conn.start();
    return () => {
      conn.stop();
      connRef.current = null;
    };
  }, [handleMessage]);

  const clearGame = useCallback(() => {
    setView(null);
    setLegal([]);
    setEvents([]);
    setErrors([]);
  }, []);

  const changeName = useCallback((n: string) => {
    setName(n);
    const trimmed = n.trim();
    if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
    else localStorage.removeItem(NAME_KEY);
  }, []);

  const createRoom = useCallback(
    (playerCount: number, options?: RoomOptions) => {
      setNotice(null);
      clearGame();
      setRoom(null);
      connRef.current?.send({ type: 'createRoom', playerCount, ...(options ? { options } : {}) });
    },
    [clearGame],
  );

  const joinRoom = useCallback(
    (code: string) => {
      setNotice(null);
      clearGame();
      setRoom(null);
      connRef.current?.send({ type: 'joinRoom', code });
    },
    [clearGame],
  );

  const leaveRoom = useCallback(() => {
    connRef.current?.send({ type: 'leaveRoom' });
    localStorage.removeItem(ROOM_KEY);
    setRoom(null);
    clearGame();
    onHome();
  }, [clearGame, onHome]);

  const setReady = useCallback((ready: boolean) => {
    connRef.current?.send({ type: 'setReady', ready });
  }, []);

  const startGame = useCallback(() => {
    connRef.current?.send({ type: 'startGame' });
  }, []);

  const sendAction = useCallback((a: Action) => {
    // The server only accepts actions naming our own seat; legal actions from the server
    // already carry it, but be defensive for engine shapes without a player field.
    const withSeat = 'player' in a && a.player ? a : { ...a, player: roomRef.current?.you ?? undefined };
    connRef.current?.send({ type: 'action', action: withSeat });
  }, []);

  // Derived screen: room before start -> lobby; started -> game; none -> home.
  const screen = room ? (room.started ? 'game' : 'lobby') : 'home';

  const names = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    room?.seats.forEach((s) => {
      map[s.seat] = s.name;
    });
    return map;
  }, [room]);

  return (
    <>
      {!online && (
        <div className="net-banner" role="status" aria-live="polite">
          {t('net_offline')}
        </div>
      )}
      {screen === 'home' && (
        <OnlineHome
          name={name}
          onName={changeName}
          onCreate={createRoom}
          onJoin={joinRoom}
          onBack={onHome}
          onLangToggle={onLangToggle}
          notice={notice}
        />
      )}
      {screen === 'lobby' && room && (
        <Lobby room={room} onReady={setReady} onStart={startGame} onLeave={leaveRoom} notice={notice} onLangToggle={onLangToggle} />
      )}
      {screen === 'game' && room && (
        <NamesProvider names={names}>
          <div className="shell">
            <div className="shell-strip">
              <span className="shell-viewing">{t('net_room', { code: room.code })}</span>
              <button type="button" className="btn btn-ghost" onClick={onLangToggle}>
                🌐 {t('langToggle')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onHome}>
                {t('net_home')}
              </button>
            </div>
            {view ? (
              <GameTable
                view={view}
                legal={legal}
                onAction={sendAction}
                events={events}
                errors={errors}
                onHome={onHome}
              />
            ) : (
              <p className="hint net-loading">{t('net_loading')}</p>
            )}
          </div>
        </NamesProvider>
      )}
    </>
  );
}

/** Uppercases and validates a room code as typed (5 chars, no O/0/I/1). */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().slice(0, 5);
}

export function isValidCode(raw: string): boolean {
  return CODE_RE.test(raw);
}
