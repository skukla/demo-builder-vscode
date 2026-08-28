#!/usr/bin/env node
/**
 * Find gaps in our own agent surface, from what agents ACTUALLY did.
 *
 *   node .claude/skills/agent-gap-scan/scan.mjs [--json] [--write] [--all-projects]
 *
 * The sibling of `ai-coverage-scan`, and its opposite. That one is STATIC: it
 * computes handlers with no MCP tool — the surface being too small on paper.
 * This one is BEHAVIOURAL: it reads what agents did in real sessions and finds
 * where the surface failed them in practice. A tool can exist, be reachable, and
 * still never be used because nobody knows it is there.
 *
 * Source is Claude Code's own transcripts (`~/.claude/projects/**\/*.jsonl`).
 * They are already on disk, already complete, and already historical — no
 * instrumentation, nothing running. Two hand passes over them (2026-08-25 and
 * 2026-08-26) each found a real gap in under an afternoon; the second found two
 * in minutes. This is that pass, automated.
 *
 * ## Three shapes, per `AI-1c`
 *
 *   1. A tool nobody calls.
 *   2. A job agents do WITHOUT us — reaching for Bash where a tool should exist.
 *      The strongest signal on the page, and the one nothing looked for before.
 *   3. A tool that is called and fails.
 *
 * ## Two things that make the numbers wrong if you skip them
 *
 * **Scope to demo projects.** Most transcripts are this repo developing ITSELF,
 * where reaching for Bash is correct and means nothing. Only sessions inside
 * `~/.demo-builder/projects/` show an agent using the product. Mixing them is
 * how the first hand pass over-counted. `--all-projects` disables the scoping
 * and is for debugging the scanner, not for reading results.
 *
 * **Most `is_error` results are NOT tool failures.** Measured 2026-08-26: the
 * bulk are "The user doesn't want to proceed", auto-mode classifier denials, and
 * "model temporarily unavailable". Those say nothing about our surface. Shape 3
 * counts only errors that came back from OUR tools and are not one of those.
 */
import { readFileSync, readdirSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';

const PROJECTS = join(homedir(), '.claude', 'projects');
const DEMO_MARKER = 'demo-builder-projects';
const OUR_PREFIX = 'mcp__demo-builder__';

/** `mcp__demo-builder__get_project` → `get_project`; anything else unchanged. */
function bare(name) {
    return String(name || '').startsWith(OUR_PREFIX) ? String(name).slice(OUR_PREFIX.length) : String(name || '');
}

// Bash verbs that indicate a job the EXTENSION should be doing. Everything else
// (cat, grep, ls, git) is ordinary work and is reported separately, uncounted —
// the point is to notice `curl` against the project's own backend, not to
// complain that an agent read a file.
const OUR_JOBS = {
    curl: 'HTTP against a project endpoint — we own the endpoints and the headers',
    aio: 'Adobe I/O CLI — we own org/project/workspace context and the mesh',
    wget: 'HTTP against a project endpoint',
};

// Error text that is about the HARNESS, not about our tool. See the file note.
const NOT_OUR_FAULT = [
    /user doesn't want to proceed/i,
    /tool use was rejected/i,
    /temporarily unavailable/i,
    /Permission for this action was denied/i,
    /auto mode/i,
    /operation was aborted/i,
    /interrupted by user/i,
];

const argv = process.argv.slice(2);
function flagValue(name) {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    // A flag never swallows the next flag, and `--since` with nothing after it
    // is an error rather than a silent no-op that reports the whole corpus.
    if (v === undefined || v.startsWith('--')) {
        console.error(`${name} needs a value, e.g. ${name} 2026-08-25`);
        process.exit(2);
    }
    return v;
}

/** Like `flagValue`, but the flag itself is optional; only its VALUE is required. */
function flagValue2(name) {
    return argv.includes(name) ? flagValue(name) : undefined;
}

const opt = {
    json: argv.includes('--json'),
    write: argv.includes('--write'),
    allProjects: argv.includes('--all-projects'),
    since: flagValue('--since'),
    until: flagValue('--until'),
    // Journey mode: one session, read IN ORDER, with each of our calls paired to
    // what it answered and what the agent did next. The aggregate above says
    // which tools go unused; this says whether the used ones are any good.
    session: flagValue2('--session'),
};

/** Every transcript, optionally scoped to demo-project sessions. */
function transcripts() {
    const out = [];
    const walk = (dir) => {
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.jsonl')) out.push(p);
        }
    };
    walk(PROJECTS);
    return opt.allProjects ? out : out.filter((f) => f.includes(DEMO_MARKER));
}

