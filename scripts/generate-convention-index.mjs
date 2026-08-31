#!/usr/bin/env node
/**
 * Generate the convention index — one row per rule, pointing at every layer.
 *
 *   node scripts/generate-convention-index.mjs           # write the index
 *   node scripts/generate-convention-index.mjs --check   # fail if it is stale
 *
 * WHY THIS EXISTS. This repo has 15 mechanisms that can state or enforce a rule,
 * across 131 documents. Measured 2026-08-30: nothing is unreachable — every
 * document is indexed and cited — but only 27% of the GOVERNING documents connect
 * to a rule or an enforcer. You can find any document; you cannot tell which rule
 * it serves, or whether a rule has all its layers.
 *
 * Every failure found that day was a missing link rather than a duplicate:
 * an SOP that taught the opposite of a ratified ADR, a rule enforced by eslint and
 * stated nowhere, three SOPs nothing routed to, four prose counts that were wrong.
 *
 * So the index is GENERATED from the handbook's callouts, which already carry the
 * data, and checked against the enforcers on disk in both directions. Hand-written
 * indexes in this repo have drifted every single time — the ADR table, the backlog
 * README, two convention counts — which is the whole argument for generating it.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const HANDBOOK = 'docs/development/handbook.md';
const OUT = 'docs/development/conventions.md';

const md = readFileSync(join(ROOT, HANDBOOK), 'utf8');

/** Section headings, so each convention can say where it is stated. */
const sections = [];
for (const m of md.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
    sections.push({ pos: m.index, title: m[2].trim() });
}
const sectionAt = (pos) =>
    [...sections].reverse().find((s) => s.pos <= pos)?.title ?? '(preamble)';

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

function parse() {
    const out = [];
    for (const m of md.matchAll(/> \*\*Convention\.\*\*([\s\S]*?)(?=\n\n)/g)) {
        const raw = m[1];
        if (raw.includes('The rule itself')) continue; // the sample callout
        const flat = raw.replace(/\n>\s?/g, ' ').replace(/\s+/g, ' ').trim();
        const rule = flat.split('*Why:*')[0].trim();

        const links = [...raw.matchAll(LINK)].map((l) => l[2]);
        const adr = links.find((l) => /adr\/\d+/.test(l)) ?? '';
        // A callout may LINK the procedure, or name a skill in backticks. The bare
        // name is not a path — the first version emitted `[procedure](dead-code-scan)`,
        // which the link checker correctly rejected.
        const skillName = /`\.claude\/skills\/([\w-]+)`/.exec(raw)?.[1];
        const how =
            links.find((l) => /\/sop\/|skills\//.test(l)) ??
            (skillName ? `../../.claude/skills/${skillName}/SKILL.md` : '');

        // What decides whether it holds.
        // Enforcers are not all in `tests/sop/`. Several build-failing suites live beside
        // the code they guard — `responseEnvelope.test.ts` and `realSdkRegistration.test.ts`
        // are both under `tests/features/ai/server/` — and matching only the sop directory
        // rendered those conventions as "*named in prose*", which reads as unenforced when
        // the build fails on them exactly like the others. Any test path counts.
        const enforcers = [
            ...raw.matchAll(/`(tests\/[\w./-]+\.test\.tsx?|\.claude\/hooks\/rules\/[\w.-]+)`/g),
        ].map((e) => e[1]);
        const ledger = /`(\w+)` ledger/.exec(raw)?.[1];
        const other = /eslint/i.test(raw)
            ? 'eslint.config.mjs'
            : /GitGuardian/i.test(raw)
              ? 'GitGuardian'
              : /githooks/.test(raw)
                ? '.githooks/'
                : '';
        const unenforced = /\*\*[Nn]ot enforced/.test(raw);

        out.push({
            section: sectionAt(m.index),
            rule: rule.replace(/\s*\[[^\]]+\]\([^)]+\)\s*·?/g, ' ').replace(/\s+/g, ' ').trim(),
            adr,
            how,
            enforcers,
            ledger: ledger ?? '',
            other,
            unenforced,
        });
    }
    return out;
}

const rows = parse();

/**
 * Every enforcer on disk, so the check can run in both directions.
 *
 * `tests/sop/` is listed separately because it is the set the gap report reasons about
 * — a suite there with no convention naming it is a finding. Enforcers elsewhere are
 * only ever RESOLVED (does the path a convention names exist?), never gap-reported,
 * since `tests/` at large is 1,200 files of ordinary coverage.
 */
const sopSuites = readdirSync(join(ROOT, 'tests/sop'))
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => `tests/sop/${f}`);

const onDisk = new Set([
    ...sopSuites,
    ...readdirSync(join(ROOT, '.claude/hooks/rules'))
        .filter((f) => f.endsWith('.rule'))
        .map((f) => `.claude/hooks/rules/${f}`),
]);

const named = new Set(rows.flatMap((r) => r.enforcers));

