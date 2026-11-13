# Task: compare our base rules with the PO's official rulebooks (base + 5-6 players)

Only write: docs/research/rules-check.md (new). Do not edit anything else.
Inputs (plain text already extracted, git-ignored; read by line ranges, grep first, NEVER whole):
- data/raw/rules/base.txt       (official base game rulebook, 12 pages)
- data/raw/rules/five-six.txt   (official 5-6 player rules, 2025 edition, 4 pages)
- our rules: docs/RULES.md, our decisions: docs/RULES_DECISIONS.md (D1-D21)
These are commercial rulebooks: summarise IN YOUR OWN WORDS, no copied sentences, at most a 5-word phrase.
Our game is original with renamed terms: timber=wood, clay=brick, fiber=wool, grain=wheat, stone=ore,
blocker=robber, guard=knight, freeRoads=road building, harvest=year of plenty/invention, claim=monopoly,
relic=victory point card, longestRoute=longest road, largestForce=largest army, extraBuild=special building phase.

For every numbered section of docs/RULES.md and every decision D1-D21 write one row:
| item | our rule (short) | official rule (own words, page) | same / differs / not covered | suggestion |
Be precise about numbers (costs, counts, hand limit, VP target, award thresholds, tokens, harbors, deck).
Then a section "5-6 players": the 2025 edition replaces the special building phase with PAIRED PLAYERS
(see five-six.txt around lines 700-770). Describe exactly: who is player 2, what player 2 may and may not
do, when a player-2 win counts, card-play rules for player 2, robber/knight for player 2, the setup and
first-player rules for 5-6, and the 5-6 board contents (hexes per terrain, number discs incl. letter order,
harbors, resource cards, development cards).
Then "Setup and first player" from base.txt (fixed vs variable setup, how the first player is chosen,
starting resources).
Write the file incrementally (append each section as soon as it is done). Under 200 lines.
Final report < 30 lines with the count of "differs" rows.
