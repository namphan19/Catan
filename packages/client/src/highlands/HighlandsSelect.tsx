// Highlands picker for the home screens: off, shuffled map or printed map. Highlands plays alone (no
// Strongholds, no Tidelands) with 2-4 players; the forms disable those controls while it is on.
import { useI18n } from '../i18n';

export type HighlandsMap = 'variable' | 'starter';

export function HighlandsSelect({ id, value, onChange }: { id?: string; value: HighlandsMap | ''; onChange: (v: HighlandsMap | '') => void }) {
  const { t } = useI18n();
  return (
    <select
      id={id}
      value={value}
      title={t('hl_pickHint')}
      onChange={(e) => onChange(e.target.value === 'variable' || e.target.value === 'starter' ? e.target.value : '')}
      data-testid="highlands-select"
    >
      <option value="">{t('hl_off')}</option>
      <option value="variable">{t('hl_variable')}</option>
      <option value="starter">{t('hl_starter')}</option>
    </select>
  );
}