/** The tool names our extension actually ships, read from source. */
function ourToolNames() {
    const names = new Set();
    const roots = ['src/features/ai/server', 'src/mcp-server.ts'];
    const readAll = (p) => {
        if (!existsSync(p)) return;
        if (statSync(p).isDirectory()) {
            for (const e of readdirSync(p)) readAll(join(p, e));
            return;
        }
        if (!p.endsWith('.ts')) return;
        const s = readFileSync(p, 'utf8');
        for (const re of [/tool:\s*['"]([a-z0-9_]+)['"]/g,
                          /registerTool\(\s*['"]([a-z0-9_]+)['"]/g,
                          /server\.tool\(\s*['"]([a-z0-9_]+)['"]/g]) {
            for (const m of s.matchAll(re)) names.add(m[1]);
        }
    };
    roots.forEach(readAll);
    return names;
}

/**
 * The battery's own prompts, read from disk.
 *
 * A battery run is `claude -p <prompt>` inside `~/.demo-builder/projects`, so its
 * transcript lands in the very directory this scan reads as REAL WORK. Left in,
 * the measurement feeds its own evidence: on 2026-08-26 `run_commerce_query`
 * showed "17 calls in real work" and all seventeen were battery runs of a tool
 * that had shipped that same day.
 *
 * The first user message of a battery session is the prompt VERBATIM, so they can
 * be excluded exactly rather than guessed at. A producer typing one of these word
 * for word would be excluded too; the control line reports the count so that is
 * visible rather than silent.
 */
function batteryPrompts() {
    const f = '.rptc/plans/evaluation-mode/battery/prompts.json';
    if (!existsSync(f)) return new Set();
    try {
        return new Set(JSON.parse(readFileSync(f, 'utf8')).map((p) => String(p.prompt).trim()));
    } catch {
        return new Set();
    }
}

/** The first thing the human said, or null if nothing was said. */
function firstUserText(file) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let d;
        try { d = JSON.parse(line); } catch { continue; }
        if (d.type !== 'user') continue;
        const c = (d.message || {}).content;
        if (typeof c === 'string') return c.trim();
        if (Array.isArray(c)) {
            const t = c.find((x) => x && x.type === 'text');
            if (t?.text) return String(t.text).trim();
        }
    }
    return null;
}

/** Walk one transcript, pulling every tool call and its result. */
/** Text a person actually typed, or '' for a tool result / command marker. */
function humanText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    if (content.some((c) => c && c.type === 'tool_result')) return '';
    return content.map((c) => (c && c.type === 'text' ? c.text || '' : '')).join(' ').trim();
}

const COMMAND_MARKER = /^<(local-command|command-name|command-message|command-args)/;

function isHumanTurn(content) {
    const t = humanText(content);
    return t.length > 0 && !COMMAND_MARKER.test(t);
}

function readSession(file) {
    const calls = [];
    const events = [];
    const results = new Map();
    let userTurns = 0;
    let day = null;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let d;
        try { d = JSON.parse(line); } catch { continue; }
        const content = (d.message || {}).content;
        // A tool_result arrives as a `type:'user'` line, so counting those as user
        // turns triples the number: the 264-turn ERP session is 171 results, and
        // of the remaining 93 many are `/clear` markers and local-command caveats
        // rather than anything a person typed. Count only what a human wrote.
        if (d.type === 'user' && isHumanTurn(content)) {
            userTurns++;
            events.push({ kind: 'user', text: humanText(content).slice(0, 200) });
        }
        // Timestamps are per-line and monotonic, so the last one seen before a
        // call is that call's date. WITHOUT this the scan has no time axis, and a
        // gap closed in August reports identically to one from June — which is
        // exactly how its first run presented 24 June `curl` calls as a live
        // finding, alongside 19 `get_current_project` calls made on the very day
        // their fix shipped.
        if (d.timestamp) day = String(d.timestamp).slice(0, 10);
        if (!Array.isArray(content)) continue;
        for (const c of content) {
            if (!c || typeof c !== 'object') continue;
            if (c.type === 'tool_use') {
                calls.push({ id: c.id, name: c.name || '', input: c.input || {}, day });
                events.push({ kind: 'call', id: c.id, name: c.name || '' });
            } else if (c.type === 'tool_result') {
                let txt = c.content;
                if (Array.isArray(txt)) txt = txt.map((x) => (x && x.text) || '').join(' ');
                results.set(c.tool_use_id, { isError: !!c.is_error, text: String(txt || '') });
            }
        }
    }
    return { file, calls, events, results, userTurns, day };
}

/** The leading binary of each segment of a shell command. */
function verbsIn(command) {
    const found = [];
    for (const seg of String(command).split(/[|;&\n]+/)) {
        const s = seg.trim().replace(/^\(+/, '');
        if (!s) continue;
        // Skip a leading `cd X &&`, an assignment, or `for x in ...; do`.
        const m = s.match(/^(?:cd\s+\S+\s*)?(?:[A-Z_][A-Z0-9_]*=\S*\s+)*([A-Za-z0-9_./-]+)/);
        if (m) found.push(basename(m[1]));
    }
    return found;
}

const files = transcripts();
const ours = ourToolNames();
/** tool → (what was called next → count). See the loop below for why. */
const followedBy = new Map();

// ─── Journey mode ────────────────────────────────────────────────────────────

/** An error the tool answered as PROSE while leaving `is_error` unset. */
const PROSE_ERROR = /(sign-?in required|not signed in|no current project|unauthori[sz]ed|failed to|could not|unable to|does not exist|not found)/i;

/**
 * Read ONE session in order and pair each of our calls with what it answered and
 * what the agent did next.
 *
 * The aggregate scan above answers "which tools go unused". It cannot answer
 * "are the used ones any good", because that question is about a response and
 * its consequence, and both are only meaningful in sequence. The first three
 * calls of the 264-turn ERP session are `get_current_project` (104 bytes: a name
 * and a path), then `get_project` (1.3 KB: the manifest), then `list_projects` —
 * three orientation calls back to back, which reads as one tool answering less
 * than the next step needs.
 *
 * FLAGS ARE LEADS, NOT VERDICTS. Each says what happened, not that it was wrong:
 * a repeat after forty turns is an agent re-orienting correctly, and the same
 * repeat three calls later is us failing to make an answer stick. The distance
 * is printed so a human can tell those apart.
 */
function journey(sessionId) {
    const file = files.find((f) => basename(f).startsWith(sessionId));
    if (!file) {
        console.error(`No transcript starts with "${sessionId}" in ${opt.allProjects ? 'all projects' : 'demo projects'}.`);
        process.exit(2);
    }
    const { calls, events, results, userTurns } = readSession(file);
    const ourIdx = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.kind === 'call' && ours.has(bare(e.name)));

    const rows = ourIdx.map(({ e, i }, n) => {
        const call = calls.find((c) => c.id === e.id) || {};
        const res = results.get(e.id) || { isError: false, text: '' };
        const tool = bare(e.name);
        const next = events[i + 1] || null;
        const flags = [];
        if (res.isError) flags.push('ERROR');
        else if (PROSE_ERROR.test(res.text.slice(0, 400))) flags.push('PROSE-ERROR');
        if (next && next.kind === 'user') flags.push('USER-SPOKE-NEXT');
        if (next && next.kind === 'call' && /__Bash$|^Bash$/.test(next.name)) flags.push('→BASH');
        // A repeat, and HOW FAR AWAY — near is a stickiness problem, far is not.
        const later = ourIdx.slice(n + 1).find(({ e: o }) => bare(o.name) === tool);
        if (later) {
            const gap = later.i - i;
            flags.push(`REPEAT+${gap}`);
        }
        return {
            n: n + 1, tool, bytes: res.text.length,
            args: Object.keys(call.input || {}),
            next: next ? (next.kind === 'user' ? 'you' : bare(next.name)) : '(end)',
            flags,
            preview: res.text.slice(0, 160).replace(/\s+/g, ' '),
        };
    });

    // ── The four journey metrics (AI-1d). LEADS, not verdicts — each names what
    // happened in the arc; only reading the rows says whether it was waste. ──
    const readLike = (t) => /^(get|list|check|find|verify|read|describe|show|inspect)_/.test(t);
    // 1. Turns to first ACTION — how far in before the journey did anything
    //    (first call to a non-read tool of ours). Null: the journey was all reads.
    const firstAction = rows.find((r) => !readLike(r.tool)) || null;
    // 2. Re-orientation — repeat calls to read-like tools. The repeat is the
    //    signal ("re-asked what it already knew"); distance tells near from far.
    const seenReads = new Set();
    let reorientations = 0;
    for (const r of rows.filter((x) => readLike(x.tool))) {
        if (seenReads.has(r.tool)) reorientations++;
        else seenReads.add(r.tool);
    }
    // 3. Bash moments, by arc third — early is a discovery gap, late a capability
    //    gap (the item's framing). Buckets over ALL events so the arc is real time.
    const bashIdx = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.kind === 'call' && /__Bash$|^Bash$/.test(e.name))
        .map(({ i }) => i);
    const third = (i) => (i < events.length / 3 ? 'early' : i < (2 * events.length) / 3 ? 'mid' : 'late');
    const bashArc = { early: 0, mid: 0, late: 0 };
    for (const i of bashIdx) bashArc[third(i)]++;
    // 4. Interventions — the user spoke right after one of our calls answered.
    //    The clearest available marker of the agent being off the path.
    const interventions = rows.filter((r) => r.flags.includes('USER-SPOKE-NEXT')).length;
    const metrics = {
        turnsToFirstAction: firstAction
            ? { callNumber: firstAction.n, tool: firstAction.tool }
            : null,
        reorientations,
        bash: { total: bashIdx.length, ...bashArc },
        interventions,
    };

    if (opt.json) {
        console.log(JSON.stringify({ session: basename(file), userTurns,
            totalCalls: calls.length, ourCalls: rows.length, metrics, rows }, null, 2));
        return;
    }
    const L = [];
    L.push(`# Journey — ${basename(file)}\n`);
    L.push(`**${userTurns}** turns you actually typed · **${calls.length}** tool calls, ` +
           `**${rows.length}** of them ours.\n`);
    L.push('## Journey metrics (leads, not verdicts)\n');
    L.push(`- **First action**: ${firstAction
        ? `call #${firstAction.n} (\`${firstAction.tool}\`) — everything before it was reads`
        : 'never — every one of our calls was a read'}`);
    L.push(`- **Re-orientations**: ${reorientations} repeat read${reorientations === 1 ? '' : 's'} ` +
           '(a read-like tool asked again; near repeats mean the answer did not stick)');
    L.push(`- **Bash moments**: ${bashIdx.length} total — ${bashArc.early} early / ${bashArc.mid} mid / ` +
           `${bashArc.late} late (early = discovery gap, late = capability gap)`);
    L.push(`- **Interventions**: ${interventions} — the user spoke immediately after one of our calls\n`);
    if (!rows.length) {
        L.push('_This session never called a Demo Builder tool._\n');
        console.log(L.join('\n'));
        return;
    }
    L.push('| # | tool | args | bytes | next | flags |');
    L.push('|---|---|---|---|---|---|');
    for (const r of rows) {
        L.push(`| ${r.n} | \`${r.tool}\` | ${r.args.join(', ') || '—'} | ${r.bytes} | ` +
               `${r.next} | ${r.flags.join(' ') || ''} |`);
    }
    L.push('\n## What each call answered\n');
    for (const r of rows) {
        L.push(`**${r.n}. ${r.tool}** → ${r.bytes} bytes${r.flags.length ? ` · ${r.flags.join(' ')}` : ''}`);
        L.push('```');
        L.push(r.preview || '(empty)');
        L.push('```\n');
    }
    L.push('> Flags are LEADS. `REPEAT+n` is n events later — near means the answer ' +
           'did not stick, far means the agent re-oriented, and only reading tells you which.');
    console.log(L.join('\n'));
}

