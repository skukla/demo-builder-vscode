/**
 * The dev-pipeline toolbox entries Demo Builder declares in `.pipeline.yaml` `tools:`.
 *
 * Not a second registry: `toolingRegistry.ts` says what each instrument IS and how
 * often it runs, and `tooling-registry.test.ts` holds it to the disk. This module only
 * TURNS that registry into toolbox entries, so a new instrument with a command becomes
 * a tool and a deleted one stops being one; `toolbox-tools.test.ts` fails when
 * `.pipeline.yaml` and this list disagree.
 *
 * The toolbox's own rules (dev-pipeline thread, 2026-11-21) shape every entry:
 * - `run` is split into words and run with no shell, from the repo root. No pipes,
 *   `&&`, `cd`, redirects, globs or `$VAR`. A call's arguments are appended.
 * - A direct call stops after 900 seconds; `job_start` has no limit. Long runs
 *   (the sweep, the battery, the mutation runs) go through `job_start`.
 * - A job runs on a COPY of the repo unless `copy: false`. A tool that writes a
 *   tracked file (a result, a ledger, a periodic `last:` date in `.pipeline.yaml`)
 *   must run on the real tree, or what it wrote is deleted with the copy.
 * - `listed: false` keeps a tool out of the 25-tool list; `run_tool` reaches it, and
 *   `run_tool` with no arguments lists them.
 *
 * Credentials never go in `run`: `.pipeline.yaml` is public. The drift checks read
 * their variables from the session's environment and refuse to run without them.
 */

import { INSTRUMENTS } from './toolingRegistry';

export interface ToolboxTool {
    /** Lowercase letter first, then lowercase, digits and underscores; 41 characters at most. */
    readonly name: string;
    readonly run: string;
    readonly about: string;
    /** False for a tool that writes tracked files; absent for a read-only one. */
    readonly copy?: false;
}

/** The two tools declared by hand before this list existed; both stay listed. */
export const LISTED_BY_HAND: readonly string[] = ['compile', 'ledger'];

/** Registry instruments that write tracked files, so they must not run on a copy. */
const WRITES_TRACKED = new Set([
    'health',
    'css:cycle',
    'test:mutation:sweep',
    'mutation-test-pilot',
    'test:mutation:focus',
    'test:mutation:measure',
    'validate:convention-proofs',
    'eds:drift',
    'data-installer:drift',
    'webview-visual-baseline',
]);

/**
 * Commands a registry entry states for a person, rewritten for the toolbox. A
 * placeholder becomes "pass it as an argument"; the shell `eval` becomes the script.
 * An instrument whose command needs neither is used as written.
 */
const RUN_FOR_TOOLBOX: Readonly<Record<string, string | null>> = {
    // Already declared by hand as `ledger` (python3 scripts/ledger.py), the same job.
    ledger: null,
    'test:mutation:measure': 'npm run test:mutation:measure --',
    'webview-visual-baseline': 'bash .claude/skills/webview-visual-baseline/serve.sh',
};

/** Runners that are not instruments themselves but are how instruments get run. */
const RUNNERS: readonly ToolboxTool[] = [
    {
        name: 'sweep',
        run: 'npm run sweep',
        about: 'Every scripted periodic check, from the registry. About 15 minutes: start it with job_start',
        copy: false,
    },
    {
        name: 'test_divergence_scan',
        run: 'node .claude/skills/test-divergence-scan/scan.mjs tests',
        about: 'How many different ways the suite builds the same fake',
        copy: false,
    },
    {
        name: 'battery',
        run: 'bash .rptc/plans/evaluation-mode/battery/sweep.sh',
        about: 'The full prompt battery: tier 1, skills, tier 2, coverage gates. Needs a live dev host; minutes, so job_start',
        copy: false,
    },
    {
        name: 'battery_run',
        run: 'node .rptc/plans/evaluation-mode/battery/run.mjs',
        about: 'Run battery prompts; pass --only id,id or --tier2. Needs a live dev host',
        copy: false,
    },
    {
        name: 'mcp_probe',
        run: 'node .claude/skills/mcp-live-probe/probe.mjs',
        about: 'Talk to the running MCP server: info, list, schema <tool>, call <tool> <json>',
    },
    {
        name: 'check_ledger',
        run: 'node .rptc/plans/pattern-conformance-audit/harness/check-ledger.mjs',
        about: 'Every src file has an adjudicated dependency-injection verdict (test-strategy-scan)',
    },
    {
        name: 'node_resolve_check',
        run: 'npm run node:resolve -- --check',
        about: 'The Node version Demo Builder ships on still matches every component (cut-release precondition)',
    },
    {
        name: 'docs_tools',
        run: 'npm run docs:tools',
        about: 'Regenerate docs/systems/mcp-tools.md from the tool registrations',
        copy: false,
    },
];

/** A registry id as a toolbox name: `test:mutation:sweep` becomes `test_mutation_sweep`. */
export function toolName(id: string): string {
    return id.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** One line, no double quotes: the YAML parser reads `about` as a quoted string. */
function aboutOf(what: string): string {
    const line = what.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
    return line.length > 160 ? `${line.slice(0, 157).trimEnd()}...` : line;
}

/** The toolbox entries, in a stable order: registry instruments first, then runners. */
export function toolboxTools(): ToolboxTool[] {
    const fromRegistry: ToolboxTool[] = [];
    for (const instrument of INSTRUMENTS) {
        const run =
            instrument.id in RUN_FOR_TOOLBOX ? RUN_FOR_TOOLBOX[instrument.id] : instrument.runs;
        if (!run) continue;
        fromRegistry.push({
            name: toolName(instrument.id),
            run,
            about: aboutOf(instrument.what),
            ...(WRITES_TRACKED.has(instrument.id) ? { copy: false as const } : {}),
        });
    }
    return [...fromRegistry, ...RUNNERS];
}

/** The `.pipeline.yaml` line for one entry, as `toolbox-tools.test.ts` expects it. */
export function yamlLine(tool: ToolboxTool): string {
    const copy = tool.copy === false ? ', copy: false' : '';
    return `  ${tool.name}: { run: ${tool.run}, about: "${tool.about}", listed: false${copy} }`;
}
