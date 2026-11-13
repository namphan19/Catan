# Task: mechanics summary of the provided expansion rulebook (for our own advanced ruleset, M3)

Only write: data/raw/rules/ (git-ignored scratch) and docs/research/advanced-mechanics.md.
Input: the PO's rulebook PDF in docs/ (file name starts with "CN3087"). It is a commercial rulebook:
NEVER copy its text into the repo; summarise mechanics IN YOUR OWN WORDS, no product names, no card titles,
no quotes. Use neutral descriptive ids (e.g. "city upgrade track", "defence threat track", "progress card: X-effect").

Step 1 (extract text locally, < 1 min):
  python -I -c "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1]); open(sys.argv[2],'w',encoding='utf-8').write('\n\n'.join(f'=== page {i+1} ===\n'+(p.extract_text() or '') for i,p in enumerate(r.pages)))" "docs/<the CN3087 pdf>" data/raw/rules/advanced.txt
  Then read data/raw/rules/advanced.txt by line ranges (grep first). Never read it whole.
Step 2: write docs/research/advanced-mechanics.md (append section by section, small increments):
  1. Components it adds (counts only, neutral names).
  2. Turn flow changes (dice, extra die effects, phases) - which of our engine hooks they need:
     rollDice, production, buildCost, victoryPoints, checkWinner, phaseAfterRoll, phaseAfterTurn,
     new actions, init (see packages/engine/src/ruleset/types.ts and docs/API.md).
  3. Production changes, new build items and their costs, upgrade tracks, special pieces, threat/defence
     mechanic, card types and their effects (grouped, neutral names), VP and win condition changes.
  4. Hidden information it introduces (what getPlayerView must redact).
  5. Anything that changes base rules for 5-6 players (if the rulebook mentions it).
  6. Ambiguities / questions for the PO (numbered), with the page number where it comes up.
  7. Which of our base questions it answers: for Q1-Q18 in team/tasks/research-rules.md, note any the
     rulebook covers (page number + your own-words summary), else "not covered".
Keep it under 250 lines. Final report < 30 lines.
