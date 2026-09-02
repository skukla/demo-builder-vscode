/**
 * Every quality instrument this repo owns, in one list.
 *
 * WHY IT EXISTS. Auditing the tooling on 2026-08-29 found ~50 instruments across
 * six layers and NO index of them. Nothing in `docs/` named a single executable
 * scan; the bullet list in the root CLAUDE.md was the de facto index and was
 * missing three skills. The consequences were not theoretical:
 *
 *  - `agent-gap-scan` and `ai-coverage-scan` were in no list, no hook, no CI and
 *    no npm script. They were reachable only by browsing the folder.
 *  - `validate:test-guidelines` had been FAILING, silently, because nothing ran
 *    it — and the failure was a bug in the validator itself. Its export detector
 *    missed `export class`, `export ASYNC function`, and re-exports, so it
 *    called a file with six exports and eight importers empty. An unrun check
 *    does not stay correct; it just stops telling you it is wrong.
 *  - `docs:check` called a Python file that no longer existed. It could not have
 *    succeeded, and never ran, so nobody found out. (Deleted the same day, along
 *    with `scripts/hooks.js` — all three of its commands were equally dead.)
 *
 * Those are three different failures with one cause: an instrument that nothing
 * lists and nothing runs decays without producing a signal. A registry alone
 * would decay the same way, so the point is not this file — it is
 * `tooling-registry.test.ts`, which fails the build when disk and registry
 * disagree in EITHER direction. Adding a scan without registering it is a red
 * test; deleting one without deregistering is also a red test.
 *
 * WHY TYPESCRIPT AND NOT JSON. The repo's own rule: an object literal in a
 * `.mjs` or a `.json` has opted out of the only check that works. This file is
 * covered by `npm run typecheck:tests`, which CI runs.
 */

/** What kind of thing this is — determines where the enforcer looks for it. */
export type InstrumentKind =
    /** A PreToolUse rule in `.claude/hooks/rules/`. */
    | 'hook-rule'
    /** A shell hook in `.claude/hooks/`. */
    | 'hook-script'
    /** An enforcer suite in `tests/sop/`. */
    | 'sop-test'
    /** A skill directory under `.claude/skills/`. */
    | 'skill'
    /** A script in `package.json`. */
    | 'npm-script'
    /**
     * A measurement instrument living under `.rptc/` — a census, a metric, an
     * audit gate. These are the tools the consolidation program runs ON itself,
     * and they were invisible to everything until 2026-08-29.
     */
    | 'rptc-instrument';

/**
 * How often it runs — the axis that matters, because it says who is responsible
 * for running it. Anything not `automatic` depends on a person remembering, and
 * that is precisely where this repo's tooling rotted.
 */
export type Cadence =
    /** Fires on every matching tool call. Nobody has to remember. */
    | 'per-tool-call'
    /** Runs inside `jest`, so on every test run and in CI. */
    | 'per-jest-run'
    /** Wired into the CI workflow. */
    | 'per-push'
    /** Release cuts / sweeps. Run by `npm run sweep`. */
    | 'periodic'
    /** Invoked by a human or an agent when the situation calls for it. */
    | 'on-demand';

/**
 * Whether the exit code means anything.
 *
 * This distinction was missing from the first version of the registry and the
 * sweep immediately proved why: `ai-coverage-scan` reported a 34% agent-surface
 * gap, exited 0 as it always does, and the runner printed "clean". A tool that
 * ran and whose output nobody read is the exact failure this whole system exists
 * to stop — reproduced, on day one, by the system itself.
 *
 * Verified rather than assumed: none of the five scan scripts contains a literal
 * non-zero exit (checked with a positive control that found 1 and 3 in files
 * that do). Their exit code is always 0, so it can never be evidence.
 */
export type ResultKind =
    /** Exit code is meaningful: zero means clean, non-zero means a real failure. */
    | 'gate'
    /** Always exits 0. The OUTPUT is the result, so it must always be shown. */
    | 'report';

