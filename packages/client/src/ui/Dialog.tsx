import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n';

interface DialogProps {
  title: string;
  children: ReactNode;
  /** When locked the dialog cannot be dismissed (mandatory phases such as discard/steal). */
  locked?: boolean;
  onClose?: () => void;
  /**
   * Docked: a small non-modal panel at the side of the board (no backdrop, the board stays visible
   * and usable) - for answers to someone else's trade offer.
   */
  docked?: boolean;
  /** Optional layout hook for specialised sheets (for example the mobile player details). */
  className?: string;
}

/** Modal dialog: role=dialog, aria-modal, Esc closes unless locked, initial focus inside. */
export function Dialog({ title, children, locked, onClose, docked, className }: DialogProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  // The listener must stay registered across re-renders: callers pass a fresh `onClose`
  // on every render, and re-subscribing while another Esc listener re-renders the parent
  // (in the middle of the same key event) used to drop the key press. Keep the latest
  // callback in a ref instead.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked]);

  useEffect(() => {
    // Move focus into the dialog for keyboard users.
    const el = boxRef.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]');
    el?.focus();
  }, []);

  return (
    <div
      className={docked ? 'dialog-overlay docked' : 'dialog-overlay'}
      onPointerDown={(e) => {
        if (!docked && !locked && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`dialog${className ? ` ${className}` : ''}`} role="dialog" aria-modal={docked ? 'false' : 'true'} aria-label={title} ref={boxRef}>
        <div className="dialog-head">
          <h2>{title}</h2>
          {!locked && (
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label={t('dlg_close')}>
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
