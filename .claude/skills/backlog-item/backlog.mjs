#!/usr/bin/env node
/**
 * The backlog, as one tool.
 *
 * There used to be two: `build-index.mjs` generated the registry table, and
 * `backlog-view/view.sh` rendered a list for reading. They disagreed, because the
 * view parsed the README's hand-written prose while the generator read the files.
 * On 2026-08-26 the view reported 25 items against a registry of 32 — nineteen
 * items invisible to the thing people used to answer "is this already filed?".
 * That is the same rot the generator was built to end, one section further down
 * the page. So: one tool, one parse, one truth.
 *
 * It also WRITES, which is the point. An agent that can only read the backlog
 * has to hand-craft YAML to file anything, and hand-crafted frontmatter is how
 * fields drift. Every mutation goes through `set`/`log`/`new` so the shape is
 * enforced rather than remembered.
 *
 *   node .claude/skills/backlog-item/backlog.mjs <command>
 *
 *   list [filters]        the registry, grouped by area
 *   next [filters]        what is startable right now — nothing unfinished blocks it
 *   show <id>             one item: frontmatter, blockers, file path
 *   check                 validate everything; exit 1 on any problem
 *   new <slug>            scaffold an item file with valid frontmatter
 *   set <id> k=v ...      change frontmatter fields
 *   log <id> "<text>"     append a dated line to `## Shipped so far`
 *   sync                  rewrite the README's generated spans in place
 *   stale                 advisory: work-in-progress items with nothing recorded
 *   unlogged [--since R]  commits that NAME an item but were never logged to it
 *
 *   filters: --area X --status S --layer L --kind K --value V --grep TERM
 *   output:  --json  (every read command; this is the agent-facing form)
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const DIR = '.rptc/backlog';
const README = join(DIR, 'README.md');

export const AREAS = ['ai', 'eds', 'app-builder', 'data-installer', 'prerequisites', 'platform'];
export const KINDS = ['question', 'epic', 'feature', 'fix', 'chore'];
export const VALUES = ['high', 'med', 'low'];
// The PHASES. `built` is the one people reach for a banner instead of: code has
// landed and nobody has used it. Step 10 sat there on 2026-08-26 and was nearly
// archived as done.
// `spiked` is distinct from `planned`: feasibility is ANSWERED and the build is
// NOT decided. Calling it `planned` would imply an intent nobody has formed.
export const STATUSES = ['open', 'backlog', 'planned', 'spiked', 'active', 'built',
                         'blocked', 'gated', 'shipped', 'dropped', 'superseded'];
// An epic is not finished because its first child is.
export const DONE = new Set(['shipped', 'dropped', 'superseded']);
// Layers A–G: the through-line grouping, orthogonal to `area`. Optional — an item
// outside the agent chain simply has none.
export const LAYERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const LIST_FIELDS = ['needs'];

// ── reading ──────────────────────────────────────────────────────────────────

function itemFiles() {
    const out = [];
    for (const e of readdirSync(DIR)) {
        if (e === 'README.md') continue;
        const p = join(DIR, e);
        if (statSync(p).isDirectory()) {
            const o = join(p, 'overview.md');
            if (existsSync(o)) out.push([`${e}/overview.md`, o]);
        } else if (e.endsWith('.md')) out.push([e, p]);
    }
    return out.sort();
}

/** Split a file into [frontmatterText, rest]. Returns null when there is none. */
function splitFrontmatter(text) {
    if (!text.startsWith('---\n')) return null;
    const end = text.indexOf('\n---', 4);
    if (end < 0) return null;
    return [text.slice(4, end), text.slice(end + 4).replace(/^\n/, '')];
}

function parseFrontmatter(fmText) {
    const fm = {};
    for (const line of fmText.split('\n')) {
        const m = line.match(/^([a-z-]+):\s*(.*)$/);
        if (!m) continue;
        const [, k, raw] = m;
        fm[k] = LIST_FIELDS.includes(k)
            ? raw.replace(/[[\]]/g, '').split(/[\s,]+/).filter(Boolean)
            : raw.trim();
    }
    for (const k of LIST_FIELDS) fm[k] ??= [];
    return fm;
}

