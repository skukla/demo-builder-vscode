/**
 * Locating and parsing Claude Code session transcripts.
 *
 * The domain half of `scripts/trace-session.mjs`: where transcripts live, which
 * records are tasks, and how a task's cost is counted. Formatting lives in
 * `report.mjs`, the controls in `selfTest.mjs`, and argument handling in the CLI
 * entry — split at 515 lines, which was already over this repo's own util
 * threshold and the largest script in `scripts/`.
 *
 * PRIVACY: everything here accumulates counters. Tool NAMES, argument KEYS,
 * sizes and counts only — never argument values, never result bodies. The
 * `dream` skill states the same rule for its transcript mining, and it matters
 * more here because the corpus spans every project on the machine.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

/**
 * Claude Code's cwd → transcript-directory encoding: every `/` AND every `.`
 * becomes `-`. Empirically derived, not a documented API — taken from
 * `src/commands/claudeSessionStore.ts` rather than re-derived, because the dot
 * rule is the easy half to miss and missing it lands on a path that looks
 * plausible and is wrong.
 */
export function encodeCwd(cwd) {
    return cwd.replace(/[/.]/g, '-');
}

/**
 * Where Claude Code keeps a directory's transcripts.
 *
 * Encodes the **resolved** path, not the one handed in. macOS resolves `/var` to
 * `/private/var` and `/tmp` to `/private/tmp`, and Claude Code encodes what the
 * path resolves to — so a caller passing `/var/folders/…` lands on
 * `-var-folders-…` while the transcripts are under `-private-var-folders-…`.
 * Found 2026-08-24 by looking for runs that had definitely happened and finding
 * an empty directory: the same silent-miss shape as the dot rule above, and it
 * reads as "no transcripts" rather than as an error.
 */
export function transcriptDir(cwd) {
    let resolved = cwd;
    try {
        resolved = fs.realpathSync(cwd);
    } catch {
        // Path may not exist (a caller asking about a deleted checkout). Fall
        // back to the literal path rather than throwing — the lookup then simply
        // finds nothing, which is the correct answer for a directory that is gone.
    }
    return path.join(os.homedir(), '.claude', 'projects', encodeCwd(resolved));
}

/**
 * Newest-first `.jsonl` transcripts under a directory, RECURSIVELY.
 *
 * Recursion is not incidental. Subagent work is written to its own file at
 * `<project>/<session-id>/subagents/agent-*.jsonl`, one per subagent — measured
 * 2026-08-24: 67 top-level session transcripts against 194 subagent ones. A
 * one-level scan therefore misses three quarters of the corpus and, worse,
 * silently understates task cost, which is the exact error this repo's standing
 * constraint names: *"Do not add agents to save tokens … isolation moves where
 * cost is paid; it does not reduce it."* An instrument that hides delegated cost
 * would make delegation look free.
 *
 * (The `isSidechain` flag is a separate, weaker signal — it marks in-file
 * sidechain turns, and this repo's sessions carry zero of them because
 * delegation lands in those separate files instead.)
 */
function transcriptsIn(dir, out = []) {
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            transcriptsIn(p, out);
            continue;
        }
        if (!e.name.endsWith('.jsonl')) continue;
        try {
            const st = fs.statSync(p);
            out.push({
                path: p,
                mtime: st.mtimeMs,
                bytes: st.size,
                kind: p.includes(`${path.sep}subagents${path.sep}`) ? 'subagent' : 'session',
            });
        } catch {
            /* vanished between readdir and stat */
        }
    }
    return out;
}

function newestFirst(files) {
    return files.sort((a, b) => b.mtime - a.mtime);
}

/** Every transcript for THIS repo, newest first (sessions and their subagents). */
export function projectTranscripts(repoRoot) {
    return newestFirst(transcriptsIn(transcriptDir(repoRoot)));
}

/** The newest top-level SESSION transcript for this repo (not a subagent file). */
export function newestSession(repoRoot) {
    return projectTranscripts(repoRoot).find((f) => f.kind === 'session') ?? null;
}