if (opt.session) {
    journey(opt.session);
    process.exit(0);
}
// A scanner that finds no tools reports "nothing is used" and looks like a
// devastating finding. It is a broken scanner. Same guard ai-coverage-scan uses.
if (ours.size === 0) {
    console.error('ABORT: found 0 tool names in src/ — the tool scan is broken, not the surface.');
    process.exit(2);
}

const called = new Map();         // tool -> count
const bashVerbs = new Map();      // verb -> {count, samples[]}
const failures = [];              // our tools that genuinely errored
let totalCalls = 0, bashCalls = 0, sessions = 0, userTurns = 0, skippedByWindow = 0;
let firstDay = null, lastDay = null;
const dayOf = new Map();   // tool -> {first, last}
const verbDays = new Map(); // verb -> Set(day)

const BATTERY_PROMPTS = batteryPrompts();
let batterySessions = 0;

for (const f of files) {
    // Exclude the battery's own runs BEFORE anything is counted.
    if (BATTERY_PROMPTS.size) {
        const first = firstUserText(f);
        if (first && BATTERY_PROMPTS.has(first)) { batterySessions++; continue; }
    }
    const s = readSession(f);
    if (!s.calls.length) continue;
    sessions++;
    userTurns += s.userTurns;
    // WHAT EACH OF OUR READS IS A PREAMBLE TO.
    //
    // A read that is almost always followed by another read is answering less
    // than the next step needs — a shape problem, invisible to any count of how
    // often it is called. `get_current_project` returns a name and a path in
    // ~100 bytes, and 27 of its 32 calls are followed immediately by another
    // Demo Builder read; the commonest is `get_project_urls`, not the manifest.
    // Reading ONE session suggested the wrong pairing, which is why this is
    // computed over the corpus.
    for (let i = 0; i < s.calls.length; i++) {
        const c = s.calls[i];
        if (!c.name.startsWith(OUR_PREFIX)) continue;
        if (opt.since && (!c.day || c.day < opt.since)) continue;
        if (opt.until && (!c.day || c.day > opt.until)) continue;
        const from = bare(c.name);
        const nxt = s.calls[i + 1];
        const to = nxt ? bare(nxt.name) : '(nothing)';
        if (!followedBy.has(from)) followedBy.set(from, new Map());
        const m = followedBy.get(from);
        m.set(to, (m.get(to) || 0) + 1);
    }
    for (const c of s.calls) {
        // A call with no timestamp cannot be placed in time. It is COUNTED when
        // no window is asked for, and EXCLUDED when one is — silently keeping it
        // would let undateable calls leak into every window and make two windows
        // look more alike than they are.
        if (opt.since && (!c.day || c.day < opt.since)) { skippedByWindow++; continue; }
        if (opt.until && (!c.day || c.day > opt.until)) { skippedByWindow++; continue; }
        if (c.day) { if (!firstDay || c.day < firstDay) firstDay = c.day;
                     if (!lastDay || c.day > lastDay) lastDay = c.day; }
        totalCalls++;
        const bare = c.name.startsWith(OUR_PREFIX) ? c.name.slice(OUR_PREFIX.length) : c.name;
        called.set(bare, (called.get(bare) || 0) + 1);
        if (c.day) {
            const e = dayOf.get(bare) || { first: c.day, last: c.day };
            if (c.day < e.first) e.first = c.day;
            if (c.day > e.last) e.last = c.day;
            dayOf.set(bare, e);
        }

        if (c.name === 'Bash') {
            bashCalls++;
            const cmd = c.input.command || '';
            for (const v of new Set(verbsIn(cmd))) {
                const e = bashVerbs.get(v) || { count: 0, samples: [] };
                e.count++;
                if (c.day) {
                    if (!verbDays.has(v)) verbDays.set(v, new Set());
                    verbDays.get(v).add(c.day);
                }
                if (OUR_JOBS[v] && e.samples.length < 6) {
                    e.samples.push(cmd.replace(/\s+/g, ' ').slice(0, 130));
                }
                bashVerbs.set(v, e);
            }
        }

        if (c.name.startsWith(OUR_PREFIX)) {
            const r = s.results.get(c.id);
            if (r && r.isError && !NOT_OUR_FAULT.some((re) => re.test(r.text))) {
                failures.push({ tool: bare, text: r.text.replace(/\s+/g, ' ').slice(0, 120) });
            }
        }
    }
}

