// Quick rules reminder for new players (opened with the "?" button in the top bar).
// The text is our own summary (docs/RULES.md); every number comes from the config / the view.
import { baseConfig, type PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { Dialog } from '../ui/Dialog';

export function HelpDialog({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const { t } = useI18n();
  const c = baseConfig;
  const route = c.awards['longestRoute'];
  const force = c.awards['largestForce'];
  return (
    <Dialog title={t('help_title')} onClose={onClose}>
      <div className="help">
        <p className="help-goal">{t('help_goal', { n: view.init.vpToWin })}</p>

        <h3>{t('help_turnTitle')}</h3>
        <ol>
          <li>{t('help_turn1')}</li>
          <li>{t('help_turn2', { r: c.bankRate, g: c.genericHarborRate, s: c.specificHarborRate })}</li>
          <li>{t('help_turn3')}</li>
          <li>{t('help_turn4')}</li>
        </ol>

        <h3>{t('help_blockerTitle', { n: c.blockerNumber })}</h3>
        <p>{t('help_blocker', { limit: c.discardLimit })}</p>

        <h3>{t('help_buildTitle')}</h3>
        <p>{t('help_build')}</p>

        <h3>{t('help_pointsTitle')}</h3>
        <p>
          {t('help_points', {
            a: c.buildingVP['settlement'] ?? 0,
            b: c.buildingVP['city'] ?? 0,
            rmin: route?.min ?? 0,
            rvp: route?.vp ?? 0,
            fmin: force?.min ?? 0,
            fvp: force?.vp ?? 0,
          })}
        </p>

        <h3>{t('help_cardsTitle')}</h3>
        <p>{t('help_cards', { roads: c.freeRoadsCount, take: c.harvestCount })}</p>

        <h3>{t('help_boardTitle')}</h3>
        <p>{t('help_board')}</p>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t('dlg_close')}
        </button>
      </div>
    </Dialog>
  );
}
