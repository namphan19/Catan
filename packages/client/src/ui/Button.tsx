import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  /** Tooltip text (also the disabled reason from validateAction). */
  tip?: string;
}

/** Focusable button; when a tip is given it is wrapped in a tooltip. The accessible name
 * stays the visible label text (BUG-QA-03): the tooltip reason is display-only. */
export function Button({ variant = 'ghost', tip, children, className, ...rest }: ButtonProps) {
  const cls = `btn btn-${variant}${className ? ` ${className}` : ''}`;
  const btn = (
    <button type="button" {...rest} className={cls}>
      {children}
    </button>
  );
  return tip ? <Tooltip tip={tip}>{btn}</Tooltip> : btn;
}

/** Small labelled group used in dialogs and panels. */
export function Fieldset({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="fieldset">
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}
