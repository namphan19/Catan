// The current roll, large, in the top-right corner of the board area (over 2D and 3D alike).
import { baseConfig, type PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { Die } from '../ui/Die';

export function DiceBox({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const name = useName();
  const roll = view.turn.roll;
  if (!roll || roll.length === 0) return null;
  const sum = roll.reduce((s, d) => s + d, 0);
  const label = t('dice_title', { name: name(view.turn.current), sum });
  return (
    <div className="dice-box" title={label} role="img" aria-label={label}>
      {/* The key restarts the roll-in animation for every new roll. */}
      <div className="dice-roll" key={`${view.turn.n}:${roll.join('-')}`}>
        {roll.map((d, i) => (
          <Die key={i} n={d} size={52} />
        ))}
        <span className="dice-sum" data-blocker={sum === baseConfig.blockerNumber ? 'true' : 'false'}>
          = {sum}
        </span>
      </div>
    </div>
  );
}
