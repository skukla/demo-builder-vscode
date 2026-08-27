/**
 * A/B: does stating the active project in the home AGENTS.md remove the
 * `get_current_project` round trip?
 *
 * control   = the shipped directive ("call get_current_project first")
 * treatment = the new directive ("the active project is `bodea`")
 *
 * Prompts are RECONSTRUCTED from the task labels in
 * docs/research/2026-08-24-llm-path-measurement.md — the original strings were
 * never recorded, so these are not byte-identical to the six original runs.
 * That is fine for an A/B, where both arms see the same prompt; it is NOT a
 * basis for comparing against the original per-task token figures.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync,
         mkdtempSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { bare, score, scoreSkill } from './score.mjs';

const AB = new URL('.', import.meta.url).pathname;
const ROOT = `${homedir()}/.demo-builder/projects`;
const REPO = new URL('../../../..', import.meta.url).pathname;
// The project's own MCP config — the four servers the extension provisions.
const PROJECT_MCP = `${ROOT}/bodea/.mcp.json`;

/**
 * The agent's memory directory for these runs.
 *
 * Denying `Write`/`Edit` is not enough on its own: `Bash` is allowed on purpose —
 * it is how "the agent went around us" is detected — and an agent told it cannot
 * use Write offers to use the shell instead. It said exactly that when the deny
 * was tested.
 *
 * So memory is snapshotted before each prompt and restored after, which does not
 * depend on predicting HOW something got written. Run 1 of the cross-server
 * prompt wrote a memory file and edited MEMORY.md, so run 2 began with run 1's
 * conclusions — a repeat that inherits the previous repeat's notes is not a
 * second sample.
 */
const MEMORY_DIR = `${homedir()}/.claude/projects/-Users-kukla--demo-builder-projects/memory`;

function snapshotMemory() {
    if (!existsSync(MEMORY_DIR)) return null;
    const dest = mkdtempSync(join(tmpdir(), 'battery-memory-'));
    cpSync(MEMORY_DIR, dest, { recursive: true });
    return dest;
}

/** Restore it, and report whether the run had changed anything. */
function restoreMemory(snap) {
    if (!snap) return false;
    const before = readdirSync(snap).sort().join(',');
    const after = existsSync(MEMORY_DIR) ? readdirSync(MEMORY_DIR).sort().join(',') : '';
    rmSync(MEMORY_DIR, { recursive: true, force: true });
    cpSync(snap, MEMORY_DIR, { recursive: true });
    rmSync(snap, { recursive: true, force: true });
    return before !== after;
}
/**
 * THE ALLOWLIST, generated at run time. Nothing hand-maintained.
 *
 * It used to be a file of 45 read-only demo-builder tools. That drifts, and it
 * drifts SILENTLY: a blocked tool and a missing tool produce identical routes, so
 * the battery reports "the agent went around us" when the truth is "we refused
 * it". Both `get_commerce_endpoints` and `run_commerce_query` shipped and were
 * blocked on 2026-08-26, and the second produced a NOT-FINDABLE verdict for a
 * tool the agent had found on first exposure.
 *
 * Asking the servers at run time removes the failure mode instead of managing it.
 */
const ALLOWED = execFileSync('node', [`${AB}/enumerate-tools.mjs`, PROJECT_MCP], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
    // Servers that declare no annotations contribute nothing to the filtered
    // enumeration; their hand-triaged read supplement fills the gap. See the
    // header of third-party-reads.txt for what is excluded and why.
    .concat(readFileSync(`${AB}/third-party-reads.txt`, 'utf8')
        .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));

/**
 * Claude's own tools, which the allowlist ALSO gates — and inconsistently.
 *
 * Measured 2026-08-26 rather than assumed, because the assumption was wrong:
 * `Read`, `Write`, `Edit` and `ToolSearch` run whether listed or not, while
 * `Glob` and `Grep` were REFUSED until named. An agent denied Glob silently falls
 * back to the shell, which then reads as "went around us" — the same lie the MCP
 * drift produced.
 *
 * There is no `tools/list` for these, so this is a hand-kept list and the one
 * place drift can still enter. `TodoWrite` is included and is NOT available in
 * headless `-p` at all, listed or not; that is out of our hands and recorded so
 * the next reader does not re-test it.
 */