export interface Instrument {
    /** The on-disk name: directory, filename, or npm script key. */
    readonly id: string;
    readonly kind: InstrumentKind;
    readonly cadence: Cadence;
    /** Required wherever `runs` is set — see {@link ResultKind}. */
    readonly resultKind?: ResultKind;
    /** One line, plain: what it catches. */
    readonly what: string;
    /**
     * The command that runs it, or `null` when the cadence makes it automatic.
     * `npm run sweep` executes exactly the `periodic` entries that name one.
     */
    readonly runs: string | null;
    /**
     * Set when an instrument is deliberately NOT wired to anything automatic,
     * with the reason. Anything else that is `on-demand` shows up in the
     * registry report as unwired, which is the state we want to see.
     */
    readonly unwiredReason?: string;
    /**
     * Running it MUTATES tracked files. Such an instrument is never run by
     * `npm run sweep`, and a test enforces that.
     *
     * Learned by doing it: `classify.mjs` was run blind on 2026-08-29 to find out
     * whether it still worked. It rewrites the audit ledger, and took it from 998
     * rows to 5. Nothing in the file's name, its output, or any list said it
     * wrote anything — because no list existed. Git had the rows, so it cost
     * minutes; a sweep that ran it on a schedule would have cost the audit.
     */
    readonly writes?: boolean;
    /** Repo-relative path, for instruments identified by file rather than name. */
    readonly path?: string;
}

/**
 * The periodic tier — the scans. This is the layer that had no automation and no
 * index, so it is the layer `npm run sweep` exists to run.
 */
const PERIODIC: readonly Instrument[] = [
    {
        id: 'clones:check',
        kind: 'npm-script',
        cadence: 'periodic',
        resultKind: 'gate',
        what: 'the duplication burn-down: every duplicate block in tests/ is fixed or carries a written reason, and a reason for code that no longer duplicates has to leave',
        runs: 'npm run clones:check',
    },
    {
        id: 'health',
        kind: 'npm-script',
        cadence: 'periodic',
        resultKind: 'report',
        what: 'one reading of codebase health across duplication, mutation, debt ledgers and enforcement — appended to a time series so runs can be compared',
        runs: 'npm run health',
    },
    {
        id: 'dead-mock-scan',
        kind: 'skill',
        cadence: 'periodic',
        resultKind: 'report',
        what: 'jest.mock calls that do nothing — redundant automocks (static) and mocks no test needs (scoped probe)',
        runs: 'bash .claude/skills/dead-mock-scan/scan.sh tests',
    },
    {
        id: 'dead-code-scan',
        kind: 'skill',
        cadence: 'periodic',
        resultKind: 'report',
        what: 'unused exports (ts-prune) and docs naming symbols that no longer exist',
        runs: 'bash .claude/skills/dead-code-scan/scan.sh src',
    },
    {
        id: 'circular-dependency-scan',
        kind: 'skill',
        cadence: 'periodic',
        resultKind: 'report',
        what: 'import cycles (madge), and how to break them',
        runs: 'bash .claude/skills/circular-dependency-scan/scan.sh src',
    },
    {
        id: 'code-duplication-scan',
        kind: 'skill',
        cadence: 'periodic',
        resultKind: 'report',
        what: 'copy-paste LOGIC duplication (jscpd) that should be one function',
        runs: 'bash .claude/skills/code-duplication-scan/scan.sh src',
    },
    {
        id: 'docs:adr-check',
        kind: 'npm-script',
        cadence: 'periodic',
        resultKind: 'gate',
        what: "every path and identifier an ADR names either resolves, or is DECLARED under its `## Reference notes` with a reason; every row of the index's routing table points at an ADR section that still exists; and every ADR's status starts with one of the four vocabulary words",
        runs: 'npm run docs:adr-check',
    },
    {
        id: 'rptc-hygiene-scan',
        kind: 'skill',
        cadence: 'periodic',
        resultKind: 'report',
        what: 'rot in the RECORD: backlog index drift, shipped plans never moved, citations naming deleted files',
        runs: 'bash .claude/skills/rptc-hygiene-scan/scan.sh',
    },
    {
        id: 'ai-coverage-scan',
        kind: 'skill',
        cadence: 'periodic',
        resultKind: 'report',
        what: 'which features an agent can reach: the human surface (handler types) minus the agent surface (MCP tools)',
        runs: 'bash .claude/skills/ai-coverage-scan/scan.sh',
    },
];

