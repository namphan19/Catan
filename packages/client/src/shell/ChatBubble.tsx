// Room chat as a floating bubble: a round button that opens/hides a small chat panel. While the
// panel is hidden, a counter on the bubble shows how many lines arrived since it was last open
// (remembered per room, so a reload does not count old lines again). Text is rendered as text only.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { CHAT_MAX_LEN, type ChatMessage } from '../net/protocol';
import { playerColor } from '../ui/colors';

export interface ChatBubbleProps {
  messages: ChatMessage[];
  /** My seat: my own lines never count as unread. */
  you: string | null;
  onSend: (text: string) => void;
  /** 'board': floats in the board area (game, under the zoom buttons); 'page': bottom-right of the page (lobby). */
  placement: 'board' | 'page';
  /** Room code: the "last read" mark is stored per room. */
  roomCode: string;
}

const seenKey = (code: string) => `boschtan.chatSeen.${code}`;

function loadSeen(code: string): number {
  try {
    return Number(localStorage.getItem(seenKey(code))) || 0;
  } catch {
    return 0;
  }
}

function saveSeen(code: string, id: number): void {
  try {
    localStorage.setItem(seenKey(code), String(id));
  } catch {
    /* storage disabled */
  }
}

export function ChatBubble({ messages, you, onSend, placement, roomCode }: ChatBubbleProps) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [seen, setSeen] = useState(() => loadSeen(roomCode));
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  // A server restart starts the ids again from 1: an old mark above every id no longer applies.
  const seenId = seen > lastId && messages.length > 0 ? 0 : seen;
  const unread = open ? 0 : messages.filter((m) => m.id > seenId && m.seat !== you).length;

  useEffect(() => setSeen(loadSeen(roomCode)), [roomCode]);

  // While open, everything shown is read; keep the list scrolled to the newest line.
  useEffect(() => {
    if (!open) return;
    if (lastId !== seen) {
      setSeen(lastId);
      saveSeen(roomCode, lastId);
    }
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, lastId, seen, roomCode]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text.slice(0, CHAT_MAX_LEN));
    setDraft('');
  };

  const time = (at: number) =>
    new Date(at).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`chat chat-${placement}`}>
      <button
        type="button"
        className={`chat-bubble${unread > 0 ? ' has-unread' : ''}`}
        aria-expanded={open}
        aria-controls="chat-panel"
        aria-label={unread > 0 ? t('chat_openUnread', { n: unread }) : open ? t('chat_hide') : t('chat_open')}
        title={open ? t('chat_hide') : t('chat_open')}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">💬</span>
        {unread > 0 && (
          <span className="chat-count" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <section id="chat-panel" className="chat-panel" aria-label={t('chat_title')}>
          <header className="chat-head">
            <h2>{t('chat_title')}</h2>
            <button type="button" className="btn btn-icon" onClick={() => setOpen(false)} aria-label={t('chat_hide')}>
              ✕
            </button>
          </header>
          <ol className="chat-list" ref={listRef} aria-live="polite">
            {messages.length === 0 && <li className="chat-empty">{t('chat_empty')}</li>}
            {messages.map((m) => (
              <li key={m.id} className={m.seat === you ? 'chat-line mine' : 'chat-line'}>
                <span className="chat-meta">
                  {/* Seat colour as a dot: some seat colours (white) are unreadable as text on parchment. */}
                  <span className="chat-dot" style={{ background: playerColor(m.seat) }} aria-hidden="true" />
                  <b>{m.seat === you ? t('chat_you') : m.name}</b>
                  <time dateTime={new Date(m.at).toISOString()}>{time(m.at)}</time>
                </span>
                <span className="chat-text">{m.text}</span>
              </li>
            ))}
          </ol>
          <form className="chat-form" onSubmit={submit}>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              maxLength={CHAT_MAX_LEN}
              placeholder={t('chat_placeholder')}
              aria-label={t('chat_placeholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  // Hide the chat only; do not also cancel a running board choice.
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
              {t('chat_send')}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
