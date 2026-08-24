#!/usr/bin/env node
/**
 * Measure the PATH an agent takes through a task, and what it cost.
 *
 * `ai-coverage-scan` asks whether an agent can REACH a feature.
 * `measure-ai-guidance.mjs` asks what our guidance costs as text. Neither sees
 * the thing that decides efficiency: given a task, what route did the agent
 * take, how many wrong turns did it make, what did the run cost?
 *
 * That data already exists and nothing here read it. Claude Code writes a JSONL
 * transcript per session carrying every tool call in order, per-turn token usage
 * (input, output, cache read/create, thinking), `is_error` on results, and
 * `attributionMcpTool` naming which MCP served a call.
 *
 * The precedent that makes this worth building: ai-surface phase 2 predicted "a
 * live harness is unnecessary; static derivation traced all 52" and later scored
 * its own prediction "Wrong, and the costly one."
 *
 * ## This script WRITES NOTHING
 *
 * It reads transcripts and prints to stdout. No log file, no cache, no state —
 * so it cannot grow on disk and there is nothing to clean up. Redirect the
 * output yourself if you want to keep a report.
 *
 * What it can do is READ a lot: the corpus is ~1.6 GB across 263 transcripts
 * with a single file reaching 236 MB. So `--all` is bounded by default
 * (`--limit`, newest first) and every mode prints the bytes it read.
 *
 * ## Privacy
 *
 * Transcripts hold prompts, file contents and possibly secrets, for EVERY
 * project on the machine. This emits tool NAMES, argument KEYS, sizes and counts
 * — never argument values, never result bodies, never prompt text. Two of the
 * self-test's checks assert exactly that. `--labels` opts into truncated prompt
 * excerpts for local reading and makes the output unsafe to commit; it warns.
 *
 * ## Usage
 *
 *   node scripts/trace-session.mjs --latest          # this project's newest session
 *   node scripts/trace-session.mjs <path.jsonl>      # one named transcript
 *   node scripts/trace-session.mjs --all             # newest 25 across all projects
 *   node scripts/trace-session.mjs --all --limit 100 --since 2026-08-01
 *   node scripts/trace-session.mjs --self-test       # controls; non-zero on failure
 *
 * Flags: --tasks N (heaviest tasks shown, default 10) · --labels (see above)
 */

import { execSync } from 'child_process';
import path from 'path';
import {
    allTranscripts,
    newestSession,
    parseTranscript,
    emptyAggregate,
} from './trace/transcript.mjs';
import { reportTasks, reportPath, reportTools, num, mb } from './trace/report.mjs';
import { runSelfTest } from './trace/selfTest.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, dflt) => {
    const i = argv.indexOf(f);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

/** Default scan bound for `--all`. The corpus is large; newest-first is the useful end. */
const DEFAULT_LIMIT = 25;

function resolveScope() {
    if (has('--all')) {
        let files = allTranscripts();
        const since = valueOf('--since', null);
        if (since) {
            const cutoff = Date.parse(since);
            if (Number.isNaN(cutoff)) {
                console.error(`ABORT: --since "${since}" is not a date I can parse.`);
                process.exit(1);
            }
            files = files.filter((f) => f.mtime >= cutoff);
        }
        const limit = Number(valueOf('--limit', String(DEFAULT_LIMIT)));
        const capped = files.slice(0, limit);
        const dropped = files.length - capped.length;
        const subagents = capped.filter((f) => f.kind === 'subagent').length;
        return {
            files: capped,
            label:
                `newest ${capped.length} of ${files.length} transcripts across all projects ` +
                `(${capped.length - subagents} sessions + ${subagents} subagent files)` +
                (since ? `, modified since ${since}` : ''),
            note: dropped > 0 ? `${dropped} older transcript(s) not read — raise with --limit` : null,
        };
    }

    if (has('--latest')) {
        const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
        const newest = newestSession(root);
        if (!newest) {
            console.error(`ABORT: no session transcript for this repo under ~/.claude/projects/.`);
            process.exit(1);
        }
        return { files: [newest], label: 'this project, newest session', note: null };
    }

    const named = argv.find((a) => !a.startsWith('--'));
    if (!named) {
        console.error(
            'Usage: node scripts/trace-session.mjs [--latest | <path.jsonl> | --all] ' +
                '[--limit N] [--since D] [--tasks N] [--labels] [--self-test]'
        );
        process.exit(1);
    }
    return { files: [{ path: named, bytes: 0 }], label: path.basename(named), note: null };
}

async function main() {
    if (has('--self-test')) process.exit((await runSelfTest()) ? 0 : 1);

    const showLabels = has('--labels');
    const topTasks = Number(valueOf('--tasks', '10'));
    const scope = resolveScope();

    console.log('# Agent path and cost\n');
    console.log(`Scope: ${scope.label}`);
    if (scope.note) console.log(`Note:  ${scope.note}`);
    if (showLabels) {
        console.log('\n⚠️  --labels prints prompt excerpts. This output is NOT safe to commit.');
    }
    console.log();

    const agg = emptyAggregate();
    let tasks = [];
    for (const f of scope.files) {
        try {
            tasks = tasks.concat(await parseTranscript(f.path, agg));
            agg.bytesRead += f.bytes ?? 0;
        } catch (err) {
            console.error(`ABORT: could not read ${f.path}: ${err.message}`);
            process.exit(1);
        }
    }

    const real = reportTasks(tasks, { topTasks, showLabels });
    if (!has('--all')) reportPath(real);
    reportTools(agg);

    console.log(
        `control: ${num(agg.lines)} records from ${scope.files.length} transcript(s) ` +
            `(${mb(agg.bytesRead)} read), ${num(tasks.length)} tasks, ` +
            `${num(agg.toolCalls.size)} distinct tools, ${num(agg.malformed)} malformed lines skipped`
    );

    // A broken step must abort, not print a tidy zero.
    const problems = [];
    if (agg.lines === 0) problems.push('0 records read — the transcript is empty or unreadable.');
    if (tasks.length === 0) problems.push('0 tasks — the prompt detector is broken, not the history.');
    if (problems.length) {
        console.error('\nABORT:\n  ' + problems.join('\n  '));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(`ABORT: ${err.stack ?? err.message}`);
    process.exit(1);
});