/**
 * Guided reviews. Real instruments, but their output is judgement rather than a
 * exit code, so they cannot be part of an automated sweep — a script cannot
 * decide whether two things SHOULD be one thing.
 */
const JUDGEMENT: readonly Instrument[] = [
    {
        id: 'architecture-duplication-scan',
        kind: 'skill',
        cadence: 'periodic',
        what: 'competing implementations of the same job; resolved by deleting one',
        runs: null,
        unwiredReason: 'guided review — the verdict is judgement, not an exit code',
    },
    {
        id: 'component-extraction-scan',
        kind: 'skill',
        cadence: 'periodic',
        what: 'UI markup duplicated across 3+ sites that should be one component',
        runs: null,
        unwiredReason: 'guided review — the verdict is judgement, not an exit code',
    },
    {
        id: 'call-path-audit',
        kind: 'skill',
        cadence: 'periodic',
        what: 'proves a user action has ONE definitive path to its ground-truth primitive',
        runs: null,
        unwiredReason:
            'guided review, per-action; its verdicts are pinned in spine-chokepoints.test.ts',
    },
    {
        id: 'test-divergence-scan',
        kind: 'skill',
        cadence: 'periodic',
        what: 'how many DIFFERENT ways the suite builds the same fake',
        runs: null,
        unwiredReason: 'guided review over a generated census',
    },
    {
        id: 'mutation-test-pilot',
        kind: 'skill',
        cadence: 'periodic',
        what: 'Stryker mutation testing over a 4-module pilot scope — the only instrument that measures whether the tests would CATCH a defect rather than whether they executed a line',
        runs: 'npm run test:mutation',
        resultKind: 'report',
    },
    {
        id: 'test:mutation:focus',
        kind: 'npm-script',
        cadence: 'periodic',
        what: 'Stryker over ONE module — 3 minutes instead of the sample\'s 16, so a survivor can be killed and re-measured inside a working session rather than a release cut',
        runs: 'npm run test:mutation:focus',
        resultKind: 'report',
    },
    {
        id: 'test:mutation:worklist',
        kind: 'npm-script',
        cadence: 'periodic',
        what: 'turns a Stryker report into the ranked list of DECISIONS nothing constrains — dropping log lines, log-only branches and non-decisions, because a score is not a thing anyone can act on',
        runs: 'npm run test:mutation:worklist',
        resultKind: 'report',
    },
    {
        id: 'test-strategy-scan',
        kind: 'skill',
        cadence: 'periodic',
        what: "the release-cut read of the test suite's STRATEGY: runs the three censuses (craft, queue, ledger) together and says which of their columns actually track defects",
        runs: null,
        unwiredReason:
            'guided review; it INTERPRETS three registered instruments rather than adding a check of its own, and three of their columns are known not to track defects',
    },
    {
        id: 'agent-gap-scan',
        kind: 'skill',
        cadence: 'periodic',
        what: 'tools nobody calls and jobs agents did with Bash, read from real session transcripts',
        runs: null,
        unwiredReason: 'reads Claude Code transcripts outside the repo; not reproducible in CI',
    },
    {
        id: 'tool-verdicts',
        kind: 'skill',
        cadence: 'periodic',
        what: 'per-tool keep/fix/investigate verdict from transcript usage AND battery outcomes',
        runs: null,
        unwiredReason: 'needs battery results as input; run after a battery sweep',
    },
    {
        id: 'ai-bundle-coherence',
        kind: 'skill',
        cadence: 'periodic',
        what: 'do real projects AI bundles match their shape (live half)',
        runs: null,
        unwiredReason:
            'needs real projects on disk; the static half runs every commit in tests/templates/',
    },
    {
        id: 'codebase-sweep',
        kind: 'skill',
        cadence: 'periodic',
        what: 'the release-cut umbrella: runs the mechanical scans together and triages the hits',
        runs: null,
        unwiredReason: 'orchestrates the others; npm run sweep is its scripted half',
    },
    {
        id: 'dream',
        kind: 'skill',
        cadence: 'periodic',
        what: 'staleness in memory, skills and CLAUDE.md, mined from recent transcripts',
        runs: null,
        unwiredReason: 'reads transcripts outside the repo; proposes, never applies',
    },
];

