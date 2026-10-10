#!/usr/bin/env node
/**
 * Turn the mutation baseline into a QUEUE OF GOALS for the overnight runner.
 *
 *   node scripts/mutationQueue.mjs --limit 30        # the next 30 modules, in queue order
 *   node scripts/mutationQueue.mjs --limit 30 --dry  # print the order, write nothing
 *
 * WHY GENERATED. The plan's step 6: work the queue by CONSEQUENCE, not by score — what
 * breaks a consultant's existing work. That ordering is a rule, and a hand-written queue
 * of 600 modules would be out of date the morning after the first night. This reads the
 * baseline, ranks by the rule, and writes `scripts/overnight/queue` plus one goal file
 * per batch, so re-running it after a night's work produces the next night's queue.
 *
 * THE ORDER. Anything left in a HIGH-CONSEQUENCE area first — updates and rollback, auth,
 * project state, reset, the lifecycle commands, prerequisites, project creation — then
 * everything else. Within each group, most open gaps first. A module at zero is never
 * queued.
 *
 * It used to rank all fifteen areas, and that rule finished its job on 2026-09-05: every
 * one of the seven above reached zero. What the full ranking did after that was hold back
 * throughput and mis-sort the remainder, because a module in NO listed area sorted last —
 * and that bucket held 103 modules, 2,452 gaps, and `extension.ts` (the entry point, 858
 * lines, 9% covered) queued behind everything.
 *
 * Size ordering is what the measurements argue for. Per-module cost is dominated by a
 * fixed toll — one focused measurement, a re-measure, the scoped check, a commit — that
 * a 2-gap module pays in full. Over 61 modules on 2026-09-05: modules with 1-5 gaps closed
 * 1.0 gaps/minute, those with 100+ closed 13.7, while the median time only moved from 2.5
 * to 10.6 minutes. Biggest-first therefore front-loads roughly five times the progress per
 * hour; it does not change the total, since every module is worked either way.
 *
 * The high-consequence group is KEPT, not deleted, and it is not a dead rule: it matches
 * nothing today only because those areas are finished. New gaps landing in auth or project
 * state jump the queue again, which is the protection the plan asked for.
 *
 * BATCHES OF FIVE. One `claude -p "/goal …"` session per batch: enough that a session
 * has real work, few enough that a context overflow — which CLEARS a goal outright —
 * loses one batch, not the night. The 4,000-character cap on a goal condition is the
 * other bound on batch size.
 */
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { fileURLToPath } from 'url';

import { profile, tierOf } from './mutationScope.mjs';

const BASELINE = 'reports/mutation/baseline.json';
const QUEUE = 'scripts/overnight/queue';
const GOALS = 'scripts/overnight/goals';
// Modules per batch. This number tracks WHICH COST DOMINATES and has now moved three times.
// At the tail of the first burn-down a batch was 11 minutes of Stryker setup against 3
// minutes of writing tests, so 10 amortised the setup. The five modules the attribution
// fixes exposed carried 156 gaps between them, 80 in one, so the WORK dominated and 1 kept a
// context overflow from taking a whole goal with it. The four left now hold 13 gaps between
// them — setup dominates again, and four separate sessions would spend 44 minutes of
// startup on an hour's worth of nothing.
const BATCH = 10;
// The cap on a goal condition. 4,000 is ENFORCED BY `/goal` ITSELF, which refuses a
// longer condition outright: "Goal condition is limited to 4000 characters (got 4402)".
// Raised to 4,600 on 2026-09-05 on the strength of the DELIVERY path — the runner passes
// the text as a shell argument and ARG_MAX here is 1,048,576 — which measured the wrong
// layer and stopped a batch from starting. Do not raise it again; buy room by trimming.
const CAP = 3900; // 100 under what `/goal` enforces — exactly-4000 is untested

/**
 * The areas whose breakage costs an SC existing work. A module here is worked before any
 * other, whatever its size — the plan's consequence rule, kept at the width where it earns
 * its cost. Everything outside this list is ordered by size alone.
 */
const HIGH_CONSEQUENCE = [
    'features/updates',
    'features/authentication',
    'core/state',
    'features/eds/services/reset',
    'features/lifecycle',
    'features/prerequisites',
    'features/project-creation',
];

const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
};
const LIMIT = Number(arg('--limit', '30'));
const DRY = process.argv.includes('--dry');