const neverCalled = [...ours].filter((t) => !called.has(t)).sort();
const gapVerbs = Object.keys(OUR_JOBS)
    .filter((v) => bashVerbs.has(v))
    .map((v) => {
        const days = [...(verbDays.get(v) || [])].sort();
        return { verb: v, why: OUR_JOBS[v], ...bashVerbs.get(v),
                 firstSeen: days[0] || null, lastSeen: days[days.length - 1] || null,
                 byDay: days.map((d) => ({ day: d })) };
    })
    .sort((a, b) => b.count - a.count);
const ourCalls = [...called].filter(([t]) => ours.has(t)).sort((a, b) => b[1] - a[1]);

// The ORIENTATION SHARE. `AI-1b` established by hand that 77% of all calls are
// six reads that just re-establish where the agent is. It is the headline number
// for "is the surface being used to DO anything", so the scan computes it rather
// than leaving it to be re-derived. Not a fixed list: whatever the top six reads
// are, that is what orientation costs today.
const READ_LIKE = /^(get|list|check|find|verify|read|describe|show|inspect)_/;
const topReads = ourCalls.filter(([t]) => READ_LIKE.test(t)).slice(0, 6);
const ourTotal = ourCalls.reduce((s, [, n]) => s + n, 0);
const orientation = topReads.reduce((s, [, n]) => s + n, 0);
const orientationShare = ourTotal ? Math.round((orientation / ourTotal) * 100) : 0;

