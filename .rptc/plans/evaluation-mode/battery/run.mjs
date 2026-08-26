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
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { bare, score } from './score.mjs';

const AB = new URL('.', import.meta.url).pathname;
const ROOT = `${homedir()}/.demo-builder/projects`;
const REPO = new URL('../../../..', import.meta.url).pathname;
const ALLOWED = readFileSync(`${AB}/readonly-tools.txt`, 'utf-8').trim().split('\n')
    .map((t) => `mcp__demo-builder__${t}`);

// The OTHER servers a real project carries. Without these the battery measured a
// world where our tools were the only option, so "the agent went around us" could
// never have meant "it used Playwright instead" — and that is exactly the reading
// AI-1b's answer depends on. Fully-qualified names, read-only only; see the file
// for what is excluded and why.
const OTHER = `${AB}/other-servers-readonly.txt`;
if (existsSync(OTHER)) {
    ALLOWED.push(...readFileSync(OTHER, 'utf-8').split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')));
}

// Bash is allowed ON PURPOSE. The question this battery asks is "what does the
// agent reach for?", and the most important answer is "it went around us" — 25
// hand-built Commerce queries and 4 hand-built page fetches in the corpus. Deny
// Bash and every prompt is forced through our tools, which measures nothing.
ALLOWED.push('Bash', 'WebFetch');

// Every prompt declares the tool that SHOULD answer it. That is the whole idea:
// we know the right route in advance, so "what did it actually use?" becomes a
// score instead of an interpretation. Kept in a file, verbatim, because the
// original six prompts were lost and their run became incomparable.
let PROMPTS = JSON.parse(readFileSync(`${AB}/prompts.json`, 'utf-8'));

// `--only <id>` re-runs ONE prompt, and `--repeat <n>` runs the selection n times.
// Both exist for the same reason: every result here is n=1, and agents are
// stochastic — `datapacks` changed diagnosis between two runs and there was no
// way to tell a regression from a coin flip. Repeating is how you tell.
const only = process.argv[process.argv.indexOf('--only') + 1];
if (process.argv.includes('--only')) {
    if (!only || only.startsWith('--')) { console.error('--only needs a prompt id'); process.exit(2); }
    PROMPTS = PROMPTS.filter((p) => p.id === only);
    if (!PROMPTS.length) { console.error(`no prompt with id "${only}"`); process.exit(2); }
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
const bad = PROMPTS.flatMap(({ id, expect }) =>
    expect.filter((e) => !ALLOWED.includes(`mcp__demo-builder__${e}`)).map((e) => `${id} -> ${e}`));
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

function runOnce(prompt) {
    return new Promise((resolve) => {
        const args = [
            '-p', prompt,
            '--allowed-tools', ...ALLOWED,
            '--permission-mode', 'dontAsk',
            '--output-format', 'stream-json',
            '--verbose',
        ];
        const child = spawn('claude', args, { cwd: ROOT });
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
                        if (c.type === 'tool_use') calls.push({ name: c.name, input: c.input ?? {} });
                        // The agent frequently STATES the gap — "there is no tool
                        // for this, so I will use curl". That sentence is worth
                        // more than any inference we could draw from the route,
                        // and the first version threw it away.
                        else if (c.type === 'text' && c.text?.trim()) said.push(c.text.trim());
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
    for (const { id: task, prompt, expect, why } of PROMPTS) {
        const started = Date.now();
        const { calls, said, results, result } = await runOnce(prompt);
        const s = score(calls, results, said, expect);
        const row = {
            variant,
            task,
            prompt,
            expect,
            why,
            ...s,
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
            `    calls=${row.calls} billable=${row.billable}`,
        );
    }
}
console.log('done');
finishMeta();
