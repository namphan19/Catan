# Task: review the base rules engine (read-only)

You are reviewing packages/engine/src (TypeScript). Do NOT modify any file.
Read docs/RULES.md and docs/RULES_DECISIONS.md first (the intended rules), then the code by line ranges:
- src/engine.ts, src/view.ts, src/types.ts
- src/ruleset/types.ts, src/ruleset/compose.ts
- src/board/coords.ts, graph.ts, generate.ts, layouts.ts
- src/rules/base/index.ts, helpers.ts, build.ts, turn.ts, trade.ts, cards.ts, config.ts

Look for:
1. Places where the code does not implement docs/RULES.md or a decision in RULES_DECISIONS.md.
2. Correctness bugs: illegal moves accepted, legal moves rejected, wrong phase transitions, resource or
   card duplication/loss, wrong award transfer, longest-route mistakes, win-detection mistakes.
3. Hidden-information leaks in getPlayerView / getEventsView (other players' hands or cards, deck order,
   seed/rng, anything in the action log that reveals hidden info).
4. Purity/determinism problems (mutation of the input state, randomness not from state.rng).
5. Extension points (ruleset hooks/actions) that would force editing base files for a later expansion.

You may run: cd packages/engine && npx vitest run   (takes < 1 min) to see the current tests.
Do not run anything long. For each finding give: severity (high/medium/low), file:line, what is wrong,
a concrete scenario (state + action) that shows it, and a fix suggestion. Say clearly when you are not
sure. No style nits. Final report under 60 lines.