export function loadItems() {
    const items = [], problems = [];
    for (const [rel, path] of itemFiles()) {
        const text = readFileSync(path, 'utf8');
        const parts = splitFrontmatter(text);
        if (!parts) { problems.push(`${rel}: no frontmatter`); continue; }
        const fm = parseFrontmatter(parts[0]);
        const title = (text.split('\n').find((l) => l.startsWith('# ')) || '# (untitled)').slice(2);
        // `body` carries the prose after the frontmatter, so validation can reach the
        // `[[PL-12]]` links items use to point at each other. Without it the wiki-link
        // check below is inert — which it was when first written, and which the plant
        // caught rather than the reading.
        items.push({ ...fm, rel, path, title, body: parts[1] });
    }
    return { items, problems };
}

// ── validation ───────────────────────────────────────────────────────────────

export function validate(items, problems = []) {
    const p = [...problems];
    const enumCheck = (i, key, allowed, optional = false) => {
        if (!i[key]) { if (!optional) p.push(`${i.rel}: missing "${key}"`); return; }
        if (!allowed.includes(i[key])) p.push(`${i.rel}: ${key} "${i[key]}" is not one of ${allowed.join('/')}`);
    };
    for (const i of items) {
        if (!i.id) p.push(`${i.rel}: missing "id"`);
        enumCheck(i, 'kind', KINDS);
        enumCheck(i, 'area', AREAS);
        enumCheck(i, 'value', VALUES);
        enumCheck(i, 'status', STATUSES);
        enumCheck(i, 'layer', LAYERS, true);
        if (i.status === 'superseded' && !i['superseded-by']) {
            p.push(`${i.rel}: status "superseded" requires superseded-by:`);
        }
        // `gated`/`blocked` mean waiting on a NAMED thing, so name it. Found by
        // using the tool on 2026-08-26: EDS-5 was gated with an empty `needs`, and
        // "gated by what?" had no answer anywhere a command could reach — the real
        // reason ("field feedback") was a sentence buried mid-file. `needs` only
        // holds item ids, so a wait on something outside the backlog needs its own
        // field. A status that claims a blocker must produce one.
        if ((i.status === 'gated' || i.status === 'blocked') && !i['waiting-on'] && !i.needs.length) {
            p.push(`${i.rel}: status "${i.status}" requires waiting-on: (free text) or a non-empty needs:`);
        }
    }
    const ids = new Set(items.map((i) => i.id).filter(Boolean));
    const dupes = items.map((i) => i.id).filter((id, n, a) => id && a.indexOf(id) !== n);
    for (const d of new Set(dupes)) p.push(`duplicate id "${d}"`);
    for (const i of items) {
        if (i.parent && !ids.has(i.parent)) p.push(`${i.rel}: parent "${i.parent}" does not exist`);
        for (const n of i.needs) if (!ids.has(n)) p.push(`${i.rel}: needs "${n}" does not exist`);
        if (i['superseded-by'] && !ids.has(i['superseded-by'])) {
            p.push(`${i.rel}: superseded-by "${i['superseded-by']}" does not exist`);
        }
        if (i.needs.includes(i.id)) p.push(`${i.rel}: needs itself`);
        // Body `[[PL-12]]` links, which items use to point at each other in prose.
        // These went UNCHECKED while `check` printed "all references resolve" — a
        // message true of two frontmatter fields and of nothing a reader writes.
        // Found 2026-08-30 by planting `[[PL-999]]` and watching it pass. The corpus
        // was clean at the time (27 links, 0 dead), which is the moment to add a
        // check rather than the moment to skip it.
        //
        // Only id-SHAPED targets are validated. `[[some-note]]` is a free link, and
        // the memory corpus deliberately allows one that does not exist yet — it
        // marks something worth writing, not an error.
        for (const m of (i.body ?? '').matchAll(/\[\[([A-Z]+-\d+[a-z]?)\]\]/g)) {
            if (!ids.has(m[1])) p.push(`${i.rel}: [[${m[1]}]] does not exist`);
        }
    }
    // RULE: an epic is not done while a child is unfinished. This is the AB-1
    // failure made impossible — its spine shipped, the file moved to complete/, and
    // three unstarted children lost their parent and went invisible for months.
    for (const e of items.filter((i) => i.kind === 'epic' && DONE.has(i.status))) {
        const open = items.filter((c) => c.parent === e.id && !DONE.has(c.status));
        if (open.length) {
            p.push(`${e.rel}: epic is "${e.status}" but ${open.length} child(ren) are not done — ${open.map((c) => c.id).join(', ')}`);
        }
    }
    return p;
}