/** 0 for a module whose breakage costs existing work, 1 for everything else. */
export function consequenceRank(path) {
    const p = path.replace(/^src\//, '');
    return HIGH_CONSEQUENCE.some((a) => p.startsWith(a + '/')) ? 0 : 1;
}

function rankedModules() {
    const rows = JSON.parse(readFileSync(BASELINE, 'utf8')).modules;
    return Object.entries(rows)
        .map(([path, r]) => ({
            path,
            ...r,
            tier: tierOf(profile(path)),
            area: consequenceRank(path),
        }))
        .filter((r) => r.openGaps > 0)
        .sort((a, b) => a.area - b.area || b.openGaps - a.openGaps);
}

/** A module's size as the measurement budget counts it: every mutant in its row. */
const mutantsIn = (m) => (m.killed ?? 0) + (m.survived ?? 0) + (m.noCoverage ?? 0) + (m.timeout ?? 0);

/**
 * The condition one batch's session is given.
 *
 * Each module is listed with its MUTANT count as well as its gaps, because that is the
 * number `mutationMeasure.mjs` budgets on: a session can see which modules fit one
 * measurement together (under 400) without measuring to find out. A batch is therefore
 * always measurable whatever it holds — one module at a time at worst — so the batch
 * size above does not need to know about the budget.
 */
export function goalText(batchName, mods) {
    const list = mods
        .map((m) => `  - ${m.path}  (${m.openGaps} open gaps, ${mutantsIn(m)} mutants)`)
        .join('\n');
    return `Work backlog item PL-70 — the mutation burn-down, batch ${batchName}. Bring each
of these modules to ZERO open gaps, in this order:

${list}

READ scripts/overnight/BURNDOWN.md FIRST. It carries the evidence for every rule below —
what each has cost when skipped, and the traps that have burned real time. Read it once;
it does not change between batches.

DONE, per module: its \`openGaps\` row in reports/mutation/baseline.json reads 0. Every
surviving or uncovered behavioural mutant is KILLED by a test asserting the decision
(assert the ARGUMENTS a collaborator receives — a mock cannot see a malformed call) or
RECORDED in scripts/mutation-equivalents.ledger.json with why none can. The score is not
the target. Never ledger to reach zero faster.

FIRST, PER MODULE: rename sibling suites named for a FUNCTION rather than the file —
\`suitesFor\` matches filenames, so their kills count for nothing. Confirm by imports, and
that the suite DRIVES the module rather than reading its text. Reject cross-cutting ones.

MEASURE ONLY WITH \`npm run test:mutation:measure -- <module(s)>\`. It focuses, runs
Stryker under a 12-minute limit, cleans up and prints ONE final line; exit 0 measured,
124 timed out, 2 refused. A group over 400 mutants is refused: split it. Modules under
~20 gaps share a run. One module over 400: alone, with \`--timeout-min 30\`.

THE CYCLE — never two measurements at once (the focus configs are single files):
  1. npm run test:mutation:measure -- <module(s)>      PASTE its final line
  2. mutants left uncovered? \`npm run test:mutation:measure -- --widen\`
  3. node scripts/mutationWorklist.mjs      — the decisions nothing constrains, ranked
  4. write the tests (or ledger rows with \`node scripts/mutationLedger.mjs add ...\`)
  5. measure again, then \`node scripts/checkMutationBaseline.mjs --report
     reports/mutation/focus.json\`; add \`--write "<what changed>"\` once the ratchet holds
  6. PASTE the module's row: score, survived, noCoverage, equivalent, openGaps.

NEVER run Stryker directly, or jest with \`--detectOpenHandles\`, \`--detectLeaks\` or
\`--watch\`. NEVER wait in a loop for output: a command returns or its timeout ends it.

BEFORE DIAGNOSING anything that looks like a known problem (memory, a hang, slowness):
grep .rptc/research/, docs/, BURNDOWN.md and the config's comments, and say what you found.

A mutant revealing a REAL defect or dead code may be fixed in src/ — say so in the commit.
NEVER kill a mutant by asserting a logger call's arguments; that pins wording, and an
enforcer refuses any file whose count rises.

RULES. Stay on the work branch; never checkout or merge develop. One commit per module,
\`Backlog: PL-70\` trailer, committed with an EXPLICIT pathspec
(\`git commit -- <your paths>\`), never bare \`git commit\` or \`-a\`. No cloud writes. No
attribution trailers.

CHECK PER MODULE, SCOPED: its suites, both typecheckers, eslint on changed files, and
\`npm run validate:test-file-sizes\`. Exit codes in variables, never a pipe. Commit on green.

PUSH ONCE, WHEN THE BATCH IS DONE — the pre-push hook then runs the full gate. If it
refuses, fix and push again; nothing has left the machine. NEVER \`--no-verify\`.

WORK THE BATCH TO THE END — no turn budget. Stop early only on evidence: two consecutive
checks failing the same way, or openGaps not moving across two measure cycles.

FINISH with the batch table ONCE: module, openGaps before/after, tests, ledger rows.
`;
}

/**
 * Up to BATCH modules per batch, and FEWER when their paths would push the goal over the
 * cap.
 *
 * The cap is on the rendered text, but the only part that varies is the module list — five
 * long paths cost more than five short ones. A fixed five therefore made the generator's
 * headroom depend on which modules happened to sort together, and it fell to 13 characters
 * on 2026-09-05. Refusing is safe (nothing is written), but the overnight driver
 * regenerates the queue at the start of every run, so a refusal does not degrade — it
 * stops the loop until someone shortens a paragraph.
 *
 * Dropping the last module into the next batch costs nothing: the queue is regenerated
 * from the baseline each run, so a batch of four just means the fifth is worked next.
 */
export function packBatches(chosen) {
    const batches = [];
    let current = [];
    for (const m of chosen) {
        const candidate = [...current, m];
        // `MUT-01` is only a placeholder for measuring — every name is the same length.
        if (current.length && goalText('MUT-01', candidate).length > CAP) {
            batches.push(current);
            current = [m];
        } else {
            current = candidate;
        }
        if (current.length === BATCH) {
            batches.push(current);
            current = [];
        }
    }
    if (current.length) batches.push(current);
    return batches;
}

function main() {
    const ranked = rankedModules();
    const chosen = ranked.slice(0, LIMIT);
    const batches = packBatches(chosen);

    console.log(`modules with open gaps: ${ranked.length}   queued: ${chosen.length} in ${batches.length} batch(es)\n`);
    batches.forEach((b, i) => {
        console.log(`MUT-${String(i + 1).padStart(2, '0')}`);
        for (const m of b) console.log(`   ${String(m.openGaps).padStart(4)} gaps  ${String(m.score).padStart(6)}%  ${m.tier.padEnd(13)} ${m.path.replace('src/', '')}`);
    });
    if (DRY) return;

    if (!existsSync(GOALS)) mkdirSync(GOALS, { recursive: true });

    // Render and CHECK every batch before writing any of them. Writing as we went left
    // four goals on the new template and four on the old when batch five ran five
    // characters over (2026-09-05) — a half-updated queue is worse than a refusal,
    // because the runner reads it happily and the sessions disagree about the rules.
    const goals = batches.map((b, i) => {
        const name = `MUT-${String(i + 1).padStart(2, '0')}`;
        return { name, text: goalText(name, b) };
    });
    // `packBatches` already keeps every batch under the cap; this is the backstop for a
    // single module whose own line cannot fit, which packing cannot solve by splitting.
    const tooLong = goals.filter((g) => g.text.length > CAP);
    if (tooLong.length) {
        throw new Error(
            `the ${CAP}-character cap is exceeded by ${tooLong.length} batch(es), nothing written: ` +
                tooLong.map((g) => `${g.name} at ${g.text.length}`).join(', ')
        );
    }
    for (const g of goals) writeFileSync(`${GOALS}/${g.name}.goal`, g.text);
    const names = goals.map((g) => g.name);

    // Drop goals this run no longer produces. A smaller --limit used to leave the tail of
    // a previous, larger run on disk, so the directory held a mix of two orderings with
    // nothing saying which was which (2026-09-05). The queue file lists only `names`, so a
    // stale goal is unreachable rather than wrong — but it reads as current to anyone
    // looking, and that is how a half-updated queue gets trusted.
    for (const f of readdirSync(GOALS)) {
        const m = /^(MUT-\d+)\.goal$/.exec(f);
        if (m && !names.includes(m[1])) rmSync(`${GOALS}/${f}`);
    }
    writeFileSync(
        QUEUE,
        `# GENERATED by scripts/mutationQueue.mjs — re-run it, do not edit. Order is by\n` +
            `# open gaps, most first, after anything left in a high-consequence area\n` +
            `# (updates, auth, state, reset, lifecycle, prerequisites, creation) — all of\n` +
            `# which reached zero on 2026-09-05. ${new Date().toISOString().slice(0, 10)}, ${chosen.length} modules.\n\n` +
            names.join('\n') +
            '\n'
    );
    console.log(`\nwrote ${QUEUE} and ${names.length} goal file(s) under ${GOALS}/`);
}

// Only when RUN, never when imported. `consequenceRank` is exported so it can be tested,
// and a bare `main()` meant importing it regenerated the live queue as a side effect —
// which is exactly what happened the first time it was imported (2026-09-05), rewriting
// the running queue at the wrong --limit.
const RUN_DIRECTLY =
    !!process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (RUN_DIRECTLY) main();