/** Every transcript for every project, newest first. */
export function allTranscripts() {
    const root = path.join(os.homedir(), '.claude', 'projects');
    let dirs = [];
    try {
        dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {
        return [];
    }
    return newestFirst(dirs.flatMap((d) => transcriptsIn(path.join(root, d.name))));
}

// ── Record classification ────────────────────────────────────────────────────

/**
 * Synthetic "user" records that are NOT tasks: slash-command plumbing, the
 * resume caveat, memory input. Counting these as tasks inflates the denominator
 * and makes mean cost per task look better than it is.
 */
const SYNTHETIC = [
    '<local-command-',
    '<command-name>',
    '<command-message>',
    '<command-args>',
    'Caveat: The messages below',
    '<user-memory-input>',
];

export function textOf(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .filter((b) => b && typeof b === 'object' && b.type === 'text')
        .map((b) => b.text ?? '')
        .join('\n');
}

function carriesToolResult(content) {
    return (
        Array.isArray(content) &&
        content.some((b) => b && typeof b === 'object' && b.type === 'tool_result')
    );
}

/** A real user prompt — the boundary between one task and the next. */
export function isRealPrompt(rec) {
    if (rec.type !== 'user') return false;
    const content = rec.message?.content;
    if (carriesToolResult(content)) return false;
    const text = textOf(content).trim();
    if (!text) return false;
    return !SYNTHETIC.some((m) => text.startsWith(m) || text.includes(m));
}

/**
 * A task's BILLABLE tokens: fresh input + output + cache writes.
 *
 * Cache READS are deliberately excluded and reported separately. They are the
 * overwhelming majority of token volume in a long session (a turn re-reads the
 * whole cached context), so summing them as if they were fresh overstates a run
 * by two orders of magnitude — measured on a real session: 8.1M billable
 * against 911M cache reads.
 */
export function taskCost(t) {
    return t.inputTokens + t.outputTokens + t.cacheCreateTokens;
}

export function emptyTask(index, startedAt) {
    return {
        index,
        startedAt,
        endedAt: startedAt,
        label: '',
        promptChars: 0,
        turns: 0,
        sidechainTurns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        thinkingTokens: 0,
        toolPath: [],
        toolCounts: new Map(),
        results: 0,
        errors: 0,
        resultBytes: [],
    };
}

export function emptyAggregate() {
    return {
        toolCalls: new Map(),
        argKeys: new Map(),
        /** tool name -> { sizes: number[], errors: number }, joined via call id. */
        toolBytes: new Map(),
        /** in-flight `tool_use.id` -> tool name; drained as results arrive. */
        callOwner: new Map(),
        /**
         * `attributionMcpTool` counts TURNS attributed to an MCP tool, not
         * calls — a single call carries several (the thinking turn before it,
         * the turn that makes it, the turn that reads the answer). Measured on a
         * real session: 49 attributed turns against 13 actual calls, a 3.8x
         * inflation. Kept as a secondary signal and labelled as turns; the call
         * count comes from `mcp__`-prefixed tool_use names instead.
         */
        mcpTurns: new Map(),
        lines: 0,
        malformed: 0,
        bytesRead: 0,
    };
}

function recordUsage(task, rec) {
    const usage = rec.message?.usage;
    if (rec.type !== 'assistant' || !usage) return;
    task.turns++;
    if (rec.isSidechain) task.sidechainTurns++;
    task.inputTokens += usage.input_tokens ?? 0;
    task.outputTokens += usage.output_tokens ?? 0;
    task.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    task.cacheCreateTokens += usage.cache_creation_input_tokens ?? 0;
    task.thinkingTokens += usage.output_tokens_details?.thinking_tokens ?? 0;
}

function recordBlocks(task, rec, agg) {
    const content = rec.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'tool_use') {
            const name = block.name ?? '(unnamed)';
            task.toolPath.push(name);
            task.toolCounts.set(name, (task.toolCounts.get(name) ?? 0) + 1);
            agg.toolCalls.set(name, (agg.toolCalls.get(name) ?? 0) + 1);
            // Remember which tool a call id belongs to, so the RESULT that comes
            // back later can be attributed to it. `tool_use.id` ↔
            // `tool_result.tool_use_id` is the only join that gives per-tool
            // response size — which is the "bytes" half of the bytes × frequency
            // work list, and the thing no fixture can tell you.
            if (block.id) agg.callOwner.set(block.id, name);
            // Argument KEYS only — values can carry secrets.
            const keys = agg.argKeys.get(name) ?? new Set();
            for (const k of Object.keys(block.input ?? {})) keys.add(k);
            agg.argKeys.set(name, keys);
        } else if (block.type === 'tool_result') {
            task.results++;
            const body = block.content;
            const size = Buffer.byteLength(
                typeof body === 'string' ? body : JSON.stringify(body ?? ''),
                'utf8'
            );
            task.resultBytes.push(size);
            if (block.is_error) task.errors++;

            const owner = block.tool_use_id ? agg.callOwner.get(block.tool_use_id) : undefined;
            if (owner) {
                const stat = agg.toolBytes.get(owner) ?? { sizes: [], errors: 0 };
                stat.sizes.push(size);
                if (block.is_error) stat.errors++;
                agg.toolBytes.set(owner, stat);
                // The id is consumed; a transcript can be long and this map
                // would otherwise grow for the whole file.
                agg.callOwner.delete(block.tool_use_id);
            }
        }
    }
}

/**
 * Stream one transcript into tasks, accumulating cross-file counters in `agg`.
 *
 * Streamed rather than read whole: the corpus runs to 1.6 GB across 263 files
 * with a single transcript reaching 236 MB, so reading one into memory is not
 * safe to assume.
 */
export async function parseTranscript(filePath, agg) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const tasks = [];
    let current = null;

    for await (const line of rl) {
        if (!line.trim()) continue;
        agg.lines++;
        let rec;
        try {
            rec = JSON.parse(line);
        } catch {
            agg.malformed++;
            continue;
        }

        if (isRealPrompt(rec)) {
            current = emptyTask(tasks.length + 1, rec.timestamp ?? null);
            const text = textOf(rec.message?.content).trim();
            current.promptChars = text.length;
            current.label = text.split('\n')[0].slice(0, 60);
            tasks.push(current);
            continue;
        }
        if (!current) continue; // session plumbing before the first prompt
        if (rec.timestamp) current.endedAt = rec.timestamp;

        recordUsage(current, rec);
        recordBlocks(current, rec, agg);

        // Secondary signal: which MCP a TURN was attributed to. See the note on
        // `mcpTurns` — this is turns, not calls, and must not be labelled as
        // call frequency.
        if (rec.attributionMcpTool) {
            const key = `${rec.attributionMcpServer ?? '?'}/${rec.attributionMcpTool}`;
            agg.mcpTurns.set(key, (agg.mcpTurns.get(key) ?? 0) + 1);
        }
    }

    return tasks;
}
