import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ToastItem {
  id: number;
  text: ReactNode;
  kind: 'info' | 'error' | 'gold';
}

export type Toast = Omit<ToastItem, 'id'>;

const MAX_TOASTS = 3;
const TOAST_MS = 4000;

/** Toast state with 4 s auto-expiry; the visible stack never exceeds 3 (V5). */
export function useToasts(): [ToastItem[], (t: Toast) => void] {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  const push = useCallback((t: Toast) => {
    const id = nextId.current++;
    setToasts((list) => {
      const next = [...list, { ...t, id }];
      return next.slice(-MAX_TOASTS);
    });
    const timer = window.setTimeout(() => {
      setToasts((list) => list.filter((x) => x.id !== id));
    }, TOAST_MS);
    timers.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((x) => window.clearTimeout(x));
    },
    [],
  );

  return [toasts, push];
}

/** Stacked toasts; aria-live so screen readers hear new events. */
export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-stack" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