/**
 * npm scripts that check something. `per-push` means CI runs it; anything else
 * here is a check a human invokes.
 *
 * Two of these were orphaned before the registry existed — `validate:jest-config`
 * and `validate:eslint-rules` worked fine and nothing ran them, while
 * `validate:test-guidelines` was outright failing unseen. They are wired into
 * `npm run sweep` now, which is why the failure is visible.
 */
const NPM_CHECKS: readonly Instrument[] = [
    {
        id: 'lint',
        kind: 'npm-script',
        cadence: 'per-push',
        resultKind: 'gate',
        what: 'eslint over the whole repo — the check a scoped local lint misses',
        runs: 'npm run lint',
    },
    {
        id: 'typecheck:tests',
        kind: 'npm-script',
        cadence: 'per-push',
        resultKind: 'gate',
        what: 'typechecks the test tree, so a fixture cannot invent a shape',
        runs: 'npm run typecheck:tests',
    },
    {
        id: 'validate:tsc-blindspots',
        kind: 'npm-script',
        cadence: 'per-push',
        resultKind: 'gate',
        what: 'files tsc silently skips through basename shadowing (index.ts beats index.tsx)',
        runs: 'npm run validate:tsc-blindspots',
    },
    {
        id: 'validate:test-file-sizes',
        kind: 'npm-script',
        cadence: 'per-push',
        resultKind: 'gate',
        what: 'test files past the 750-line CI limit',
        runs: 'npm run validate:test-file-sizes',
    },
    {
        id: 'validate:jest-config',
        kind: 'npm-script',
        cadence: 'periodic',
        resultKind: 'gate',
        what: 'jest config drift',
        runs: 'npm run validate:jest-config',
    },
    {
        id: 'validate:eslint-rules',
        kind: 'npm-script',
        cadence: 'periodic',
        resultKind: 'gate',
        what: 'eslint rule config drift',
        runs: 'npm run validate:eslint-rules',
    },
    {
        id: 'validate:test-guidelines',
        kind: 'npm-script',
        cadence: 'periodic',
        resultKind: 'gate',
        what: 'test files that break the documented guidelines (its own export detector was buggy while unrun)',
        runs: 'npm run validate:test-guidelines',
    },
    {
        id: 'eds:drift',
        kind: 'npm-script',
        cadence: 'on-demand',
        resultKind: 'gate',
        what: 'did the external contracts EDS builds on move since the last release',
        runs: 'npm run eds:drift',
        unwiredReason:
            'needs interactive credentials; wired into CI it would fail on missing env and get disabled',
    },
    {
        id: 'data-installer:drift',
        kind: 'npm-script',
        cadence: 'on-demand',
        resultKind: 'gate',
        what: 'datapack contract drift',
        runs: 'npm run data-installer:drift',
        unwiredReason: 'needs interactive credentials — same reason as eds:drift',
    },
];

/**
 * Skills that TEACH rather than scan — how to do a job correctly. They have no
 * cadence in the sweep sense; they load when the work calls for them.
 */
const AUTHORING: readonly Instrument[] = (
    [
        ['gate', 'the inner-loop quality gate: scoped jest + tsc + eslint'],
        ['cut-release', 'the VSIX beta release process'],
        ['worktree-setup', 'create/relocate a worktree and start the preview loop'],
        ['adobe-org-context', 'the canonical IMS org/auth model for any org guard'],
        ['eds-publish-and-config', 'Helix/DA.live/Config Service auth and scoping traps'],
        ['eds-dropin-vendoring', 'dropin delivery, import maps, B2B template rules'],
        ['webview-command-handler', 'add an extension-to-webview message end to end'],
        ['wizard-step-authoring', 'add or modify wizard steps and Build-Your-Project areas'],
        [
            'appbuilder-component-authoring',
            'App Builder catalog entries and the deploy/subscribe spine',
        ],
        [
            'ai-context-authoring',
            'change the generated AI bundle without stranding existing projects',
        ],
        ['mcp-tool-authoring', 'add an in-extension MCP tool'],
        ['mcp-live-probe', 'call the RUNNING MCP server over its socket'],
        ['spectrum-webview-ui', 'load-bearing Spectrum/webview UI gotchas'],
        ['webview-test-authoring', 'write or fix a React/Spectrum webview test'],
        ['debug-log-triage', 'parse a pasted Debug Logs dump'],
        ['adobe-docs-lookup', 'route an Adobe docs question to the source that has it'],
        ['decompose-god-file', 'split an oversized file without breaking its public API'],
        ['backlog-item', 'read and write the backlog through one CLI'],
        ['unattended-loop', 'the owner-away working mode'],
        ['reuse-first', 'find the house component before building a new one'],
        ['ask-the-tool', 'let tsc, jest and eslint decide which sites a mechanical refactor must touch, instead of reading each one'],
    ] as const
).map(
    ([id, what]): Instrument => ({
        id,
        kind: 'skill',
        cadence: 'on-demand',
        what,
        runs: null,
        unwiredReason: 'authoring guidance — loads when the work calls for it, nothing to schedule',
    })
);

