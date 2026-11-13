import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  children: ReactNode;
  /** When locked the dialog cannot be dismissed (mandatory phases such as discard/steal). */
  locked?: boolean;
  onClose?: () => void;
}

/** Modal dialog: role=dialog, aria-modal, Esc closes unless locked, initial focus inside. */
export function Dialog({ title, children, locked, onClose }: DialogProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  useEffect(() => {
    // Move focus into the dialog for keyboard users.
    const el = boxRef.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]');
    el?.focus();
  }, []);

  return (
    <div
      className="dialog-overlay"
      onPointerDown={(e) => {
        if (!locked && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={boxRef}>
        <div className="dialog-head">
          <h2>{title}</h2>
          {!locked && (
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          )}
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
