import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastItem {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'gold';
}

export type Toast = Omit<ToastItem, 'id'>;

/** Toast state with auto-expiry. Returns [list, push]; push never lets the stack exceed 4. */
export function useToasts(): [ToastItem[], (t: Toast) => void] {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  const push = useCallback((t: Toast) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    const timer = window.setTimeout(() => {
      setToasts((list) => list.filter((x) => x.id !== id));
    }, 4200);
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
