/**
 * Formatting for `scripts/trace-session.mjs`. Counters in, text out.
 *
 * Follows the conventions the other measurement scripts set: deterministic text
 * to stdout so the caller redirects it into `docs/research/<date>-*.md`, and
 * estimates labelled as estimates rather than presented as measurements.
 */

import { taskCost } from './transcript.mjs';

export const num = (n) => Number(n ?? 0).toLocaleString('en-US');

export const pct = (arr, p) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

export function mb(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function reportTasks(tasks, { topTasks, showLabels }) {
    const real = tasks.filter((t) => t.turns > 0);
    if (!real.length) {
        console.log('No tasks with model turns found.\n');
        return real;
    }

    const totals = real.reduce(
        (a, t) => ({
            cost: a.cost + taskCost(t),
            cacheRead: a.cacheRead + t.cacheReadTokens,
            thinking: a.thinking + t.thinkingTokens,
            calls: a.calls + t.toolPath.length,
            errors: a.errors + t.errors,
        }),
        { cost: 0, cacheRead: 0, thinking: 0, calls: 0, errors: 0 }
    );

    console.log('## Tasks\n');
    // Report BOTH counts. The summary used to print only the measurable ones
    // while the control line printed every prompt found, which reads as a
    // discrepancy in the instrument rather than what it is: prompts that never
    // produced a model turn (interrupted immediately, or still in flight).
    const skipped = tasks.length - real.length;
    console.log(
        `  tasks measured           ${num(real.length)} of ${num(tasks.length)} prompts` +
            (skipped ? `   (${num(skipped)} produced no model turn)` : '')
    );
    console.log(
        `  billable tokens          ${num(totals.cost)}   (fresh input + output + cache writes)`
    );
    console.log(
        `  cache reads              ${num(totals.cacheRead)}   (reported, never summed into the above)`
    );
    console.log(`  thinking tokens          ${num(totals.thinking)}`);
    console.log(`  tool calls               ${num(totals.calls)}`);
    console.log(`  errored results          ${num(totals.errors)}`);
    console.log(`  median tokens / task     ${num(pct(real.map(taskCost), 0.5))}`);
    console.log(
        `  median calls / task      ${num(pct(real.map((t) => t.toolPath.length), 0.5))}\n`
    );

    const heaviest = [...real].sort((a, b) => taskCost(b) - taskCost(a)).slice(0, topTasks);
    console.log(`### ${heaviest.length} heaviest tasks\n`);
    for (const t of heaviest) {
        const when = (t.startedAt ?? '').replace('T', ' ').slice(0, 19);
        console.log(
            `  #${String(t.index).padStart(3)}  ${num(taskCost(t)).padStart(9)} tok  ` +
                `${String(t.toolPath.length).padStart(4)} calls  ` +
                `${String(t.toolCounts.size).padStart(3)} distinct  ` +
                `${String(t.errors).padStart(2)} err  ${when}`
        );
        if (showLabels) console.log(`        label: ${t.label}`);
    }
    console.log();
    return real;
}

/**
 * The route the heaviest task took.
 *
 * Consecutive repeats are collapsed: a run of 39 Bash calls is one approach, not
 * 39 decisions. Note what this can and cannot show — with a generic toolset
 * (Bash/Read/Edit) a repeat count says almost nothing, because repetition IS the
 * working style. Repeats become a real signal only for named MCP tools, where
 * calling `list_projects` five times in one task genuinely suggests a retry
 * loop. Read this section for the SHAPE of the route, not as a defect count.
 */
export function reportPath(tasks) {
    const worst = [...tasks].sort((a, b) => taskCost(b) - taskCost(a))[0];
    if (!worst || !worst.toolPath.length) return;
    console.log(`### The route taken by the heaviest task (#${worst.index})\n`);
    const collapsed = [];
    for (const name of worst.toolPath) {
        const last = collapsed[collapsed.length - 1];
        if (last && last.name === name) last.n++;
        else collapsed.push({ name, n: 1 });
    }
    console.log(
        `  ${collapsed.map((c) => (c.n > 1 ? `${c.name}×${c.n}` : c.name)).join(' → ')}\n`
    );
}

export function reportTools(agg) {
    if (agg.toolCalls.size) {
        console.log('## Tools, by real-world call frequency\n');
        const rows = [...agg.toolCalls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
        for (const [name, count] of rows) {
            const keys = [...(agg.argKeys.get(name) ?? [])].sort().join(', ');
            console.log(
                `  ${String(count).padStart(5)}  ${name.padEnd(34)} ${keys ? `args: ${keys}` : ''}`
            );
        }
        console.log();
    }

    if (agg.mcpCalls.size) {
        console.log('## MCP tools — the bytes × frequency work list\n');
        for (const [key, count] of [...agg.mcpCalls.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25)) {
            console.log(`  ${String(count).padStart(5)}  ${key}`);
        }
        console.log();
    } else {
        console.log('## MCP tools\n\n  none — no session in this scope called an MCP tool.\n');
    }
}
