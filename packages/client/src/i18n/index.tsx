// i18n context: Vietnamese default, English toggle. t(key, params) interpolates {name}-style slots.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { vi } from './vi';
import { en } from './en';
import { shEn, shVi } from '../strongholds/i18n';

export type Lang = 'vi' | 'en';

const DICTS: Record<Lang, Record<string, string>> = { vi: { ...vi, ...shVi }, en: { ...en, ...shEn } };

export interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a key with optional {slot} parameters. Missing keys fall back to Vietnamese, then the key itself. */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nCtx = createContext<I18n | null>(null);

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('vi');
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, params) => {
        const dict = DICTS[lang];
        const s = dict[key] ?? DICTS.vi[key] ?? key;
        return interpolate(s, params);
      },
    }),
    [lang],
  );
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}

/** Ordered resource ids as a display list (order only; rules live in the engine). */
export const RESOURCE_ORDER = ['timber', 'clay', 'fiber', 'grain', 'stone'] as const;
export type ResourceName = (typeof RESOURCE_ORDER)[number];

/** ui string key for a resource / terrain / card id that may be unknown to a ruleset. */
export function resKey(r: string): string {
  return RESOURCE_ORDER.includes(r as ResourceName) ? `res_${r}` : r;
}
export function cardKey(c: string): string {
  return ['guard', 'freeRoads', 'harvest', 'claim', 'relic'].includes(c) ? `card_${c}` : c;
}
export function terrainKey(tr: string): string {
  return ['forest', 'claypit', 'meadow', 'field', 'quarry', 'waste', 'sea'].includes(tr)
    ? `terrain_${tr}`
    : tr;
}

/** Human list "Gỗ, Lúa" from a bag. */
export function bagText(
  bag: Record<string, number>,
  t: (k: string, p?: Record<string, string | number>) => string,
): string {
  const parts = Object.entries(bag)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n}× ${t(resKey(r))}`);
  return parts.length ? parts.join(', ') : t('toast_none');
}

/** Base resources in display order, then whatever else a ruleset puts into hands (commodities). */
export function resourceKinds(bag: Record<string, unknown> | undefined): string[] {
  const extra = Object.keys(bag ?? {}).filter((r) => !(RESOURCE_ORDER as readonly string[]).includes(r));
  return [...RESOURCE_ORDER, ...extra];
}
