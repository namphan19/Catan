import { useRef, type ReactNode } from 'react';

/** Viewport edge margin for the tooltip (matches .tipwrap::after's max-width maths). */
const EDGE = 8;

/** Wraps a control with a CSS tooltip (works on disabled buttons too). The tip is always
 * anchored centred ABOVE the hovered/focused control. On hover/focus we measure the control
 * and the tip against the viewport and shift the centred tip just enough to stay on screen:
 * bottom-bar buttons sit near both viewport edges, and the tip used to snap to the corner. */
export function Tooltip({
  tip,
  children,
}: {
  tip: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tip-shift', '0px');
    const r = el.getBoundingClientRect();
    // Chromium resolves the used width of the ::after pseudo-element; use it to clamp.
    const w = Number.parseFloat(getComputedStyle(el, '::after').width) || 0;
    if (w <= 0) return;
    const cx = (r.left + r.right) / 2;
    let shift = 0;
    if (cx - w / 2 < EDGE) shift = EDGE - (cx - w / 2);
    else if (cx + w / 2 > window.innerWidth - EDGE) shift = window.innerWidth - EDGE - (cx + w / 2);
    el.style.setProperty('--tip-shift', `${Math.round(shift)}px`);
  };

  return (
    <span ref={ref} className="tipwrap" data-tip={tip} onMouseEnter={update} onFocus={update}>
      {children}
    </span>
  );
}
