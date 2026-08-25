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
const AGENTS = `${ROOT}/AGENTS.md`;
const ALLOWED = readFileSync(`${AB}/readonly.txt`, 'utf-8').trim().split('\n')
    .map((t) => `mcp__demo-builder__${t}`);

const PROMPTS = [
    ['urls', 'What are the URLs for my demo project?'],
    ['auth', 'Am I signed in to Adobe?'],
    ['health', 'Is my project healthy?'],
    ['datapacks', 'What sample data packs are available?'],
    ['components', 'What components does my project use?'],
];

const VARIANTS = [
    ['control', `${AB}/AGENTS.control.md`],
    ['treatment', `${AB}/AGENTS.treatment.md`],
];

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

for (const [variant, file] of VARIANTS) {
    writeFileSync(AGENTS, readFileSync(file, 'utf-8'));
    for (const [task, prompt] of PROMPTS) {
        const started = Date.now();
        const { calls, result } = await runOnce(prompt);
        const row = {
            variant,
            task,
            calls: calls.length,
            route: calls,
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
        console.log(
            `${variant.padEnd(9)} ${task.padEnd(11)} calls=${row.calls} ` +
            `gcp=${row.calledGetCurrentProject ? 'YES' : 'no '} ` +
            `billable=${row.billable} $${(row.costUSD ?? 0).toFixed(4)}`,
        );
    }
}
console.log('done');
