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

    reportMcpWorkList(agg);
}

/**
 * The bytes × frequency work list the 2026-08-16 backlog item specified.
 *
 * Counts come from `mcp__server__tool` tool_use names — the actual CALLS. The
 * `attributionMcpTool` field counts TURNS instead (the thinking turn before a
 * call, the turn that makes it, the turn that reads the answer), which on a real
 * session read 49 against 13 real calls. Using it as a call count would inflate
 * this table almost fourfold, so it is reported separately and labelled.
 *
 * Sizes are real measured response bytes, joined `tool_use.id` →
 * `tool_result.tool_use_id`. This is the number no fixture can give you: a
 * fixture tells you a payload's SHAPE, never its VOLUME.
 */
function reportMcpWorkList(agg) {
    const mcp = [...agg.toolCalls.entries()]
        .filter(([name]) => name.startsWith('mcp__'))
        .map(([name, calls]) => {
            const stat = agg.toolBytes.get(name) ?? { sizes: [], errors: 0 };
            const [, server, tool] = name.split('__');
            const total = stat.sizes.reduce((a, b) => a + b, 0);
            return {
                label: `${server}/${tool}`,
                calls,
                errors: stat.errors,
                median: pct(stat.sizes, 0.5),
                max: stat.sizes.length ? Math.max(...stat.sizes) : 0,
                total,
            };
        })
        // Ranked by TOTAL bytes returned — frequency × size, which is the axis
        // that decides how much context a tool actually costs a session.
        .sort((a, b) => b.total - a.total);

    if (!mcp.length) {
        console.log('## MCP tools\n');
        console.log('  none — no session in this scope called an MCP tool.');
        console.log('  (Drive the extension through an agent, then re-run: that traffic is');
        console.log('   what this table exists for.)\n');
        return;
    }

    console.log('## MCP tools — bytes × frequency, ranked by total context spent\n');
    console.log('   calls   err     total B    median B       max B  tool');
    for (const r of mcp.slice(0, 25)) {
        console.log(
            `  ${String(r.calls).padStart(6)}  ${String(r.errors).padStart(4)}  ` +
                `${num(r.total).padStart(10)}  ${num(r.median).padStart(10)}  ` +
                `${num(r.max).padStart(10)}  ${r.label}`
        );
    }
    console.log();

    const turns = [...agg.mcpTurns.values()].reduce((a, b) => a + b, 0);
    const calls = mcp.reduce((a, r) => a + r.calls, 0);
    if (turns) {
        console.log(
            `  (attributionMcpTool marks ${num(turns)} TURNS across these ${num(calls)} calls — ` +
                `turns, not calls; not a frequency.)\n`
        );
    }
}