// ── selection ────────────────────────────────────────────────────────────────

function applyFilters(items, opt) {
    let out = items;
    for (const k of ['area', 'status', 'layer', 'kind', 'value']) {
        if (opt[k]) out = out.filter((i) => i[k] === opt[k]);
    }
    if (opt.grep) {
        const t = opt.grep.toLowerCase();
        out = out.filter((i) => `${i.id} ${i.title}`.toLowerCase().includes(t));
    }
    return out;
}

/**
 * Startable = you could begin it today.
 *
 * Excluded, each for its own reason:
 * - `shipped`/`dropped`/`superseded` — done.
 * - `open` — a question, which has no "done" and is not work you start.
 * - `blocked`/`gated` — waiting on a NAMED thing. Dogfooding on 2026-08-26 listed
 *   `EDS-5` (gated) as startable, which is the one answer this command must never
 *   give: its whole job is "what can I pick up right now".
 * - anything whose `needs` are unfinished.
 *
 * Epics are kept deliberately. An epic that is `active` is a real place to look,
 * and its children appear on their own rows anyway.
 */
const NOT_STARTABLE = new Set([...DONE, 'open', 'blocked', 'gated']);

export function startable(items) {
    const byId = new Map(items.map((i) => [i.id, i]));
    const waiting = (i) => i.needs.some((n) => byId.has(n) && !DONE.has(byId.get(n).status));
    const rank = { high: 0, med: 1, low: 2 };
    return items
        .filter((i) => !NOT_STARTABLE.has(i.status) && !waiting(i))
        .sort((a, b) => (rank[a.value] ?? 3) - (rank[b.value] ?? 3) ||
                        a.id.localeCompare(b.id, undefined, { numeric: true }));
}

// ── rendering ────────────────────────────────────────────────────────────────

const family = (i) => i.parent ?? i.id;
const byFamily = (a, b) =>
    family(a).localeCompare(family(b), undefined, { numeric: true }) ||
    (a.parent ? 1 : 0) - (b.parent ? 1 : 0) ||
    a.id.localeCompare(b.id, undefined, { numeric: true });

function registryTable(items) {
    const lines = [];
    for (const area of AREAS) {
        const inArea = items.filter((i) => i.area === area);
        if (!inArea.length) continue;
        lines.push(`\n### ${area}  (${inArea.length})\n`);
        lines.push('| ID | Kind | Item | Needs | Value | Status |');
        lines.push('|---|---|---|---|---|---|');
        for (const i of [...inArea].sort(byFamily)) {
            const indent = i.parent ? '└ ' : '';
            // A gated row whose blocker is not another item shows the free-text
            // reason here, so the table answers "waiting on what?" on its own.
            const needs = i.needs.length ? i.needs.join(', ') : (i['waiting-on'] ? `_${i['waiting-on']}_` : '—');
            lines.push(`| \`${i.id}\` | ${i.kind} | ${indent}[${i.title}](${i.rel}) | ${needs} | ${i.value} | ${i.status} |`);
        }
    }
    return lines.join('\n');
}

/** The A–G layer grouping, generated. This used to be 170 lines of hand-written
 *  per-item prose that drifted from the item files it summarized. */
function layerList(items) {
    const lines = [];
    for (const L of LAYERS) {
        const inL = [...items.filter((i) => i.layer === L)].sort(byFamily);
        if (!inL.length) continue;
        lines.push(`\n**${L}** — ${inL.length} item${inL.length > 1 ? 's' : ''}\n`);
        for (const i of inL) {
            lines.push(`- \`${i.id}\` [${i.title}](${i.rel}) — ${i.status}`);
        }
    }
    const none = items.filter((i) => !i.layer);
    if (none.length) lines.push(`\n*${none.length} item(s) sit outside the A–G chain.*`);
    return lines.join('\n');
}

// ── mutation ─────────────────────────────────────────────────────────────────