/**
 * The consolidation program's own instruments — how we measure whether the ADRs
 * are landing. Every one lived under `.rptc/` reachable from nothing until
 * 2026-08-29, and the cost was concrete: `program-metrics.mjs`, the program's
 * impact meter, had been CRASHING since the ADR-015/017 split moved `hookRefs`
 * to the webview ledger (cf49e8fbd), and nobody knew, because nothing ran it.
 *
 * Note how many of these WRITE. That is why they are on-demand rather than in
 * the sweep, and why `writes` is a required part of the record.
 */
const PROGRAM_INSTRUMENTS: readonly Instrument[] = [
    {
        id: 'check-ledger',
        kind: 'rptc-instrument',
        cadence: 'periodic',
        resultKind: 'gate',
        path: '.rptc/plans/pattern-conformance-audit/harness/check-ledger.mjs',
        what: "the ADR-015 audit's done-gate: every unit accounted for, or exit non-zero",
        runs: 'node .rptc/plans/pattern-conformance-audit/harness/check-ledger.mjs',
    },
    {
        id: 'program-metrics',
        kind: 'rptc-instrument',
        cadence: 'on-demand',
        resultKind: 'report',
        path: '.rptc/plans/pattern-conformance-audit/harness/program-metrics.mjs',
        what: "the convergence program's impact meter — one dated snapshot; impact is the diff between two",
        runs: 'node .rptc/plans/pattern-conformance-audit/harness/program-metrics.mjs',
        writes: true,
        unwiredReason:
            'writes a dated snapshot + re-runs the censuses; run at program checkpoints, not on a schedule',
    },
    {
        id: 'craft-census',
        kind: 'rptc-instrument',
        cadence: 'on-demand',
        resultKind: 'report',
        path: '.rptc/plans/pattern-conformance-audit/harness/craft-census.mjs',
        what: 'every suite classified against the accepted test-craft patterns and double styles (ADR-016)',
        runs: 'node .rptc/plans/pattern-conformance-audit/harness/craft-census.mjs',
        writes: true,
        unwiredReason: 'writes craft-census.json',
    },
    {
        id: 'test-census',
        kind: 'rptc-instrument',
        cadence: 'on-demand',
        resultKind: 'report',
        path: '.rptc/plans/pattern-conformance-audit/harness/test-census.mjs',
        what: 'for each ADR-015 queue file, can its tests OBJECT to a bad refactor, or would they pass regardless',
        runs: 'node .rptc/plans/pattern-conformance-audit/harness/test-census.mjs',
        writes: true,
        unwiredReason: 'writes test-census.json',
    },
    {
        id: 'classify',
        kind: 'rptc-instrument',
        cadence: 'on-demand',
        resultKind: 'report',
        path: '.rptc/plans/pattern-conformance-audit/harness/classify.mjs',
        what: 'fills the audit ledger with one verdict per (unit, pattern)',
        runs: 'node .rptc/plans/pattern-conformance-audit/harness/classify.mjs',
        writes: true,
        unwiredReason:
            'REWRITES ledger.json wholesale — running it blind cost 998 rows on 2026-08-29',
    },
    {
        id: 'webview-visual-baseline',
        kind: 'skill',
        cadence: 'on-demand',
        resultKind: 'report',
        path: '.claude/skills/webview-visual-baseline/build-fixtures.mjs',
        what: 'computed-style fingerprint of every webview — the baseline that makes an ADR-018 CSS change provable',
        runs: 'node .claude/skills/webview-visual-baseline/build-fixtures.mjs <outdir>',
        writes: true,
        unwiredReason:
            'takes an output directory and drives a browser — a person reads the diff. Moved out of .rptc/research on 2026-08-29: PL-21 runs it repeatedly, and a research folder is where findings live, not instruments',
    },
];