const NATIVE_TOOLS = [
    'Bash', 'Read', 'Write', 'Edit', 'NotebookEdit',
    'Glob', 'Grep', 'ToolSearch',
    'WebFetch', 'WebSearch',
    'Task', 'TodoWrite', 'ExitPlanMode',
    // Skill loads instructions into the run — it changes nothing on disk, and
    // it is the measurement channel for `expectSkill` prompts (AI-1q skills
    // half). Any writes a skill's body then instructs are still denied by the
    // read-only allowlist and the Write/Edit disallow.
    'Skill',
];
ALLOWED.push(...NATIVE_TOOLS);



// Bash is allowed ON PURPOSE. The question this battery asks is "what does the
// agent reach for?", and the most important answer is "it went around us" — 25
// hand-built Commerce queries and 4 hand-built page fetches in the corpus. Deny
// Bash and every prompt is forced through our tools, which measures nothing.


// Every prompt declares the tool that SHOULD answer it. That is the whole idea:
// we know the right route in advance, so "what did it actually use?" becomes a
// score instead of an interpretation. Kept in a file, verbatim, because the
// original six prompts were lost and their run became incomparable.
let PROMPTS = JSON.parse(readFileSync(`${AB}/prompts.json`, 'utf-8'));

// `--only <id>` re-runs ONE prompt, and `--repeat <n>` runs the selection n times.
// Both exist for the same reason: every result here is n=1, and agents are
// stochastic — `datapacks` changed diagnosis between two runs and there was no
// way to tell a regression from a coin flip. Repeating is how you tell.
// `--live` streams the agent's narration and every call as they happen. Off by
// default so a full battery run stays readable; on, a long run is watchable
// instead of a black box — and WHAT it says as it goes is the evidence, "I'll
// check the config" versus actually opening the config server.
const LIVE = process.argv.includes('--live');

const only = process.argv[process.argv.indexOf('--only') + 1];
if (process.argv.includes('--only')) {
    if (!only || only.startsWith('--')) { console.error('--only needs a prompt id'); process.exit(2); }
    // Comma-separated ids. The first overnight-loop cycle called
    // `--only orientation,active-project` and the run exited having measured
    // nothing — a rig that rejects the obvious call shape wastes a full cycle.
    const wanted = new Set(only.split(','));
    PROMPTS = PROMPTS.filter((p) => wanted.has(p.id));
    const missing = [...wanted].filter((id) => !PROMPTS.some((p) => p.id === id));
    if (missing.length) { console.error(`no prompt with id "${missing.join('", "')}"`); process.exit(2); }
}
const repeat = process.argv.includes('--repeat')
    ? Number(process.argv[process.argv.indexOf('--repeat') + 1]) : 1;
if (!Number.isInteger(repeat) || repeat < 1) { console.error('--repeat needs a positive integer'); process.exit(2); }
if (repeat > 1) PROMPTS = Array.from({ length: repeat }, () => PROMPTS).flat();

// A prompt whose expected tool is not in the allowlist is UNANSWERABLE: the agent
// is forbidden from calling the one thing that would score a hit, and the run
// reports `around` — which reads exactly like "the agent could not find the
// tool". Caught before the first run: `get_commerce_endpoints` shipped the same
// day and the allowlist predated it, so two of ten prompts were rigged to fail.
// A prompt may expect a tool from ANY server — `cross-pdp-slots` expects
// `list_slots`, which is dropins'. Checking only the demo-builder prefix would
// abort on a perfectly valid expectation, so match either form against the whole
// enumerated allowlist.
const allowedSet = new Set(ALLOWED);
const bad = PROMPTS.flatMap(({ id, expect }) =>
    expect
        .filter((e) => !allowedSet.has(e) && ![...allowedSet].some((a) => a.endsWith(`__${e}`)))
        .map((e) => `${id} -> ${e}`));
if (bad.length) {
    console.error('ABORT: expected tools missing from readonly-tools.txt:');
    for (const b of bad) console.error('  ' + b);
    console.error('Re-extract the allowlist (mcp-live-probe `info`) or fix the prompt.');
    process.exit(2);
}

