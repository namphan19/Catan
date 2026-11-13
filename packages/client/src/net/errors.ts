// Server error codes -> Vietnamese (fallback English) toast text (docs/PROTOCOL.md task):
// known protocol codes and the common engine validation codes are translated; anything
// unknown shows the server's own message.
import { useI18n } from '../i18n';

export function errorText(code: string, message: string, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (KNOWN_CODES.has(code)) return t(`err_${code}`);
  // Unknown code: show the plain server message.
  return t('err_unknown', { msg: message });
}

/** Engine + protocol codes we have translations for (i18n keys `err_<code>`). */
const KNOWN_CODES = new Set([
  // protocol
  'BAD_MESSAGE',
  'BAD_NAME',
  'BAD_TOKEN',
  'BAD_CODE',
  'NEEDS_HELLO',
  'UNKNOWN_TYPE',
  'ALREADY_IN_ROOM',
  'ROOM_LIMIT',
  'NO_SUCH_ROOM',
  'GAME_STARTED',
  'ROOM_FULL',
  'NOT_IN_ROOM',
  'NOT_HOST',
  'ROOM_NOT_FULL',
  'NOT_READY',
  'NOT_IN_GAME',
  'IMPERSONATION',
  'RATE_LIMIT',
  'INTERNAL',
  // engine validation codes (packages/engine validation + rules)
  'BAD_ACTION',
  'UNKNOWN_ACTION',
  'UNKNOWN_PLAYER',
  'NOT_YOUR_TURN',
  'WRONG_PHASE',
  'WRONG_STEP',
  'WRONG_AMOUNT',
  'CANNOT_AFFORD',
  'NOT_ENOUGH',
  'NO_PIECES',
  'NO_ROAD_SPOT',
  'OCCUPIED',
  'DISTANCE_RULE',
  'NOT_CONNECTED',
  'NOT_YOUR_SETTLEMENT',
  'BANK_EMPTY',
  'DECK_EMPTY',
  'NO_CARD',
  'ONE_CARD',
  'JUST_BOUGHT',
  'NOT_PLAYABLE',
  'GAME_OVER',
  'EMPTY_TRADE',
  'BAD_RATE',
  'OWN_OFFER',
  'NO_TRADE',
  'NOT_ACCEPTED',
  'SAME_HEX',
  'SAME_RESOURCE',
  'ONE_KIND',
  'BAD_ARGS',
  'BAD_BAG',
  'BAD_EDGE',
  'BAD_HEX',
  'BAD_TARGET',
  'BAD_VERTEX',
]);

/** Hook form for React components. */
export function useErrorText(): (code: string, message: string) => string {
  const { t } = useI18n();
  return (code, message) => errorText(code, message, t);
}
