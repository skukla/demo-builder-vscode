#!/usr/bin/env node
/**
 * Generate `docs/architecture/adr/README.md` — the index of architectural decisions.
 *
 * GENERATED, deliberately. A hand-maintained index is the exact artefact this repo has
 * already watched rot twice: the backlog README (three items invisible for months) and
 * `src/features/CLAUDE.md`'s barrel paragraph, which asserted that every feature barrel
 * had been deleted while 48 existed and 40 had importers.
 *
 * It reports rather than judges. The one-line summary comes from each ADR's own
 * `**Summary**:` line when present, and falls back to the title, because a generator
 * that invents a summary is a generator that lies confidently.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * `--check` verifies without writing, and FAILS on an unexplained reference.
 *
 * The audit first argued this should report and never gate, on the grounds that a gate
 * would push people to launder a deliberately-removed symbol out of the record. The
 * `## Reference notes` convention removes that pressure: a name that should not resolve
 * gets DECLARED with its reason instead of deleted. With an honest escape hatch, a gate
 * is the right shape — and because it writes nothing, it is safe for `npm run sweep`,
 * which never runs an instrument that mutates tracked files.
 */
const CHECK_ONLY = process.argv.includes('--check');

const DIR = 'docs/architecture/adr';
const tracked = new Set(execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean));

const codeBlob = [...tracked]
    .filter((f) => /\.(ts|tsx|mjs|js|json)$/.test(f))
    .map((f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } })
    .join('\n');

const docs = [...tracked]
    .filter((f) => /\.(ts|tsx|md|mjs|js|json)$/.test(f) && !f.includes('/adr/'))
    .map((f) => { try { return [f, readFileSync(f, 'utf8')]; } catch { return [f, '']; } });