// NO VARIANTS, and no writing to AGENTS.md.
//
// This was an A/B runner: it swapped `~/.demo-builder/projects/AGENTS.md` between
// a control and a treatment copy. Both copies are gone, and it never backed the
// real file up — so running it would have destroyed a live 3.1KB AGENTS.md and
// then crashed on the missing variant.
//
// The battery asks a simpler question: with the bundle AS IT SHIPS, what does the
// agent reach for? So it runs once against whatever is actually installed and
// touches nothing. To A/B a bundle change later, copy this file and back up
// AGENTS.md first — deliberately, not as a side effect.

// One immutable file per run. The old code opened with `writeFileSync(OUT, '')`,
// so running the "after" DELETED the "before" — and comparing before to after is
// the only thing this battery exists for. It is also the exact failure this
// directory was created to prevent: its README says the original six prompts were
// lost and that anything Evaluation Mode runs "must persist its prompts verbatim
// alongside its results".
//
// The timestamp comes from the shell, not `new Date()`, so a resumed or replayed
// run cannot silently reuse an earlier name.
const STAMP = execFileSync('date', ['-u', '+%Y-%m-%dT%H-%M-%SZ'], { encoding: 'utf8' }).trim();
const RUNS = `${AB}/results`;
mkdirSync(RUNS, { recursive: true });
const OUT = `${RUNS}/${STAMP}.jsonl`;
if (existsSync(OUT)) {
    console.error(`refusing to overwrite ${OUT}`);
    process.exit(2);
}

// What the extension was actually SERVING. The running host is routinely many
// commits behind the checkout — it was 22 behind during the first run — so a
// result without this cannot be compared to anything.
let serving = 'unknown';
try {
    serving = execFileSync('node', ['.claude/skills/mcp-live-probe/probe.mjs', 'info'],
        { encoding: 'utf8', cwd: REPO }).split('\n')[0].replace(/^serving:\s*/, '').trim();
} catch { /* probe unavailable — recorded as unknown rather than guessed */ }

// Adobe auth, read at the start AND checked again at the end.
//
// A run that spans a sign-out is not comparable to one that does not, and
// nothing said so: on 2026-08-26 the token expired between two runs, four
// prompts got "Adobe sign-in required", and the results were compared to a
// signed-in baseline as though the difference were the fix. Recorded the way
// cache state is — declared, not inferred.
function adobeAuth() {
    try {
        const out = execFileSync('node',
            ['.claude/skills/mcp-live-probe/probe.mjs', 'call', 'get_auth_status', '{}'],
            { encoding: 'utf8', cwd: REPO });
        const m = out.match(/"authenticated":\s*(true|false)/);
        const e = out.match(/"expiresInMinutes":\s*(-?\d+)/);
        return { authenticated: m ? m[1] === 'true' : null, expiresInMinutes: e ? Number(e[1]) : null };
    } catch {
        return { authenticated: null, expiresInMinutes: null };
    }
}
const authBefore = adobeAuth();
if (authBefore.authenticated === false) {
    console.log('  WARNING: Adobe is signed out. Tools that need it will answer errors,');
    console.log('           and this run is NOT comparable to a signed-in one.\n');
}

const META = {
    startedAt: STAMP,
    serving,
    adobeAuthBefore: authBefore,
    promptCount: PROMPTS.length,
    allowlist: ALLOWED.length,
    // Cache state alone swung one prompt 55,236 -> 8,959 in a prior measurement,
    // so an unlabelled token figure is not comparable. Declared, not inferred.
    cache: process.env.BATTERY_CACHE ?? 'unspecified',
};
writeFileSync(`${RUNS}/${STAMP}.meta.json`, JSON.stringify(META, null, 2) + '\n');

/** Re-read auth at the end and flag a run that crossed the boundary mid-flight. */
function finishMeta() {
    const authAfter = adobeAuth();
    const crossed = authBefore.authenticated !== authAfter.authenticated;
    writeFileSync(
        `${RUNS}/${STAMP}.meta.json`,
        JSON.stringify({ ...META, adobeAuthAfter: authAfter, authChangedMidRun: crossed }, null, 2) + '\n',
    );
    if (crossed) {
        console.log('\n  WARNING: Adobe auth CHANGED during this run — prompts before and');
        console.log('           after the change are not comparable to each other.');
    }
}
writeFileSync(OUT, '');
console.log(`run ${STAMP}\n  serving: ${serving}\n  results: ${OUT}\n`);

