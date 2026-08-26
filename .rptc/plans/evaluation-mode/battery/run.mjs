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
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';

const AB = new URL('.', import.meta.url).pathname;
const ROOT = `${homedir()}/.demo-builder/projects`;
const ALLOWED = readFileSync(`${AB}/readonly-tools.txt`, 'utf-8').trim().split('\n')
    .map((t) => `mcp__demo-builder__${t}`);

// Bash is allowed ON PURPOSE. The question this battery asks is "what does the
// agent reach for?", and the most important answer is "it went around us" — 25
// hand-built Commerce queries and 4 hand-built page fetches in the corpus. Deny
// Bash and every prompt is forced through our tools, which measures nothing.
ALLOWED.push('Bash', 'WebFetch');

// Every prompt declares the tool that SHOULD answer it. That is the whole idea:
// we know the right route in advance, so "what did it actually use?" becomes a
// score instead of an interpretation. Kept in a file, verbatim, because the
// original six prompts were lost and their run became incomparable.
const PROMPTS = JSON.parse(readFileSync(`${AB}/prompts.json`, 'utf-8'));

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

const OUT = `${AB}/results.jsonl`;
writeFileSync(OUT, '');

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
        const calls = [];
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
                        if (c.type === 'tool_use') calls.push(c.name);
                    }
                }
                if (ev.type === 'result') result = ev;
            }
        });
        child.on('close', () => resolve({ calls, result }));
    });
}

/** Strip the MCP prefix so a route reads as tool names. */
const bare = (n) => n.replace(/^mcp__demo-builder__/, '');

/**
 * Score one run against what we expected.
 *
 * Three outcomes, and the third is the one worth having:
 *   hit    — it used a tool we said should answer this.
 *   around — it went to Bash/WebFetch instead. THE finding: either we have no
 *            tool for the job, or we have one and the agent never found it.
 *   miss   — neither. It answered from something else, or not at all.
 */
function score(calls, expect) {
    const names = calls.map(bare);
    const hit = names.some((n) => expect.includes(n));
    const around = names.some((n) => n === 'Bash' || n === 'WebFetch');
    return { hit, around, outcome: hit ? 'hit' : around ? 'around' : 'miss' };
}

{
    const variant = 'as-shipped';
    for (const { id: task, prompt, expect, why } of PROMPTS) {
        const started = Date.now();
        const { calls, result } = await runOnce(prompt);
        const s = score(calls, expect);
        const row = {
            variant,
            task,
            prompt,
            expect,
            why,
            ...s,
            calls: calls.length,
            route: calls.map(bare),
            calledGetCurrentProject: calls.some((c) => c.endsWith('get_current_project')),
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
        const MARK = { hit: 'HIT   ', around: 'AROUND', miss: 'MISS  ' }[s.outcome];
        console.log(
            `${variant.padEnd(9)} ${task.padEnd(18)} ${MARK} ` +
            `want=${expect.join('|').padEnd(28)} got=${row.route.join(' ') || '(nothing)'} ` +
            `| calls=${row.calls} billable=${row.billable}`,
        );
    }
}
console.log('done');
