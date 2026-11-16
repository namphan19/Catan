// 2D/3D board switch. The 3D module is lazy-loaded (three.js is not downloaded for 2D
// users). If WebGL is unavailable, the context is lost, or the 3D chunk fails to load,
// this falls back to the SVG board and reports it so GameTable can show a toast.
import { Component, Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { StrongholdsView } from '@hexgame/engine';
import type { BoardProps } from './Board';
import { Board } from './Board';
import { useI18n } from '../i18n';

export type BoardMode = '2d' | '3d';

const STORAGE_KEY = 'boschtan.boardView';

export function readBoardMode(): BoardMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
}

export function writeBoardMode(mode: BoardMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode / storage disabled: the toggle still works for the session */
  }
}

/** WebGL availability probe before we pay for the three.js chunk. */
export function webglAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const Board3D = lazy(() => import('../board3d/Board3D'));

class ThreeBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export interface BoardSwitchProps extends BoardProps {
  mode: BoardMode;
  /** Called once when 3D cannot render (no WebGL, context lost, chunk error). */
  onFallback: () => void;
  /** Expansion pieces; only the lazy 3D board renders these. */
  strongholds?: StrongholdsView | null;
}

export function BoardSwitch({ mode, onFallback, strongholds, ...boardProps }: BoardSwitchProps) {
  const { t } = useI18n();
  const [fallbackFor, setFallbackFor] = useState<BoardMode | null>(null);

  const use3D = mode === '3d' && fallbackFor !== '3d';

  useEffect(() => {
    if (mode === '2d') {
      setFallbackFor(null);
      return;
    }
    if (!webglAvailable()) {
      setFallbackFor('3d');
      onFallback();
    }
  }, [mode, onFallback]);

  const handleError = useCallback(() => {
    setFallbackFor('3d');
    onFallback();
  }, [onFallback]);

  if (!use3D) return <Board {...boardProps} />;

  return (
    <Suspense
      fallback={
        <div className="board3d-loading" role="status" aria-live="polite">
          <span className="board3d-spinner" aria-hidden="true" />
          {t('board3d_loading')}
        </div>
      }
    >
      <ThreeBoundary onError={handleError}>
        <Board3D {...boardProps} strongholds={strongholds} onFallback={handleError} />
      </ThreeBoundary>
    </Suspense>
  );
}
