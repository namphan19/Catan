import type { ActionDef, ApplyCtx, Ctx, HookArgs, HookName, HookPrev, Rules, RulesConfig, Ruleset } from './types';

/** Fold rulesets into one Rules object. Order matters: later rulesets see earlier results. */
export function composeRules(list: Ruleset[]): Rules {
  const ids = list.map((r) => r.id);
  list.forEach((r, i) => {
    for (const dep of r.requires ?? [])
      if (!ids.slice(0, i).includes(dep)) throw new Error(`ruleset ${r.id} requires ${dep} before it`);
  });
  let config: RulesConfig | undefined;
  for (const r of list) if (r.config) config = r.config(config);
  if (!config) throw new Error('no ruleset provides a config');

  const actions: Record<string, ActionDef> = {};
  for (const r of list)
    for (const [t, make] of Object.entries(r.actions ?? {})) actions[t] = make(actions[t]);

  const hookLists: Partial<Record<HookName, Array<(...a: unknown[]) => unknown>>> = {};
  for (const r of list)
    for (const [name, fn] of Object.entries(r.hooks ?? {}))
      (hookLists[name as HookName] ??= []).push(fn as (...a: unknown[]) => unknown);

  const rules: Rules = {
    ids,
    config,
    actions,
    call<K extends HookName>(name: K, ctx: Ctx, seed: HookPrev<K>, ...args: HookArgs<K>): HookPrev<K> {
      let acc: unknown = seed;
      for (const fn of hookLists[name] ?? []) acc = fn(ctx, acc, ...args);
      return acc as HookPrev<K>;
    },
    init(ctx: ApplyCtx) {
      for (const r of list) r.init?.(ctx);
    },
    prepare(init, given) {
      for (const r of list) r.prepare?.(init, config as RulesConfig, given);
    },
    makeBoard(rng, init) {
      let board;
      for (const r of list) board = r.makeBoard?.(rng, init, config as RulesConfig) ?? board;
      return board;
    },
    views(ctx: Ctx, viewer) {
      const out: Record<string, unknown> = {};
      for (const r of list) if (r.view) out[r.id] = r.view(ctx, viewer);
      return out;
    },
    redactAction(action, viewer) {
      let a = action;
      for (const r of list) if (r.redactAction) a = r.redactAction(a, viewer);
      return a;
    },
  };
  return rules;
}
