// Full-screen cover between hot-seat actors so hands stay hidden.
import { useEffect } from 'react';
import { useI18n } from '../i18n';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { Button } from '../ui/Button';

interface PassDeviceCoverProps {
  name: string;
  playerId: string;
  onReady: () => void;
}

export function PassDeviceCover({ name, playerId, onReady }: PassDeviceCoverProps) {
  const { t } = useI18n();

  // Any key or click confirms: the person holding the device is the named player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return; // Esc is reserved for cancelling selections
      onReady();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onReady]);

  return (
    <div className="cover" role="dialog" aria-modal="true" aria-label={t('cover_title')}>
      <div className="cover-card" style={{ borderColor: playerColor(playerId) }}>
        <p className="cover-title">{t('cover_title')}</p>
        {/* ink text: the emblem and the card border carry the seat colour (ivory p3 is unreadable on parchment) */}
        <p className="cover-name">
          <Emblem id={playerEmblem(playerId)} size={40} color={playerColor(playerId)} />
          {name}
        </p>
        <Button variant="primary" onClick={onReady}>
          {t('cover_ready')}
        </Button>
        <p className="hint">{t('cover_hint')}</p>
      </div>
    </div>
  );
}