const files = readdirSync(DIR).filter((f) => /^\d{3}-.*\.md$/.test(f)).sort();
const rows = files.map((name) => {
    const s = readFileSync(`${DIR}/${name}`, 'utf8');
    const num = name.slice(0, 3);
    const title = (s.match(/^# (?:ADR-\d+:\s*)?(.+)/m) ?? [, name])[1].trim();
    // Two formats in the wild: `**Status**: x` and `**Status:** x`. Matching only the
    // first reported an em-dash for ADR-015..018, which are the four most active.
    const status = (s.match(/^\*\*Status:?\*\*:?\s+(.+)$/m) ?? [, '—'])[1].trim().replace(/\*/g, '');
    const summary = (s.match(/^\*\*Summary\*\*[:\s]+(.+)$/m) ?? [, ''])[1].trim();
    const re = new RegExp(`ADR[- ]?0*${Number(num)}\\b`);
    const cites = docs.filter(([, body]) => re.test(body));
    const enforcedBy = cites.filter(([f]) => f.startsWith('tests/sop/')).map(([f]) => f.split('/').pop());
    const paths = [...s.matchAll(/`((?:src|tests|scripts|docs|\.claude|\.rptc)\/[\w./-]+\.\w+)`/g)].map((m) => m[1]);
    const syms = [...s.matchAll(/`([a-zA-Z_][A-Za-z0-9_]{4,}(?:\.[A-Za-z0-9_]+)?)`/g)]
        .map((m) => m[1])
        .filter((x) => /[a-z][A-Z]/.test(x));
    // An ADR may DECLARE references that intentionally do not resolve here: the name a
    // decision replaced, a file in the storefront repo, a surface since removed. Those
    // are correct as written — "fixing" ADR-001 to stop saying `externalSystems` would
    // destroy the record. Declared names are reported separately, not as rot.
    // Split on headings rather than regex-to-end-of-file: `\Z` is Python, not
    // JavaScript, so the first attempt matched nothing and the notes' own backticks
    // were then counted AS rot — the check inflating the number it exists to reduce.
    const notesChunk = s
        .split(/\n(?=##[ \t])/)
        .find((chunk) => /^##[ \t]*Reference notes/.test(chunk));
    const declared = new Set(
        notesChunk ? [...notesChunk.matchAll(/`([^`]+)`/g)].map((m) => m[1]) : []
    );
    // Everything inside the notes section is a declaration, never a finding.
    const body = notesChunk ? s.slice(0, s.indexOf(notesChunk)) : s;
    const resolves = (x) => codeBlob.includes(x.includes('.') ? x.split('.').pop() : x);
    const inBody = (x) => body.includes(`\`${x}\``);
    const brokenPaths = [...new Set(paths.filter((p) => !tracked.has(p) && !declared.has(p) && inBody(p)))];
    const brokenSyms = [...new Set(syms.filter((x) => !resolves(x) && !declared.has(x) && inBody(x)))];
    const broken = brokenPaths.length + brokenSyms.length;
    const declaredCount = new Set([
        ...paths.filter((p) => !tracked.has(p) && declared.has(p)),
        ...syms.filter((x) => !resolves(x) && declared.has(x)),
    ]).size;
    return { num, name, title, status, summary, cites: cites.length, enforcedBy, broken, declaredCount, brokenPaths, brokenSyms };
});

const line = (r) =>
    `| [${r.num}](${r.name}) | ${r.summary || r.title} | ${r.status} | ${r.cites} | ` +
    `${r.enforcedBy.length ? '`' + [...new Set(r.enforcedBy)].join('`, `') + '`' : '—'} | ` +
    `${r.broken || '—'} | ${r.declaredCount || '—'} |`;

const out = `# Architectural decisions

**Generated by \`npm run docs:adr-index\` — do not hand-edit.** Rerun it after adding or
changing an ADR.

Every column is measured, not asserted:

- **Cited by** — files outside this directory that name the ADR. A zero here means
  nothing reaches for it; that is a signal about status, not about correctness.
- **Enforced by** — suites in \`tests/sop/\` that mention it. An ADR with an enforcer
  fails the build when the code drifts; one without relies on review.
- **Unexplained** — backticked paths or identifiers that resolve nowhere and are not
  declared. These are the ones worth looking at.
- **Declared** — references the ADR states on purpose in its \`## Reference notes\`
  section: the name a decision replaced, a file owned by another repository, a surface
  since removed. Correct as written. Rewriting ADR-001 to stop naming \`externalSystems\`
  would destroy the very thing it records.

| # | Decision | Status | Cited by | Enforced by | Unexplained | Declared |
|---|---|---|---|---|---|---|
${rows.map(line).join('\n')}

## Status vocabulary

Four words, and only four. Every status line STARTS with one of them; anything after a
dash is detail — when it shipped, what is still pending, which branch carried it.

| Status | Means |
|---|---|
| \`Proposed\` | Written, not yet ratified. Do not build on it. |
| \`Accepted\` | Current law. Cite it, follow it. |
| \`Deprecated\` | No longer followed, with nothing replacing it. |
| \`Superseded by ADR-NNN\` | Replaced; must name its successor. |

This table listed \`Historical\` and \`Deferred\` until 2026-08-30. Both were invented
here, neither was ever used by an ADR, and ADR-001 and ADR-003 had each already been
mislabelled with one and corrected back — each recording, in its own header, that the
vocabulary is the four above. The index that indexes them still disagreed. A decision
that landed and holds is \`Accepted\`; a seam with no implementation is \`Accepted\` too,
and says "implementation deferred" after the dash. Checked now, not asserted.

## Conventions and where each one lives

The question this index exists to answer — *where is the rule for X?*

| Convention | Rule |
|---|---|
| Where a service may be fetched, injected, constructed | ADR-015 § Decision |
| What each kind of file IS (command / handler / service / accessor) | ADR-015 § Responsibility contracts |
| Session accessors — \`getX()\` singletons, and when they are warranted | ADR-020 § Session accessors |
| Cache lifetime — a repeated composition point builds nothing stateful | ADR-020 § A cache is only as useful as |
| Commands extend \`BaseCommand\`; \`src/types/\` is \`import type\` only | [the handbook](../../development/handbook.md) |
| How a service RECEIVES its dependencies (one bundle per feature) | ADR-021 § The dependency ENVELOPE |
| Barrel files — core/types export through them, features are deep-imported | ADR-022 § Barrel files |
| Where a given kind of code goes | \`docs/architecture/where-code-goes.md\` |
| Test tiers, doubles, and how effectiveness is measured | ADR-016 |
| Webview composition, message channel, hooks-as-services | ADR-017 |
| CSS layering and vendoring | ADR-018 |
`;

/**
 * The routing table above is the one part of this file that is WRITTEN rather than
 * measured, and on 2026-08-30 it rotted the same day it was written: the ADR-015 split
 * moved five of its targets to ADR-020/021/022 and the handbook, and the table still
 * pointed at ADR-015 sections that no longer existed. Nothing noticed, because every
 * OTHER column here is derived from the files and this one was prose.
 *
 * So it is checked. Each `ADR-NNN § Section` must name a file that exists and a heading
 * (any level) that starts with that text.
 */
function checkRouting(table) {
    const problems = [];
    const rowRe = /^\| .+ \| (?:\[.*\]\(.*\)|`.*`|ADR-(\d{3})(?: § (.+?))?) \|$/gm;
    let seen = 0;
    for (const m of table.matchAll(rowRe)) {
        const [, num, section] = m;
        if (!num) continue;
        seen++;
        const file = files.find((f) => f.startsWith(num));
        if (!file) {
            problems.push(`ADR-${num} is routed to but no such ADR file exists`);
            continue;
        }
        if (!section) continue;
        const headings = [...readFileSync(`${DIR}/${file}`, 'utf8').matchAll(/^#{2,4} (.+)$/gm)].map(
            (h) => h[1].trim()
        );
        if (!headings.some((h) => h.startsWith(section.trim()))) {
            problems.push(`ADR-${num} has no heading starting "${section.trim()}"`);
        }
    }
    // CONTROL: a table whose rows stopped matching reports zero problems identically to a
    // correct one. Seven ADR-routed rows is the floor; below it, the parser broke.
    if (seen < 7) problems.push(`routing check parsed only ${seen} ADR rows — the regex is broken`);
    return problems;
}

/**
 * Every status line must START with one of the four vocabulary words. Detail after a
 * dash is encouraged — "Accepted — implementation deferred" is the shape ADR-003 uses.
 *
 * Two ADRs had been mislabelled with statuses invented on the spot (`Historical`,
 * `Deferred`), caught and reverted by hand both times; two more read `Implemented`,
 * which is not a status at all. Nothing checked, so the index's own vocabulary table
 * drifted to list terms no ADR used.
 */
const STATUS_WORDS = ['Proposed', 'Accepted', 'Deprecated', 'Superseded'];
const statusProblems = rows
    .filter((r) => !STATUS_WORDS.some((w) => r.status.toLowerCase().startsWith(w.toLowerCase())))
    .map((r) => `ADR-${r.num} status starts "${r.status.split(/[\s—-]/)[0]}" — not one of ${STATUS_WORDS.join('/')}`);
// CONTROL: the four words must actually appear in the vocabulary table this file emits,
// or the check and the documentation have drifted apart in the other direction.
for (const w of STATUS_WORDS) {
    if (!out.includes(`\`${w}`)) statusProblems.push(`vocabulary table does not document \`${w}\``);
}

const routingProblems = checkRouting(out);
if (!CHECK_ONLY) writeFileSync(`${DIR}/README.md`, out);
const stale = rows.reduce((a, r) => a + r.broken, 0);
const declared = rows.reduce((a, r) => a + r.declaredCount, 0);
console.log(
    `ADR index: ${rows.length} decisions, ${stale} unexplained reference(s), ` +
        `${declared} declared, ${routingProblems.length} routing problem(s), ` +
        `${statusProblems.length} status problem(s)`
);
for (const p of statusProblems) {
    console.log(`  status: ${p}`);
    console.log('    -> use one of the four words, and put the detail after a dash');
}
for (const r of rows.filter((x) => x.broken)) {
    console.log(`  ADR-${r.num}: ${[...r.brokenPaths, ...r.brokenSyms].join(', ')}`);
    console.log('    -> fix it, or declare it under `## Reference notes` with the reason');
}
for (const p of routingProblems) {
    console.log(`  routing table: ${p}`);
    console.log('    -> the section moved; point the row at the ADR that holds it now');
}
if (CHECK_ONLY && stale + routingProblems.length + statusProblems.length > 0) process.exit(1);