/**
 * `.rptc/` executables that are deliberately NOT instruments — one-shot probes
 * answering a question that is now answered, and migration scripts for work that
 * has shipped. Listed so a NEW parked script forces a decision rather than
 * joining them silently.
 *
 * Same shape as every other ledger here: it may shrink, and each row says why.
 */
export const NON_INSTRUMENT_SCRIPTS: Readonly<Record<string, string>> = {
    '.rptc/research/probe-config.mjs':
        'one-shot research probe; its question is answered in the writeup beside it',
    '.rptc/research/agent-activity-visibility/probe-server.mjs':
        'one-shot probe for AI-2c, which shipped',
    '.rptc/research/consent-in-the-chat/probe-elicit.mjs':
        'one-shot MCP elicitation probe; answered in AI-7',
    '.rptc/research/consent-in-the-chat/probe-capabilities.mjs':
        'one-shot MCP capability probe; answered in AI-7',
    '.rptc/complete/frontend-architecture-cleanup/update-imports.sh':
        'migration script for completed work',
    '.rptc/complete/frontend-architecture-cleanup/update-test-imports.sh':
        'migration script for completed work',
    '.rptc/complete/frontend-architecture-cleanup/usage-analyzer.sh':
        'migration script for completed work',
    '.rptc/plans/pattern-conformance-audit/harness/denominators.sh':
        'helper invoked by the censuses, not a standalone instrument',
    '.rptc/plans/pattern-conformance-audit/harness/kinds.mjs':
        'shared classifier library imported by the censuses',
    '.rptc/plans/pattern-conformance-audit/harness/sample.mjs':
        'sampling helper for spot-checking a census',
    '.rptc/plans/evaluation-mode/battery/sweep.sh':
        'the AI battery entry point — named in the cut-release skill',
    '.rptc/plans/evaluation-mode/battery/run.mjs': 'battery internals, invoked by sweep.sh',
    '.rptc/plans/evaluation-mode/battery/score.mjs': 'battery internals',
    '.rptc/plans/evaluation-mode/battery/score.test.mjs': "the battery scorer's own tests",
    '.rptc/plans/evaluation-mode/battery/enumerate-tools.mjs': 'battery internals',
    '.rptc/plans/evaluation-mode/battery/tier2-harness.mjs': 'battery internals',
    '.rptc/plans/evaluation-mode/battery/verify-coverage.mjs': 'battery internals',
    '.rptc/plans/evaluation-mode/journeys/run-erp-roundtrip.sh':
        'a single named journey, run deliberately',
};

export const INSTRUMENTS: readonly Instrument[] = [
    ...PERIODIC,
    ...JUDGEMENT,
    ...NPM_CHECKS,
    ...AUTHORING,
    ...PROGRAM_INSTRUMENTS,
];

/** The periodic tier that `npm run sweep` can actually execute. */
/**
 * May `npm run sweep` run this unattended?
 *
 * Exported as a PREDICATE rather than folded into the filter below, so a test can
 * hand it a writer and watch it say no. The first version of this rule was tested
 * as `sweepable().filter(i => i.writes)` — empty by construction, a test that
 * could not fail. Flipping `classify` (a writer) to `periodic` passed every
 * check; only planting that mutation revealed it.
 */
export function isSweepable(i: Instrument): boolean {
    // A writer is EXCLUDED however it is otherwise classified. A sweep is
    // something you run without thinking about it; an instrument that rewrites an
    // audit ledger is not.
    return i.cadence === 'periodic' && i.runs !== null && !i.writes;
}

export function sweepable(): readonly Instrument[] {
    return INSTRUMENTS.filter(isSweepable);
}