const report = {
    scanned: { files: files.length, sessionsWithTools: sessions, userTurns, toolCalls: totalCalls,
               bashCalls, scope: opt.allProjects ? 'ALL projects' : 'demo projects only',
               batterySessionsExcluded: batterySessions,
               window: { since: opt.since || null, until: opt.until || null,
                         firstCall: firstDay, lastCall: lastDay, excludedByWindow: skippedByWindow } },
    shape1_neverCalled: { count: neverCalled.length, of: ours.size, tools: neverCalled },
    shape2_doneWithoutUs: gapVerbs,
    shape3_ourToolsFailed: failures,
    preambles: [...followedBy.entries()]
        .map(([tool, m]) => {
            const total = [...m.values()].reduce((a, b) => a + b, 0);
            const toOurs = [...m.entries()]
                .filter(([t]) => ours.has(t))
                .sort((a, b) => b[1] - a[1]);
            const chained = toOurs.reduce((a, [, n]) => a + n, 0);
            return { tool, calls: total, chained,
                     share: total ? Math.round((chained / total) * 100) : 0,
                     next: toOurs.slice(0, 3).map(([t, n]) => ({ tool: t, calls: n })) };
        })
        .filter((e) => e.calls >= 3 && e.share >= 50)
        .sort((a, b) => b.chained - a.chained),
    orientation: { share: orientationShare, calls: orientation, ofOurCalls: ourTotal,
                   topSixReads: topReads.map(([t, n]) => ({ tool: t, calls: n })) },
    used: ourCalls.map(([t, n]) => ({ tool: t, calls: n, ...(dayOf.get(t) || {}) })),
};

