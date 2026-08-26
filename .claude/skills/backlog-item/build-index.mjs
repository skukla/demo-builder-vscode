#!/usr/bin/env node
/**
 * Read every backlog item's frontmatter and emit the index table.
 *
 * The index USED to be hand-maintained, and it rotted exactly as you would
 * expect: three items were invisible for months because they were sub-bullets
 * inside another item's prose rather than entries of their own, and a `git
 * checkout` silently reverted a corrected headline back to a disproven one.
 * Generating it means a file on disk cannot be missing from the list.
 *
 *   node .claude/skills/backlog-item/build-index.mjs          # print
 *   node .claude/skills/backlog-item/build-index.mjs --check  # exit 1 on any problem
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.rptc/backlog';
const AREAS = ['ai', 'eds', 'app-builder', 'data-installer', 'prerequisites', 'platform'];
const KINDS = ['question', 'epic', 'feature', 'fix', 'chore'];
const VALUES = ['high', 'med', 'low'];
// The PHASES. `built` is the one people reach for a banner instead of: code has
// landed and nobody has used it. Step 10 sat there on 2026-08-26 and was nearly
// archived as done.
// `spiked` is distinct from `planned`: feasibility is ANSWERED and the build is
// NOT decided. Calling it `planned` would imply an intent to build that nobody
// has formed — `own-the-chat-surface` has sat there since 2026-08-26.
const STATUSES = ['open', 'backlog', 'planned', 'spiked', 'active', 'built',
                  'blocked', 'gated', 'shipped', 'dropped', 'superseded'];
// An epic is not finished because its first child is.
const DONE = new Set(['shipped', 'dropped', 'superseded']);

function files() {
    const out = [];
    for (const e of readdirSync(DIR)) {
        if (e === 'README.md') continue;
        const p = join(DIR, e);
        if (statSync(p).isDirectory()) {
            const o = join(p, 'overview.md');
            try { statSync(o); out.push([`${e}/overview.md`, o]); } catch {}
        } else if (e.endsWith('.md')) out.push([e, p]);
    }
    return out.sort();
}

function frontmatter(text) {
    if (!text.startsWith('---\n')) return null;
    const end = text.indexOf('\n---', 4);
    if (end < 0) return null;
    const fm = {};
    for (const line of text.slice(4, end).split('\n')) {
        const m = line.match(/^([a-z-]+):\s*(.*)$/);
        if (m) fm[m[1]] = m[2].trim();
    }
    return fm;
}

const items = [], problems = [];
for (const [rel, path] of files()) {
    const text = readFileSync(path, 'utf8');
    const fm = frontmatter(text);
    if (!fm) { problems.push(`${rel}: no frontmatter`); continue; }
    const title = (text.split('\n').find((l) => l.startsWith('# ')) || '# (untitled)').slice(2);
    for (const k of ['id', 'kind', 'area', 'value', 'status']) {
        if (!fm[k]) problems.push(`${rel}: missing "${k}"`);
    }
    if (fm.kind && !KINDS.includes(fm.kind)) problems.push(`${rel}: kind "${fm.kind}" is not one of ${KINDS.join('/')}`);
    if (fm.area && !AREAS.includes(fm.area)) problems.push(`${rel}: area "${fm.area}" is not a known area`);
    if (fm.value && !VALUES.includes(fm.value)) problems.push(`${rel}: value "${fm.value}" is not ${VALUES.join('/')}`);
    if (fm.status && !STATUSES.includes(fm.status)) problems.push(`${rel}: status "${fm.status}" is not one of ${STATUSES.join('/')}`);
    if (fm.status === 'superseded' && !fm['superseded-by']) problems.push(`${rel}: status "superseded" requires superseded-by:`);
    items.push({ ...fm, rel, title });
}

const ids = new Set(items.map((i) => i.id));
for (const i of items) {
    if (i.parent && !ids.has(i.parent)) problems.push(`${i.rel}: parent "${i.parent}" does not exist`);
    const needs = (i.needs ?? '[]').replace(/[[\]]/g, '').trim();
    for (const n of needs ? needs.split(/[\s,]+/) : []) {
        if (!ids.has(n)) problems.push(`${i.rel}: needs "${n}" does not exist`);
    }
    if (i['superseded-by'] && !ids.has(i['superseded-by'])) {
        problems.push(`${i.rel}: superseded-by "${i['superseded-by']}" does not exist`);
    }
}

// RULE: an epic is not done while a child is unfinished. This is the AB-1
// failure made impossible — its spine shipped, the file moved to complete/, and
// three unstarted children lost their parent and went invisible for months.
for (const e of items.filter((i) => i.kind === 'epic' && DONE.has(i.status))) {
    const open = items.filter((c) => c.parent === e.id && !DONE.has(c.status));
    if (open.length) {
        problems.push(`${e.rel}: epic is "${e.status}" but ${open.length} child(ren) are not done — ${open.map((c) => c.id).join(', ')}`);
    }
}

if (process.argv.includes('--check')) {
    if (problems.length) { console.error('BACKLOG INDEX PROBLEMS:'); for (const p of problems) console.error('  ' + p); process.exit(1); }
    console.log(`ok — ${items.length} items, all frontmatter valid, all references resolve`);
    process.exit(0);
}

for (const area of AREAS) {
    const inArea = items.filter((i) => i.area === area);
    if (!inArea.length) continue;
    console.log(`\n### ${area}  (${inArea.length})\n`);
    console.log('| ID | Kind | Item | Needs | Value | Status |');
    console.log('|---|---|---|---|---|---|');
    // Sort by the family the item belongs to, then parent before its children,
    // then by id — so `AI-1` heads `AI-1a … AI-1f` in order.
    const family = (i) => i.parent ?? i.id;
    const sorted = inArea.sort((a, b) =>
        family(a).localeCompare(family(b), undefined, { numeric: true }) ||
        (a.parent ? 1 : 0) - (b.parent ? 1 : 0) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }));
    for (const i of sorted) {
        const indent = i.parent ? '└ ' : '';
        const needs = (i.needs ?? '[]').replace(/[[\]]/g, '').trim() || '—';
        console.log(`| \`${i.id}\` | ${i.kind} | ${indent}[${i.title}](${i.rel}) | ${needs} | ${i.value} | ${i.status} |`);
    }
}
if (problems.length) { console.log(`\n<!-- ${problems.length} problem(s); run with --check -->`); }
