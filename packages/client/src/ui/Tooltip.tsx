import type { ReactNode } from 'react';

/** Wraps a control with a CSS tooltip (works on disabled buttons too). */
export function Tooltip({
  tip,
  children,
}: {
  tip: string;
  children: ReactNode;
}) {
  return (
    <span className="tipwrap" data-tip={tip}>
      {children}
    </span>
  );
}
