#!/usr/bin/env node
// Quick asset contract check for Boschtan art (artist role).
// Verifies every contract file exists, starts with <svg, has the required
// viewBox, contains no <image> / raster, and no "http" except the xmlns.
const fs = require("fs");
const path = require("path");

const A = path.join(__dirname);
const V = {
  "terrain/forest.svg": "0 0 200 230", "terrain/claypit.svg": "0 0 200 230",
  "terrain/meadow.svg": "0 0 200 230", "terrain/field.svg": "0 0 200 230",
  "terrain/quarry.svg": "0 0 200 230", "terrain/waste.svg": "0 0 200 230",
  "terrain/sea.svg": "0 0 100 100", "token.svg": "0 0 60 60",
  "harbor/any.svg": "0 0 64 64", "harbor/timber.svg": "0 0 64 64",
  "harbor/clay.svg": "0 0 64 64", "harbor/fiber.svg": "0 0 64 64",
  "harbor/grain.svg": "0 0 64 64", "harbor/stone.svg": "0 0 64 64",
  "piece/road.svg": "0 0 60 14", "piece/settlement.svg": "0 0 40 40",
  "piece/city.svg": "0 0 52 44", "piece/blocker.svg": "0 0 40 56",
  "resource/timber.svg": "0 0 120 168", "resource/clay.svg": "0 0 120 168",
  "resource/fiber.svg": "0 0 120 168", "resource/grain.svg": "0 0 120 168",
  "resource/stone.svg": "0 0 120 168",
  "resource/books.svg": "0 0 120 168", "resource/linen.svg": "0 0 120 168",
  "resource/silver.svg": "0 0 120 168",
  "icon/timber.svg": "0 0 24 24", "icon/clay.svg": "0 0 24 24",
  "icon/fiber.svg": "0 0 24 24", "icon/grain.svg": "0 0 24 24",
  "icon/stone.svg": "0 0 24 24",
  "card/back.svg": "0 0 120 168", "card/guard.svg": "0 0 120 168",
  "card/freeRoads.svg": "0 0 120 168", "card/harvest.svg": "0 0 120 168",
  "card/claim.svg": "0 0 120 168", "card/relic.svg": "0 0 120 168",
  "dice/1.svg": "0 0 48 48", "dice/2.svg": "0 0 48 48", "dice/3.svg": "0 0 48 48",
  "dice/4.svg": "0 0 48 48", "dice/5.svg": "0 0 48 48", "dice/6.svg": "0 0 48 48",
  "award/longestRoute.svg": "0 0 64 64", "award/largestForce.svg": "0 0 64 64",
  "emblem/sun.svg": "0 0 24 24", "emblem/wave.svg": "0 0 24 24",
  "emblem/leaf.svg": "0 0 24 24", "emblem/star.svg": "0 0 24 24",
  "emblem/shield.svg": "0 0 24 24", "emblem/flame.svg": "0 0 24 24",
  "ui/build.svg": "0 0 24 24", "ui/trade.svg": "0 0 24 24",
  "ui/card.svg": "0 0 24 24", "ui/end.svg": "0 0 24 24",
  "ui/roll.svg": "0 0 24 24", "ui/undo.svg": "0 0 24 24",
  "ui/close.svg": "0 0 24 24", "ui/info.svg": "0 0 24 24",
};

let fail = 0, pass = 0;
for (const [rel, vb] of Object.entries(V)) {
  const file = path.join(A, rel);
  let ok = true, why = [];
  if (!fs.existsSync(file)) { console.log(`FAIL ${rel}: missing`); fail++; continue; }
  const s = fs.readFileSync(file, "utf8");
  const head = s.replace(/<\?xml[^>]*\?>\s*/, "").trimStart();
  if (!head.startsWith("<svg")) { ok = false; why.push("does not start with <svg"); }
  if (!s.includes(`viewBox="${vb}"`)) { ok = false; why.push(`viewBox "${vb}" missing`); }
  if (/<image|<script|data:|base64/i.test(s)) { ok = false; why.push("embedded raster/script/data URI"); }
  const http = s.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, "");
  if (/http/i.test(http)) { ok = false; why.push("external http ref"); }
  if (s.length > 15 * 1024) { ok = false; why.push("over 15 KB"); }
  if (ok) { pass++; console.log(`PASS ${rel} (${(s.length / 1024).toFixed(1)} KB)`); }
  else { fail++; console.log(`FAIL ${rel}: ${why.join("; ")}`); }
}
console.log(`\n${pass} passed, ${fail} failed of ${Object.keys(V).length}`);
process.exit(fail ? 1 : 0);