// Suites that exist to check the DOCUMENTS rather than the code do not correspond
// to a convention of their own; listing them as gaps would be permanent noise.
const META = new Set([
    'tests/sop/handbook-links.test.ts',
    'tests/sop/doc-module-refs.test.ts',
    'tests/sop/claude-md-handbook-agreement.test.ts',
    'tests/sop/tooling-registry.test.ts',
    'tests/sop/mutation-config-pairing.test.ts',
    'tests/sop/every-scan-declares-a-control.test.ts',
]);

const enforcerWithNoConvention = [...onDisk].filter((e) => !named.has(e) && !META.has(e)).sort();
// Resolve against the FILESYSTEM, not against the sop listing: a convention may name a
// build-failing suite that lives beside the code it guards. Checking membership of the
// sop set instead reported `tests/features/ai/server/responseEnvelope.test.ts` as
// nonexistent while it sat on disk enforcing the rule that named it.
const conventionNamingMissingEnforcer = rows
    .flatMap((r) => r.enforcers)
    .filter((e) => !onDisk.has(e) && !existsSync(join(ROOT, e)));

const stats = {
    total: rows.length,
    enforced: rows.filter((r) => !r.unenforced).length,
    withAdr: rows.filter((r) => r.adr).length,
    withHow: rows.filter((r) => r.how).length,
    complete: rows.filter((r) => r.adr && r.how && !r.unenforced).length,
};

function render() {
    const L = [];
    L.push('# Convention index');
    L.push('');
    L.push('**Generated by `npm run docs:conventions` — do not hand-edit.**');
    L.push('');
    L.push('One row per rule this codebase holds itself to. The handbook states the rule');
    L.push('and explains it for a reader; this table says, for each one, where the');
    L.push('reasoning lives, where the procedure lives, and what decides whether it holds.');
    L.push('');
    L.push('Every hand-written index in this repo has drifted — the ADR table stopped four');
    L.push('rows short, the backlog index hid three items for months, two convention counts');
    L.push('were wrong within an hour of being written. This one is derived from the');
    L.push("handbook's own callouts and checked against the enforcers on disk in both");
    L.push('directions, so it cannot.');
    L.push('');
    L.push(`- **${stats.total}** conventions, **${stats.enforced}** enforced`);
    L.push(`- **${stats.withAdr}** name the decision record behind them`);
    L.push(`- **${stats.withHow}** name a procedure — an SOP or a skill`);
    L.push(`- **${stats.complete}** have all three layers`);
    L.push('');
    L.push('A blank cell is not a defect. Most rules need no decision record, and many need');
    L.push('no procedure beyond the rule itself. A blank ENFORCED column is the one to read:');
    L.push('it means the rule rests on somebody noticing.');
    L.push('');

    let current = null;
    for (const r of rows) {
        if (r.section !== current) {
            current = r.section;
            L.push('');
            L.push(`## ${current}`);
            L.push('');
            L.push('| Rule | Why | How | Enforced by |');
            L.push('|---|---|---|---|');
        }
        const why = r.adr ? `[ADR](${r.adr.replace(/^\.\.\//, '../')})` : '';
        const how = r.how ? `[procedure](${r.how.replace(/^\.\.\//, '../')})` : '';
        const enf = r.unenforced
            ? '**—**'
            : [...r.enforcers.map((e) => `\`${e.split('/').pop()}\``),
               r.ledger ? `\`${r.ledger}\` ledger` : '',
               r.other ? `\`${r.other}\`` : '']
                  .filter(Boolean)
                  .join('<br>') || '*named in prose*';
        L.push(`| ${r.rule.replace(/\|/g, '\\|')} | ${why} | ${how} | ${enf} |`);
    }
    L.push('');
    return L.join('\n');
}

const body = render();
const check = process.argv.includes('--check');

const problems = [];
if (enforcerWithNoConvention.length) {
    problems.push(
        `${enforcerWithNoConvention.length} enforcer(s) check something no convention states:\n` +
            enforcerWithNoConvention.map((e) => `    ${e}`).join('\n')
    );
}
if (conventionNamingMissingEnforcer.length) {
    problems.push(
        `convention names an enforcer that does not exist:\n` +
            conventionNamingMissingEnforcer.map((e) => `    ${e}`).join('\n')
    );
}

if (check) {
    const existing = existsSync(join(ROOT, OUT)) ? readFileSync(join(ROOT, OUT), 'utf8') : '';
    if (existing !== body) problems.push(`${OUT} is out of date — run \`npm run docs:conventions\``);
    if (problems.length) {
        console.error('Convention index check failed:\n');
        for (const p of problems) console.error(`  - ${p}\n`);
        process.exit(1);
    }
    console.log(`Convention index current: ${stats.total} conventions, ${stats.enforced} enforced,`);
    console.log(`${stats.complete} with all three layers.`);
    process.exit(0);
}

writeFileSync(join(ROOT, OUT), body);
console.log(`Wrote ${OUT}`);
console.log(`  ${stats.total} conventions, ${stats.enforced} enforced`);
console.log(`  ${stats.withAdr} name a decision record, ${stats.withHow} name a procedure`);
console.log(`  ${stats.complete} have all three layers`);
for (const p of problems) console.log(`  NOTE: ${p}`);