function runOnce(prompt, cwd = ROOT) {
    return new Promise((resolve) => {
        const args = [
            '-p', prompt,
            // ISOLATE the surface. Without these, `claude -p` loads the user's
            // GLOBAL MCP servers on top of the project's — this machine has eight
            // (MCP_DOCKER, fluffyjaws, serena, ynab…) that no producer has. The
            // first cross-server run spent 24 calls in a global browser server
            // while the project's own `playwright` got zero, and that number
            // described this laptop rather than the product.
            //
            // A producer's agent sees exactly the four servers the extension
            // provisions. So must the battery.
            '--mcp-config', `${PROJECT_MCP}`,
            '--strict-mcp-config',
            '--allowed-tools', ...ALLOWED,
            // The battery must not CHANGE anything, and left alone it does. Run 1
            // of the cross-server prompt wrote a memory file and edited MEMORY.md
            // — "File created successfully" — so run 2 began with run 1's notes and
            // the two were never independent. That is the same self-measurement
            // failure as the transcripts, one layer down: a repeat that inherits
            // the previous repeat's conclusions is not a second sample.
            //
            // `--allowed-tools` does not cover the built-in writers, so they are
            // denied explicitly. Every prompt here is diagnostic; none has a reason
            // to write.
            '--disallowed-tools', 'Write', 'Edit', 'NotebookEdit',
            '--permission-mode', 'dontAsk',
            '--output-format', 'stream-json',
            '--verbose',
        ];
        const child = spawn('claude', args, { cwd });
        let buf = '';
        const calls = [];       // {name, input} — the route, with arguments
        const said = [];        // the agent's OWN words
        const results = [];     // {id, isError, preview} — what came back
        let result = null;
        child.stdout.on('data', (d) => {
            buf += d.toString();
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim()) continue;
                let ev;
                try { ev = JSON.parse(line); } catch { continue; }
                if (ev.type === 'assistant') {
                    for (const c of ev.message?.content ?? []) {
                        if (c.type === 'tool_use') {
                            calls.push({ name: c.name, input: c.input ?? {} });
                            if (LIVE) {
                                const nm = c.name.replace(/^mcp__/, '').replace('__', ':');
                                const arg = c.name === 'Bash'
                                    ? String(c.input?.command ?? '').replace(/\s+/g, ' ').slice(0, 88)
                                    : Object.entries(c.input ?? {})
                                        .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, ' ').slice(0, 56)}`)
                                        .join(' ').slice(0, 88);
                                console.log(`    ${String(calls.length).padStart(3)}. ${nm}${arg ? '  ' + arg : ''}`);
                            }
                        }
                        // The agent frequently STATES the gap — "there is no tool
                        // for this, so I will use curl". That sentence is worth
                        // more than any inference we could draw from the route,
                        // and the first version threw it away.
                        else if (c.type === 'text' && c.text?.trim()) {
                            said.push(c.text.trim());
                            if (LIVE) {
                                for (const line of c.text.trim().split('\n')) {
                                    if (line.trim()) console.log(`     | ${line.trim().slice(0, 148)}`);
                                }
                            }
                        }
                    }
                }
                if (ev.type === 'user') {
                    // Tool RESULTS. A call that happened and returned junk looks
                    // identical to a call that worked, if you only record names —
                    // and those are opposite findings: one means improve the tool,
                    // the other means it is fine.
                    for (const c of ev.message?.content ?? []) {
                        if (c.type !== 'tool_result') continue;
                        let txt = c.content;
                        if (Array.isArray(txt)) txt = txt.map((x) => x?.text ?? '').join(' ');
                        results.push({ id: c.tool_use_id, isError: !!c.is_error,
                                       preview: String(txt ?? '').replace(/\s+/g, ' ').slice(0, 300) });
                    }
                }
                if (ev.type === 'result') result = ev;
            }
        });
        child.on('close', () => resolve({ calls, said, results, result }));
    });
}


/**
 * Score one run against what we expected.
 *
 * Three outcomes, and the third is the one worth having:
 *   hit    — it used a tool we said should answer this.
 *   around — it went to Bash/WebFetch instead. THE finding: either we have no
 *            tool for the job, or we have one and the agent never found it.
 *   miss   — neither. It answered from something else, or not at all.
 */

{
    const variant = 'as-shipped';
    for (const { id: task, prompt, expect, why, expectServers, expectSkill, cwd } of PROMPTS) {
        const started = Date.now();
        const memSnap = snapshotMemory();
        // `cwd: "project"` runs the prompt INSIDE the project directory — where
        // a producer's session actually sits, and the only place project skills
        // (`.claude/skills/<name>/SKILL.md`) are discoverable. Default stays the
        // projects root (the home surface), matching every recorded run so far.
        const runCwd = cwd === 'project' ? `${ROOT}/bodea` : ROOT;
        const { calls, said, results, result } = await runOnce(prompt, runCwd);
        if (restoreMemory(memSnap)) {
            console.log('    (agent wrote to memory; restored so the next run is independent)');
        }
        const s = score(calls, results, said, expect);
        const sk = scoreSkill(calls, expectSkill);
        const row = {
            variant,
            task,
            prompt,
            expect,
            why,
            ...s,
            ...(sk ?? {}),
            ...(cwd ? { cwd } : {}),
            calls: calls.length,
            route: calls.map((c) => bare(c.name)),
            // The route WITH arguments. Names alone say the agent called
            // `read_page`; they do not say which page, and "what did it ask for"
            // is most of what makes a path readable. Values are truncated, not
            // dropped — an argument can carry a token.
            steps: calls.map((c, i) => ({
                n: i + 1,
                tool: bare(c.name),
                ours: c.name.startsWith('mcp__demo-builder__'),
                args: Object.fromEntries(Object.entries(c.input ?? {})
                    .map(([k, v]) => [k, String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 160)])),
                result: (() => {
                    const r = results.find((x) => x.id === c.id);
                    return r ? { isError: r.isError, preview: r.preview.slice(0, 200) } : null;
                })(),
            })),
            // What it ran INSTEAD. The shell command an agent writes by hand is
            // the specification for the tool it needed — that is exactly where
            // `get_commerce_endpoints` came from.
            shellCommands: calls.filter((c) => c.name === 'Bash')
                .map((c) => String(c.input.command ?? '').replace(/\s+/g, ' ').slice(0, 300)),
            said,
            // WHICH SERVERS the route touched. For a cross-server prompt the
            // interesting answer is not whether one expected tool was hit, but
            // whether Claude COMPOSED across servers or stayed inside the first
            // one that looked relevant.
            serversUsed: [...new Set(calls
                .map((c) => /^mcp__(.+?)__/.exec(c.name)?.[1])
                .filter(Boolean))],
            expectServers: expectServers ?? null,
            toolResults: results.map((r) => ({ isError: r.isError, preview: r.preview })),
            calledGetCurrentProject: calls.some((c) => c.name.endsWith('get_current_project')),
            billable:
                (result?.usage?.input_tokens ?? 0) +
                (result?.usage?.cache_creation_input_tokens ?? 0) +
                (result?.usage?.cache_read_input_tokens ?? 0) +
                (result?.usage?.output_tokens ?? 0),
            costUSD: result?.total_cost_usd ?? null,
            numTurns: result?.num_turns ?? null,
            durationMs: Date.now() - started,
            isError: result?.is_error ?? null,
        };
        appendFileSync(OUT, JSON.stringify(row) + '\n');
        const MARK = { hit: 'HIT   ', around: 'AROUND', miss: 'MISS  ', invalid: 'INVALID' }[s.outcome];
        console.log(
            `${task.padEnd(18)} ${MARK} ${s.diagnosis}\n` +
            `    want: ${expect.join(' | ')}\n` +
            `    got : ${row.route.join(' ') || '(nothing)'}\n` +
            (row.shellCommands.length ? `    shell: ${row.shellCommands[0]}\n` : '') +
            (s.excuse ? `    said : ${s.excuse}\n` : '') +
            (expectServers
                ? `    servers: want ${expectServers.join('+')} · got ${row.serversUsed.join('+') || '(none)'}\n`
                : '') +
            (sk
                ? `    skill: want ${sk.expectSkill.join(' | ')} · got ${sk.skillsInvoked.join(' ') || '(none)'} — ${sk.skillDiagnosis}\n`
                : '') +
            `    calls=${row.calls} billable=${row.billable}`,
        );
    }
}
console.log('done');
finishMeta();