function writeFrontmatter(item, changes) {
    const text = readFileSync(item.path, 'utf8');
    const parts = splitFrontmatter(text);
    if (!parts) throw new Error(`${item.rel}: no frontmatter to change`);
    let fm = parts[0];
    for (const [k, v] of Object.entries(changes)) {
        // Lists round-trip as `[a, b]`, which is what the reader expects and what every
        // hand-written item already uses.
        const line = `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`;
        fm = new RegExp(`^${k}:.*$`, 'm').test(fm)
            ? fm.replace(new RegExp(`^${k}:.*$`, 'm'), line)
            : `${fm.replace(/\n+$/, '')}\n${line}`;
    }
    writeFileSync(item.path, `---\n${fm}\n---\n${parts[1]}`);
}

function appendShipped(item, text, today) {
    const body = readFileSync(item.path, 'utf8');
    const line = `- ${today}  ${text}`;
    if (body.includes('## Shipped so far')) {
        // Insert at the END of the existing section, not the top — the list reads
        // oldest-first everywhere it already exists.
        const idx = body.indexOf('## Shipped so far');
        const after = body.indexOf('\n## ', idx + 5);
        const cut = after < 0 ? body.length : after;
        const head = body.slice(0, cut).replace(/\n+$/, '');
        writeFileSync(item.path, `${head}\n${line}\n${body.slice(cut)}`);
    } else {
        writeFileSync(item.path, `${body.replace(/\n+$/, '')}\n\n## Shipped so far\n\n${line}\n`);
    }
}

const SCAFFOLD = (id, slug) => `---
id: ${id}
kind: feature
area: ai
needs: []
value: med
status: backlog
---

# ${slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())}

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed ${new Date().toISOString().slice(0, 10)}.
`;

// ── README sync ──────────────────────────────────────────────────────────────

const SPANS = {
    registry: ['<!-- BEGIN GENERATED registry -->', '<!-- END GENERATED registry -->'],
    layers: ['<!-- BEGIN GENERATED layers -->', '<!-- END GENERATED layers -->'],
};

function syncReadme(items) {
    let text = readFileSync(README, 'utf8');
    const rendered = { registry: registryTable(items), layers: layerList(items) };
    const missing = [];
    for (const [name, [open, close]] of Object.entries(SPANS)) {
        const a = text.indexOf(open), b = text.indexOf(close);
        if (a < 0 || b < 0) { missing.push(name); continue; }
        text = `${text.slice(0, a + open.length)}\n${rendered[name]}\n\n${text.slice(b)}`;
    }
    writeFileSync(README, text);
    return missing;
}

// ── cli ──────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
    const opt = {}, pos = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--json') opt.json = true;
        else if (a.startsWith('--')) {
            const key = a.slice(2);
            const v = argv[i + 1];
            // Flags never swallow the next token when it is another flag or absent —
            // the probe-tool bug where `--force '{"json":…}'` ate its own argument.
            if (v === undefined || v.startsWith('--')) { opt[key] = true; }
            else { opt[key] = v; i++; }
        } else pos.push(a);
    }
    return { opt, pos };
}

function die(msg) { console.error(msg); process.exit(1); }

