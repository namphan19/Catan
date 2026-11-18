// The current roll, large, in the top-right corner of the board area (over 2D and 3D alike).
// Expansion games also show the event die, and the first production die is drawn red: it is the one
// compared with track levels when the event die shows a track.
import { baseConfig, type PlayerView, type StrongholdsView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { Die } from '../ui/Die';
import { EventDie } from '../strongholds/EventDie';
import { trackName } from '../strongholds/labels';

export function DiceBox({ view, sh }: { view: PlayerView; sh?: StrongholdsView | null }) {
  const { t } = useI18n();
  const name = useName();
  const roll = view.turn.roll;
  if (!roll || roll.length === 0) return null;
  const sum = roll.reduce((s, d) => s + d, 0);
  const face = sh?.eventDie ?? null;
  const faceName = face ? (face === 'raid' ? t('sh_dieRaid') : trackName(t, face)) : '';
  const label = face
    ? t('sh_diceTitle', { name: name(view.turn.current), sum, red: roll[0], event: faceName })
    : t('dice_title', { name: name(view.turn.current), sum });
  return (
    <div className="dice-box" title={label} role="img" aria-label={label}>
      {/* The key restarts the roll-in animation for every new roll. */}
      <div className="dice-roll" key={`${view.turn.n}:${roll.join('-')}:${face ?? ''}`}>
        {roll.map((d, i) => (
          <Die key={i} n={d} size={52} tone={i === 0 ? 'red' : 'yellow'} />
        ))}
        <span className="dice-sum" data-blocker={sum === baseConfig.blockerNumber ? 'true' : 'false'}>
          = {sum}
        </span>
        {face && (
          <span className="dice-event">
            <EventDie face={face} size={52} />
          </span>
        )}
      </div>
    </div>
  );
}