if (opt.json) {
    console.log(JSON.stringify(report, null, 2));
} else {
    const L = [];
    L.push('# Agent gap scan\n');
    L.push(`Scope: **${report.scanned.scope}** — ${files.length} transcript(s), ` +
           `${sessions} session(s) that called a tool, ${userTurns} user turns, ` +
           `${totalCalls} tool calls (${bashCalls} Bash).\n`);
    const w = report.scanned.window;
    L.push(`Window: **${w.since || 'all time'} → ${w.until || 'now'}** — ` +
           `calls actually span ${w.firstCall || '?'} … ${w.lastCall || '?'}` +
           (w.excludedByWindow ? `, ${w.excludedByWindow} call(s) outside it` : '') + '.\n');
    if (!opt.since && w.firstCall && w.lastCall && w.firstCall !== w.lastCall) {
        L.push('> **This is the whole corpus, undifferentiated.** A gap you closed months ago ' +
               'appears here exactly like one from yesterday. Check each finding\'s dates below, ' +
               'or pass `--since` to ask about a period.\n');
    }

    L.push('## 2. Jobs agents did WITHOUT us\n');
    L.push('The strongest signal here: an agent reaching for the shell where a tool should exist.\n');
    if (!gapVerbs.length) L.push('_None._\n');
    for (const g of gapVerbs) {
        L.push(`### \`${g.verb}\` — ${g.count} call(s)\n`);
        L.push(`${g.why}\n`);
        L.push(`Seen **${g.firstSeen} … ${g.lastSeen}** across ${g.byDay.length} day(s): ` +
               g.byDay.map((d) => d.day).join(', ') + '\n');
        for (const s of g.samples) L.push(`    ${s}`);
        L.push('');
    }

    L.push('## 1. Tools nobody calls\n');
    L.push(`**${neverCalled.length} of ${ours.size}** shipped tools were never called in this corpus.\n`);
    L.push('A tool here is a candidate to delete, consolidate, or announce — a triage, not a build.\n');
    L.push('```');
    L.push(neverCalled.join(' ') || '(none)');
    L.push('```\n');

    L.push('## 3. Our tools that failed\n');
    L.push('Harness noise (permission denials, model unavailable) is excluded — see the header.\n');
    if (!failures.length) L.push('_None._\n');
    for (const f of failures) L.push(`- \`${f.tool}\` — ${f.text}`);
    L.push('');

    if (report.preambles.length) {
        L.push('## Reads that are a preamble to another read\n');
        L.push('A tool whose answer is usually followed by another of ours is answering ' +
               'less than the next step needs. That is a SHAPE problem, and no count of ' +
               'how often a tool is called can see it.\n');
        L.push('| tool | calls | chained | share | usually followed by |');
        L.push('|---|---|---|---|---|');
        for (const e of report.preambles) {
            L.push(`| \`${e.tool}\` | ${e.calls} | ${e.chained} | ${e.share}% | ` +
                   `${e.next.map((n) => `\`${n.tool}\` ×${n.calls}`).join(', ')} |`);
        }
        L.push('');
    }
    L.push('## Orientation share\n');
    L.push(`**${orientationShare}%** of our tool calls (${orientation} of ${ourTotal}) are the top six ` +
           'READS — calls that establish where the agent is rather than do anything.\n');
    for (const [tool, n] of topReads) L.push(`- \`${tool}\` — ${n}`);
    L.push('');

    L.push('## What DID get used\n');
    for (const [tool, calls] of ourCalls) {
        const d = dayOf.get(tool);
        L.push(`- \`${tool}\` — ${calls}` + (d ? `  _(${d.first} … ${d.last})_` : ''));
    }
    L.push('');
    L.push(`_control: ${batterySessions} battery session(s) excluded as self-measurement; ` +
           `${ours.size} tool names read from src/, ${called.size} distinct tools seen in ` +
           `transcripts, ${ourCalls.length} of them ours. A zero above means nothing was found; ` +
           `these numbers say whether anything was LOOKED at._`);

    const text = L.join('\n');
    console.log(text);
    if (opt.write) {
        const out = join('.rptc', 'research', 'gap-finder', 'scan-latest.md');
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, text + '\n');
        console.error(`\nwritten: ${out}`);
    }
}