function main() {
    const [cmd, ...rest] = process.argv.slice(2);
    const { opt, pos } = parseArgv(rest);
    const { items, problems } = loadItems();
    const find = (id) => items.find((i) => i.id === id) ?? die(`no item with id "${id}"`);
    const today = new Date().toISOString().slice(0, 10);

    switch (cmd) {
        case 'check': {
            const p = validate(items, problems);
            if (p.length) {
                console.error('BACKLOG PROBLEMS:');
                for (const x of p) console.error('  ' + x);
                process.exit(1);
            }
            console.log(`ok — ${items.length} items, all frontmatter valid, all references resolve`);
            return;
        }
        case 'list': {
            const sel = applyFilters(items, opt);
            if (opt.json) return console.log(JSON.stringify(sel, null, 2));
            console.log(registryTable(sel));
            // The CONTROL line. A backlog with nothing in it and a filter that
            // matched nothing print the same empty table; this tells them apart.
            console.log(`\n  control: ${items.length} items parsed, ${sel.length} shown, ${items.length - sel.length} filtered out`);
            return;
        }
        case 'next': {
            const sel = applyFilters(startable(items), opt);
            if (opt.json) return console.log(JSON.stringify(sel, null, 2));
            for (const i of sel) {
                console.log(`  ${i.value.padEnd(4)} ${i.id.padEnd(6)} ${i.status.padEnd(8)} ${i.title}`);
            }
            console.log(`\n  control: ${items.length} parsed, ${startable(items).length} startable, ${sel.length} shown`);
            return;
        }
        case 'show': {
            const i = find(pos[0]);
            if (opt.json) return console.log(JSON.stringify(i, null, 2));
            const byId = new Map(items.map((x) => [x.id, x]));
            console.log(`${i.id}  ${i.title}`);
            console.log(`  file    ${i.path}`);
            for (const k of ['kind', 'area', 'layer', 'value', 'status', 'parent', 'waiting-on', 'superseded-by']) {
                if (i[k]) console.log(`  ${k.padEnd(7)} ${i[k]}`);
            }
            const kids = items.filter((c) => c.parent === i.id).sort(byFamily);
            if (kids.length) console.log(`  children ${kids.map((c) => `${c.id}(${c.status})`).join(', ')}`);
            if (i.needs.length) {
                console.log('  needs   ' + i.needs.map((n) => {
                    const d = byId.get(n);
                    return `${n}(${d ? d.status : 'MISSING'})${d && !DONE.has(d.status) ? ' <- BLOCKING' : ''}`;
                }).join(', '));
            }
            return;
        }
        case 'new': {
            const rawSlug = pos[0] ?? die('usage: new <slug> [--area X] [--id ID]');
            // Filenames are date-prefixed here, so a slug that already carries
            // one produced `2026-08-26-2026-08-26-foo.md`. Every filed item
            // starts with its date, which makes pasting one in the obvious
            // mistake — strip it rather than emit a name nobody wants.
            const slug = rawSlug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
            const rel = `${today}-${slug}.md`;
            const path = join(DIR, rel);
            if (existsSync(path)) die(`${rel} already exists`);
            const id = opt.id ?? die('pass --id (e.g. --id AI-5); ids are chosen, not guessed');
            if (items.some((i) => i.id === id)) die(`id "${id}" is already taken`);
            let body = SCAFFOLD(id, slug);
            if (opt.area) body = body.replace(/^area: .*$/m, `area: ${opt.area}`);
            writeFileSync(path, body);
            console.log(`created ${path}`);
            console.log('now write the body, then: backlog.mjs check && backlog.mjs sync');
            return;
        }
        case 'set': {
            const i = find(pos[0]);
            const changes = {};
            for (const kv of pos.slice(1)) {
                const m = kv.match(/^([a-z-]+)=(.*)$/);
                if (!m) die(`bad assignment "${kv}" — expected key=value`);
                // A LIST field has to become an ARRAY here, the same way reading a file
                // parses it. It used to be stored as the raw string, and then `validate`
                // iterated that string CHARACTER BY CHARACTER: `needs=PL-11` reported
                // `needs "1" does not exist`, because it was checking the letter. The
                // refusal was correct and its reason was nonsense, which is worse than
                // failing outright — it reads as a syntax you have to guess at.
                changes[m[1]] = LIST_FIELDS.includes(m[1])
                    ? m[2].replace(/[[\]]/g, '').split(/[\s,]+/).filter(Boolean)
                    : m[2];
            }
            if (!Object.keys(changes).length) die('nothing to set');
            // Validate the RESULT BEFORE writing it. The first version wrote first
            // and validated after, so a rejected `status=nonsense` still landed on
            // disk and exit 1 left the backlog broken — dogfooding found it by
            // running the failure cases and then watching `check` go red.
            const proposed = items.map((x) => (x.id === i.id ? { ...x, ...changes } : x));
            const after = validate(proposed, problems);
            if (after.length) {
                console.error(`refusing to set ${i.id} — that would leave the backlog invalid:`);
                for (const x of after) console.error('  ' + x);
                process.exit(1);
            }
            writeFrontmatter(i, changes);
            console.log(`${i.id}: ${Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(' ')}`);
            return;
        }
        case 'log': {
            const i = find(pos[0]);
            const text = pos.slice(1).join(' ') || die('usage: log <id> "<what landed>"');
            appendShipped(i, text, today);
            console.log(`${i.id}: logged "${text}"`);
            return;
        }
        case 'stale': {
            // Advisory, never a gate. An item that has been `active` or `built` for
            // a while with NOTHING in its `## Shipped so far` is the shape of work
            // that landed while the record stood still.
            //
            // Epics are excluded, and that exclusion is the whole reason this is not
            // part of `check`: an epic is `active` because a CHILD is active, and it
            // ships nothing itself. Measured 2026-08-26 — all three unlogged items
            // were epics, so without this the check would have been 100% false
            // positives on its first run.
            const WIP = new Set(['active', 'built']);
            const unlogged = items.filter((i) =>
                WIP.has(i.status) && i.kind !== 'epic' &&
                !readFileSync(i.path, 'utf8').includes('## Shipped so far'));
            if (opt.json) return console.log(JSON.stringify(unlogged, null, 2));
            for (const i of unlogged) {
                console.log(`  ${i.id.padEnd(6)} ${i.status.padEnd(7)} ${i.title}`);
            }
            const wip = items.filter((i) => WIP.has(i.status) && i.kind !== 'epic').length;
            console.log(`\n  ${unlogged.length} of ${wip} work-in-progress item(s) have nothing recorded` +
                        `\n  control: ${items.length} parsed, ${items.filter((i) => WIP.has(i.status)).length} in a working state, ` +
                        `${items.filter((i) => WIP.has(i.status) && i.kind === 'epic').length} epic(s) excluded`);
            return;
        }
        case 'unlogged': {
            // Closes the loop RPTC leaves open. A commit says which item it belongs
            // to with a `Backlog: <id>` trailer; this finds the ones whose sha never
            // made it into that item's `## Shipped so far`.
            //
            // Opt-in by design: most commits belong to no item (a lint sweep, the
            // tooling itself), so requiring a trailer everywhere would train people
            // to write a meaningless one. The cost of opt-in is stated plainly in the
            // skill — a commit with NO trailer is invisible here, so this catches
            // "named it and forgot to log", not "forgot entirely".
            const range = opt.since ? `${opt.since}..HEAD` : '-40';
            let raw;
            try {
                raw = execFileSync('git', ['log', range, '--format=%H%x1f%ad%x1f%B%x1e', '--date=short'], { encoding: 'utf8' });
            } catch {
                die('git log failed — run this inside the repository');
            }
            const commits = raw.split('\x1e').map((c) => c.trim()).filter(Boolean).map((c) => {
                const [sha, date, body] = c.split('\x1f');
                const ids = [...body.matchAll(/^Backlog:\s*(.+)$/gm)]
                    .flatMap((m) => m[1].split(/[\s,]+/))
                    // `none` is a first-class answer, not an id. The commit-msg hook
                    // accepts it for the many commits that belong to no item; treating
                    // it as an id made every such commit an unresolvable "REFUSED" and
                    // meant `unlogged` could never exit 0 on this repository.
                    .filter((x) => x && x.toLowerCase() !== 'none');
                return { sha, date, subject: body.trim().split('\n')[0], ids };
            });
            // A commit whose whole job is writing a log line carries the trailer too
            // (the hook requires one), so the next run logged the log commit, whose log
            // commit was logged next — nine such lines had to be hand-pruned from one
            // item on 2026-09-03. The record is for work, not for the record.
            const tagged = commits.filter((c) => c.ids.length && !/^docs\(backlog\): log /.test(c.subject));
            const byId = new Map(items.map((i) => [i.id, i]));
            const missing = [];
            for (const c of tagged) {
                for (const id of c.ids) {
                    const item = byId.get(id);
                    if (!item) { missing.push({ ...c, id, why: 'no such item' }); continue; }
                    // A log line cites the short sha; match on a prefix so either form works.
                    if (!readFileSync(item.path, 'utf8').includes(c.sha.slice(0, 7))) {
                        missing.push({ ...c, id, why: 'not in its Shipped so far' });
                    }
                }
            }
            if (opt.json) return console.log(JSON.stringify(missing, null, 2));

            // --write turns the report into the fix. The sha and the subject are
            // already here, so there is nothing for a human to type — and a step
            // nobody has to remember is a step nobody forgets. Eight commits landed
            // unlogged on 2026-08-26 before anyone noticed.
            //
            // It refuses the two cases it cannot get right on its own: an id that
            // does not exist (a typo in the trailer — writing it somewhere would be
            // worse than reporting it), and a finished item (logging into something
            // shipped is a decision, not bookkeeping).
            if (opt.write) {
                let wrote = 0;
                const refused = [];
                for (const m of missing) {
                    const item = byId.get(m.id);
                    if (!item) { refused.push(`${m.id} — no such item`); continue; }
                    if (DONE.has(item.status)) { refused.push(`${m.id} — is "${item.status}"`); continue; }
                    appendShipped(item, `${m.subject} (\`${m.sha.slice(0, 9)}\`)`, m.date);
                    // Evidence of work is evidence it started — but FILING an item is
                    // not starting it. A commit that touches only `.rptc/` is
                    // bookkeeping: the record moving, not the work. Both sign-in
                    // items were flipped to `active` on 2026-08-26 by the very
                    // commit that created them, which is a lie the next reader has
                    // no way to spot.
                    const touchedCode = (() => {
                        try {
                            const files = execFileSync('git', ['show', '--name-only', '--format=', m.sha],
                                { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
                            return files.some((f) => !f.startsWith('.rptc/'));
                        } catch { return true; }   // unknown: do not silently skip the flip
                    })();
                    if (touchedCode && (item.status === 'backlog' || item.status === 'planned')) {
                        writeFrontmatter(item, { status: 'active' });
                        console.log(`  ${m.id}: ${item.status} -> active`);
                        // Keep the in-memory copy in step, or an item named by three
                        // commits announces the same flip three times.
                        item.status = 'active';
                    }
                    console.log(`  ${m.id}: logged ${m.sha.slice(0, 9)}`);
                    wrote++;
                }
                for (const r of refused) console.log(`  REFUSED ${r}`);
                const after = validate(loadItems().items, loadItems().problems);
                if (after.length) {
                    console.error('\nthis left the backlog invalid:');
                    for (const x of after) console.error('  ' + x);
                    process.exitCode = 1;
                    return;
                }
                console.log(`\n  ${wrote} logged, ${refused.length} refused` +
                            `\n  control: ${commits.length} commit(s) scanned, ${tagged.length} carried a trailer`);
                process.exitCode = refused.length ? 1 : 0;
                return;
            }

            for (const m of missing) {
                console.log(`  ${m.sha.slice(0, 9)}  ${m.id.padEnd(6)} ${m.why.padEnd(24)} ${m.subject.slice(0, 60)}`);
            }
            if (missing.length) console.log('\n  run with --write to record these automatically');
            // The control matters more here than anywhere else: "0 unlogged" and
            // "0 commits carried a trailer" are the same output and opposite facts.
            console.log(`\n  ${missing.length} unlogged` +
                        `\n  control: ${commits.length} commit(s) scanned, ${tagged.length} carried a Backlog: trailer`);
            if (tagged.length === 0 && commits.length > 0) {
                console.log('  NOTE: nothing carried a trailer, so this proves nothing about the record.');
            }
            // `process.exit()` TRUNCATES stdout when it is a pipe — Node's writes to a
            // pipe are async, and exiting drops what has not flushed. It works when
            // you run it by hand (a TTY writes synchronously) and silently loses the
            // report the moment anything reads it, which is how the harness caught it:
            // the exit code was right and the output was gone.
            process.exitCode = missing.length ? 1 : 0;
            return;
        }
        case 'sync': {
            const p = validate(items, problems);
            if (p.length) {
                console.error('refusing to sync an invalid backlog:');
                for (const x of p) console.error('  ' + x);
                process.exit(1);
            }
            const missing = syncReadme(items);
            if (missing.length) die(`README is missing generated span(s): ${missing.join(', ')}`);
            console.log(`synced README — ${items.length} items`);
            return;
        }
        default:
            console.log(readFileSync(new URL(import.meta.url)).toString()
                .match(/^ \*(.*)$/gm).map((l) => l.slice(2)).join('\n').split('\n')
                .slice(0, 40).join('\n'));
            process.exit(cmd ? 1 : 0);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
