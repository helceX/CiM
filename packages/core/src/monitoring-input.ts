import { conceptKey, normalizeAliasGroups } from "./concepts";
import { normalizeIntent, type MonitoringIntent } from "./intent";
import { companyNames, type QueryAst } from "./query-ast";

export type MonitoringInput = {
  include: readonly string[];
  exclude: readonly string[];
  exactPhrases: readonly string[];
  aliasGroups?: readonly (readonly string[])[];
  company?: { name: string; short?: string } | undefined;
  /** What the person wants from the monitoring (see intent.ts). */
  intent?: MonitoringIntent | undefined;
};

/**
 * What a monitoring searches, from what a person entered. Every name — an alias, the company's full
 * name and its short name — is also an ordinary keyword, so a name that is not listed yet is added;
 * the company's two names are read as one thing (İstanbul Ticaret Odası = İTO) unless the person
 * already grouped them differently.
 */
export function assembleQueryAst(input: MonitoringInput): QueryAst {
  const listed = new Set([...input.include, ...input.exactPhrases].map(conceptKey));
  const include = [...input.include];
  const add = (name: string) => {
    const key = conceptKey(name);
    if (key && !listed.has(key)) {
      include.push(name);
      listed.add(key);
    }
  };

  const groups: string[][] = (input.aliasGroups ?? []).map((group) => [...group]);
  const names = companyNames({ company: input.company });
  if (names.length === 2) {
    const taken = new Set(groups.flat().map(conceptKey));
    if (!names.some((name) => taken.has(conceptKey(name)))) groups.push(names);
  }
  const aliasGroups = normalizeAliasGroups(groups);
  for (const name of [...aliasGroups.flat(), ...names]) add(name);

  const ast: QueryAst = { include, exclude: [...input.exclude], exactPhrases: [...input.exactPhrases] };
  if (aliasGroups.length > 0) ast.aliasGroups = aliasGroups;
  if (input.company?.name.trim()) {
    ast.company = { name: input.company.name.trim(), ...(input.company.short?.trim() ? { short: input.company.short.trim() } : {}) };
  }
  const intent = normalizeIntent(input.intent);
  if (intent) ast.intent = intent;
  return ast;
}
