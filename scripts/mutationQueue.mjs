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
const BATCH = 5;
const CAP = 4000; // the hard limit on a goal condition

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

function goalText(batchName, mods) {
    const list = mods
        .map((m) => `  - ${m.path}  (${m.openGaps} open gaps)`)
        .join('\n');
    return `Work backlog item PL-22 — the mutation burn-down, batch ${batchName}. Bring each of
these modules to ZERO open gaps, in this order:

${list}

WHAT DONE MEANS, per module: its \`openGaps\` row in reports/mutation/baseline.json reads 0.
Every surviving or uncovered behavioural mutant is either KILLED by a test asserting the
decision (assert the ARGUMENTS a collaborator receives, not the mock's answer — a mock
cannot see a malformed call) or RECORDED in scripts/mutation-equivalents.ledger.json with
why no test can kill it. The score is not the target: a module can be done at 60% and
neglected at 90%. Never ledger a mutant to reach zero faster — the ledger is for what
CANNOT be killed, not what you did not get to.

FIRST, PER MODULE: sibling suites named for a FUNCTION, not the file, are invisible to
\`suitesFor\` — their kills count for nothing. Check imports, rename to
\`<module>-<topic>.test.ts\`. Took importHandlers.ts 151 gaps to 62. See PL-45.

THE CYCLE, one module at a time — never two measurements at once (the focus configs are
single generated files and collide):
  1. node scripts/focusModule.mjs <module>
  2. npx stryker run stryker.focus.config.json > /tmp/focus.txt 2>&1
     Start it in the BACKGROUND and read the module while it runs — nothing blocks on
     it. Wait on \`Done in\`, never \`mutation score\`: Stryker capitalises it, so a
     case-sensitive match never fires (16 minutes lost, 2026-09-04).
  3. node scripts/mutationWorklist.mjs         — the decisions nothing constrains, ranked
  4. write the tests (or the ledger entries), run them
  5. re-measure (1–2), then \`node scripts/checkMutationBaseline.mjs --report
     reports/mutation/focus.json\` — the ratchet must hold; padding means a log-string test
  6. the same command with \`--write "<what changed>"\` once it holds
  7. PASTE the module's new row: score, survived, noCoverage, equivalent, openGaps —
     the evaluator reads only what you surface.

A mutant revealing a REAL defect or dead code may be fixed in src/ — say so, with the
reason, in the commit. Any other src/ change is out of scope.

NEVER kill a mutant by asserting a logger call's arguments — that pins wording, not
behaviour, and an enforcer refuses any file whose count rises. If the only observable
difference is which log line prints, it belongs in the ledger. Add rows with
\`node scripts/mutationLedger.mjs add ...\`; it refuses an anchor that does not resolve.

RULES. Stay on the current work branch; never checkout or merge develop. One commit per
module, \`Backlog: PL-22\` trailer, committed with an EXPLICIT pathspec
(\`git commit -- <your paths>\`), never bare \`git commit\` or \`-a\`: \`git mv\` self-stages
and swept work into two unrelated commits on 2026-09-05. No cloud writes. No
attribution trailers.

CHECK PER MODULE, SCOPED: this module's suites, both typecheckers, eslint on changed
files, and \`npm run validate:test-file-sizes\` — 750 lines blocks CI, and a suite hit
779 on 2026-09-05. Exit codes in variables, never a pipe. Commit only on green.

PUSH ONCE, WHEN THE BATCH IS DONE — the pre-push hook then runs the full gate, which a
scoped run cannot replace. If it refuses, fix and push again; nothing has left the
machine. NEVER \`--no-verify\`. Gating every module the heavy way cost 95 minutes of one
run on 2026-09-05.

WORK THE BATCH TO THE END — no turn budget; a turn count fired in four batches on
2026-09-04 and was right in none. Stop early only on evidence: two consecutive checks
failing the same way (say which), or openGaps not moving across two measure cycles —
commit what it gained and go to the NEXT module.

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
function packBatches(chosen) {
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
