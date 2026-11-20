// Print the tidelands scenario maps (and one generated board each) as text, for map design checks.
// Usage: pnpm --filter @hexgame/engine exec tsx fuzz/tlMaps.ts [scenario] [seed]
import { SCENARIOS } from '../src/rules/tidelands/scenarios';
import { mapById, generateMapBoard } from '../src/rules/tidelands/maps';
import { seedRng } from '../src/rng';

const only = process.argv[2];
const seed = process.argv[3] ?? 'maps';
const LETTER: Record<string, string> = {
  forest: 'F', claypit: 'C', meadow: 'M', field: 'G', quarry: 'Q', waste: 'W', goldmine: 'A', sea: '~', mist: '?',
};
for (const sc of Object.values(SCENARIOS)) {
  if (only && sc.id !== only) continue;
  for (const [k, id] of Object.entries(sc.maps)) {
    const pm = mapById(id);
    const board = generateMapBoard(seedRng(seed), id, { hot: [6, 8], genericRate: 3, specificRate: 2 });
    const byId = Object.fromEntries(board.hexes.map((h) => [h.id, h]));
    const rows = Math.max(...pm.cells.map((c) => c.row)) + 1;
    const land = board.hexes.filter((h) => h.terrain !== 'sea').length;
    console.log(`\n${id} (${k} players): ${board.hexes.length} hexes, ${land} land, ${board.harbors.length} harbors`);
    for (let r = 0; r < rows; r++) {
      const cells = pm.cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col);
      let line = r % 2 ? '   ' : '';
      let col = 0;
      for (const c of cells) {
        while (col < c.col) {
          line += '      ';
          col++;
        }
        const h = byId[c.id];
        const t = (LETTER[h.terrain] ?? '!') + (h.region ?? '') + (h.token ?? '');
        const mark = c.corsair ? '@' : c.harborDir !== undefined ? 'h' : board.blocker === c.id ? 'R' : ' ';
        line += (t + mark).padEnd(6);
        col++;
      }
      console.log(line);
    }
  }
}
