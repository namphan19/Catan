// Typed access to the Tidelands part of a player view (public data only; see the engine's viewOf).
import type { PlayerId, PlayerView } from '@hexgame/engine';

export interface TlView {
  scenario: string;
  corsair: string | null;
  fresh: string[];
  moved: boolean;
  home: Record<PlayerId, string[]>;
  landfall: Record<PlayerId, string[]>;
  gold: { owed: Record<PlayerId, number> } | null;
  mistLeft: number;
  castaways?: { rewards: Record<string, string>; vpTokens: Record<PlayerId, number>; held: Record<PlayerId, string[]>; reservedLeft: number };
  silk?: { villages: Record<string, { silk: number; traders: PlayerId[] }>; supply: number; silk: Record<PlayerId, number>; endAt: number };
  works?: { wonders: string[]; claims: Record<string, PlayerId>; levels: Record<PlayerId, number>; markers: Array<{ v: string; kind: string }> };
  coves?: {
    fleet: number;
    loop: string[];
    seats: Record<PlayerId, { start: string; landing: string; fort: string }>;
    lines: Record<PlayerId, string[]>;
    war: Record<PlayerId, number>;
    lairs: Record<PlayerId, number>;
  };
}

export const tlOf = (view: PlayerView): TlView | null => (view.ext?.tidelands as TlView | undefined) ?? null;
