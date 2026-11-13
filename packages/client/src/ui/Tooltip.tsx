import { useRef, useState, type ReactNode } from 'react';

/** Half of the tooltip's max width (max-width: 260px) and the viewport edge margin. */
const MAX_HALF = 130;
const EDGE = 8;

type Pos = 'center' | 'left' | 'right';

/** Wraps a control with a CSS tooltip (works on disabled buttons too). The tooltip opens
 * ABOVE the control; on hover/focus we measure the control against the viewport and pin the
 * tooltip to the left or right edge of the control when a centred 260px-wide tooltip would
 * overflow the screen (bottom-bar buttons sit at both viewport edges). */
export function Tooltip({
  tip,
  children,
}: {
  tip: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Pos>('center');

  const update = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.left - MAX_HALF < EDGE) setPos('left');
    else if (r.right + MAX_HALF > window.innerWidth - EDGE) setPos('right');
    else setPos('center');

    // Bottom-bar buttons sit directly under the hand panel, whose row holds the
    // "Bài của bạn / Tổng" status line. Default tooltips open upwards over that line;
    // lift them above the whole hand panel instead (V1 residual).
    let lift = 0;
    const bar = el.closest('.table-bottom');
    const hand = bar?.querySelector('.hand');
    if (hand) {
      const hr = hand.getBoundingClientRect();
      lift = Math.max(0, Math.round(r.top - hr.top - 2));
    }
    el.style.setProperty('--tip-lift', `${lift}px`);
  };

  return (
    <span ref={ref} className="tipwrap" data-tip={tip} data-pos={pos} onMouseEnter={update} onFocus={update}>
      {children}
    </span>
  );
}
