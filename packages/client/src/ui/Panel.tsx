import type { ReactNode } from 'react';

/** Parchment panel with an optional heading. */
export function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      {title && <h3 className="panel-title">{title}</h3>}
      {children}
    </section>
  );
}
