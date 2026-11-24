// Cheat codes (house fun, not part of the rules). The engine only checks the shape of a chosen roll;
// WHO may choose is decided outside the engine: the server unlocks a seat when its player sends the
// code in chat, the local game when the code is typed on the keyboard.

/** The code that unlocks choosing your own production dice before each roll. */
export const DICE_CHEAT_CODE = 'natra';

/** Lower case, no accents (Vietnamese đ too), no spaces or punctuation: "Xúc xắc vàng!" -> "xucxacvang". */
export function normalizeCheat(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** True when `text` (a chat line, typed keys...) is the dice cheat code. */
export function isDiceCheat(text: string): boolean {
  return normalizeCheat(text) === DICE_CHEAT_CODE;
}

/** Two production dice values, each an integer 1-6. */
export function isDicePair(d: unknown): d is [number, number] {
  return Array.isArray(d) && d.length === 2 && d.every((x) => Number.isInteger(x) && x >= 1 && x <= 6);
}

/** The chosen production dice of a roll action, if it carries any. */
export function chosenDice(a: { t: string; dice?: unknown }): [number, number] | undefined {
  return a.t === 'roll' && isDicePair(a.dice) ? [a.dice[0], a.dice[1]] : undefined;
}
