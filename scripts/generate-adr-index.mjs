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

| Status | Means |
|---|---|
| \`Accepted\` | Current law. Cite it, follow it. |
| \`Superseded by ADR-NNN\` | Replaced; must name its successor. |
| \`Historical\` | Decision landed and is stable. Kept for provenance, not guidance. |
| \`Deferred\` | A seam documented, no implementation yet. |

## Conventions and where each one lives

The question this index exists to answer — *where is the rule for X?*

| Convention | Rule |
|---|---|
| Where a service may be fetched, injected, constructed | ADR-015 § Decision |
| What each kind of file IS (command / handler / service / accessor) | ADR-015 § Responsibility contracts |
| Session accessors — \`getX()\` singletons, and when they are warranted | ADR-015 § Session accessors |
| Cache lifetime — a repeated composition point builds nothing stateful | ADR-015 § A cache is only as useful as… |
| Commands extend \`BaseCommand\`; \`src/types/\` is \`import type\` only | ADR-015 § Two rules the enforcer checks |
| How a service RECEIVES its dependencies (one bundle per feature) | ADR-015 § The dependency ENVELOPE |
| Barrel files — core/types export through them, features are deep-imported | ADR-015 § Barrel files |
| Where a given kind of code goes | \`docs/architecture/where-code-goes.md\` |
| Test tiers, doubles, and how effectiveness is measured | ADR-016 |
| Webview composition, message channel, hooks-as-services | ADR-017 |
| CSS layering and vendoring | ADR-018 |
`;
if (!CHECK_ONLY) writeFileSync(`${DIR}/README.md`, out);
const stale = rows.reduce((a, r) => a + r.broken, 0);
const declared = rows.reduce((a, r) => a + r.declaredCount, 0);
console.log(
    `ADR index: ${rows.length} decisions, ${stale} unexplained reference(s), ${declared} declared`
);
for (const r of rows.filter((x) => x.broken)) {
    console.log(`  ADR-${r.num}: ${[...r.brokenPaths, ...r.brokenSyms].join(', ')}`);
    console.log('    -> fix it, or declare it under `## Reference notes` with the reason');
}
if (CHECK_ONLY && stale > 0) process.exit(1);
