Research task (web, via proxy). Only write the file docs/research/rules-check.md. Do not edit anything else.

The machine has no direct internet. For every download use the proxy, e.g.:
  export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128 ; curl -sL -m 30 "<url>"
Strip HTML before reading (e.g. pipe through: sed -e 's/<[^>]*>//g' | tr -s ' \n'), read only the relevant parts.

Context: we build an ORIGINAL hex-tile settlement/trading game in the same genre as the classic
"Settlers of Catan" base game + its 5-6 player extension. We do NOT copy its text, names or art; we only
want to know how the standard published rules resolve some edge cases, so our own decisions are sensible.
Good public sources: the official rules on catan.com (e.g. https://www.catan.com/understand-catan/game-rules
and the base game / 5-6 extension rules or FAQ pages linked there), en.wikipedia.org/wiki/Catan,
boardgamegeek.com rules threads. Fetch them through the proxy.

For each question below write: the answer per the standard published rules IN YOUR OWN WORDS (no long
quotes; at most one short phrase per item), the source URL(s) you actually fetched, and "unclear" when
the sources do not say. Never invent an answer.
Q1 Who starts / who places first in setup?
Q2 Second setup settlement: resources per adjacent hex - what if the bank runs out?
Q3 Bank cannot pay everyone for a resource on a roll - who gets what?
Q4 Robber: may you steal from a player with no cards? must you pick a victim with a building there? may the robber go back to the desert?
Q5 Bank/harbor trades: may you do several 4:1 trades in one go? any limit?
Q6 Player trades: who may trade with whom, when (before rolling?), may non-active players trade with each other?
Q7 Year-of-plenty-type card (take 2 from bank) when the bank has fewer than 2.
Q8 5-6 player special building phase: what is allowed (build? buy cards? trade? play cards?)
Q9 May a development card bought in the special building phase be played on your next turn?
Q10 Longest road: tie rules and what happens when the holder's road is broken.
Q11 When can you win? Can you win during the special building phase or another player's turn?
Q12 May a knight-type card be played before rolling the dice? How many cards per turn?
Q13 Order of discarding on a 7.
Q14 Harbor placement on the board (fixed frame positions? variable?).
Q15 5-6 player extension contents: number of hexes per terrain, number tokens, harbors, bank cards per resource, development cards per type.
Q16 Number token placement rules (spiral/alphabetical order? red numbers 6/8 not adjacent rule?).
Q17 Running out of pieces (settlements/cities/roads) - what happens; city returns settlement to supply?
Q18 Is a 2-player game officially supported by the base game?
Write the file incrementally: append each answer as soon as you have it. End the file with a list of every URL fetched and whether it loaded. Keep the file under 150 lines.
