#!/usr/bin/env node
/**
 * Per-tool verdict: keep it, fix it, delete it, or go and find out.
 *
 *   node .claude/skills/tool-verdicts/verdicts.mjs [--json] [--verdict DELETE]
 *
 * ## The question this exists to stop being answered by vibes
 *
 * On 2026-08-26 the claim "85 tools are unused, so nobody needs them" was made
 * off ONE producer's 50 sessions. Checked properly: 107 tools shipped, 28 ever
 * called in real work, 15 exercised by the battery, and **78 judged by neither**.
 * Absence from one person's month is not evidence a tool is dead — and no prompt
 * had ever asked for those 78, so nothing could have found out.
 *
 * A tool needs TWO independent readings before anyone deletes it:
 *
 *   1. **Demand** — did real work ever call it? (`agent-gap-scan`, transcripts)
 *   2. **Function** — when something DOES ask for its job, does the agent find it
 *      and does it work? (the battery, one prompt per tool)
 *
 * Neither alone decides. A tool nobody called might be perfect and simply not
 * needed yet; a tool nobody called might also be unreachable, and those want
 * opposite actions.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const BATTERY = '.rptc/plans/evaluation-mode/battery';

const argv = process.argv.slice(2);
const opt = { json: argv.includes('--json'), only: null };
if (argv.includes('--verdict')) {
    opt.only = argv[argv.indexOf('--verdict') + 1];
    if (!opt.only || opt.only.startsWith('--')) {
        console.error('--verdict needs a value (KEEP, FIX, INVESTIGATE, UNJUDGED, DELETE?)');
        process.exit(2);
    }
}

/** Every tool the extension ships, from the behavioural scan's own reading. */
function scanReport() {
    try {
        return JSON.parse(execFileSync('node',
            ['.claude/skills/agent-gap-scan/scan.mjs', '--json'], { encoding: 'utf8' }));
    } catch (err) {
        console.error('could not run agent-gap-scan — it is the source for real-world demand.');
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(2);
    }
}

/** Battery prompts, and which tool each one is FOR. */
function batteryPrompts() {
    const f = join(BATTERY, 'prompts.json');
    if (!existsSync(f)) return [];
    return JSON.parse(readFileSync(f, 'utf8'));
}

/** The most recent outcome per prompt, across every run on disk. */
function batteryOutcomes() {
    const dir = join(BATTERY, 'results');
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return new Map();
    const byTask = new Map();
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort()) {
        for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
            if (!line.trim()) continue;
            let row;
            try { row = JSON.parse(line); } catch { continue; }
            // Later files sort last, so this keeps the newest — and an INVALID run
            // is not an outcome, it is a broken measurement. Never let one become
            // the verdict of record.
            if (row.outcome === 'invalid') continue;
            byTask.set(row.task, { ...row, run: name.replace('.jsonl', '') });
        }
    }
    return byTask;
}

const scan = scanReport();
const prompts = batteryPrompts();
const outcomes = batteryOutcomes();

const shipped = [...new Set([
    ...scan.shape1_neverCalled.tools,
    ...scan.used.map((u) => u.tool),
])].sort();

const demand = new Map(scan.used.map((u) => [u.tool, u.calls]));
/** tool -> the prompt written to exercise it */
const promptFor = new Map();
for (const p of prompts) for (const e of p.expect) promptFor.set(e, p.id);

/**
 * The verdict, and the reasoning is the point rather than the label.
 *
 * DELETE? carries its question mark on purpose: the strongest thing this can say
 * about a tool nobody calls and nobody asks for is "find out", never "remove it".
 */
function verdictFor(tool) {
    const calls = demand.get(tool) ?? 0;
    const task = promptFor.get(tool);
    const run = task ? outcomes.get(task) : undefined;

    if (!task) {
        return calls > 0
            ? ['KEEP', `called ${calls}x in real work; no prompt exercises it`]
            : ['UNJUDGED', 'never called, and no prompt has ever asked for it'];
    }
    if (!run) return ['UNJUDGED', `prompt "${task}" exists but has never been run`];

    if (run.diagnosis.startsWith('TOOL-BROKEN')) return ['FIX', run.diagnosis];
    if (run.diagnosis.startsWith('TOOL-INSUFFICIENT')) return ['FIX', run.diagnosis];
    if (run.outcome === 'around') return ['INVESTIGATE', `asked for, and the agent went around it (${run.diagnosis})`];
    if (run.outcome === 'miss') return ['INVESTIGATE', `asked for, and nothing reached it (${run.diagnosis})`];

    // It works when asked. Demand decides whether it earns its place.
    return calls > 0
        ? ['KEEP', `works when asked, and called ${calls}x in real work`]
        : ['DELETE?', 'works when asked, but nothing has ever needed it — a question, not a decision'];
}

const rows = shipped.map((tool) => {
    const [verdict, why] = verdictFor(tool);
    return { tool, verdict, why, calls: demand.get(tool) ?? 0, prompt: promptFor.get(tool) ?? null };
});

const selected = opt.only ? rows.filter((r) => r.verdict === opt.only) : rows;

if (opt.json) {
    console.log(JSON.stringify({ generated: scan.scanned, rows: selected }, null, 2));
} else {
    const ORDER = ['FIX', 'INVESTIGATE', 'UNJUDGED', 'DELETE?', 'KEEP'];
    for (const v of ORDER) {
        const group = selected.filter((r) => r.verdict === v);
        if (!group.length) continue;
        console.log(`\n## ${v}  (${group.length})\n`);
        for (const r of group) console.log(`  ${r.tool.padEnd(34)} ${r.why}`);
    }
    const counts = ORDER.map((v) => `${v} ${rows.filter((r) => r.verdict === v).length}`).join(' · ');
    console.log(`\n  ${rows.length} tools: ${counts}`);
    console.log(`  control: ${prompts.length} prompt(s), ${outcomes.size} with a run, ` +
                `${scan.scanned.sessionsWithTools} transcript session(s) read`);
    const unjudged = rows.filter((r) => r.verdict === 'UNJUDGED').length;
    if (unjudged) {
        console.log(`\n  ${unjudged} tool(s) UNJUDGED — nothing has asked for them, so nothing`);
        console.log('  can be concluded about them. Write a prompt before deleting anything.');
    }
}
