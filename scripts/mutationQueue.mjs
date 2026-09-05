#!/usr/bin/env node
/**
 * Turn the mutation baseline into a QUEUE OF GOALS for the overnight runner.
 *
 *   node scripts/mutationQueue.mjs --limit 30        # the 30 highest-consequence modules
 *   node scripts/mutationQueue.mjs --limit 30 --dry  # print the order, write nothing
 *
 * WHY GENERATED. The plan's step 6: work the queue by CONSEQUENCE, not by score — what
 * breaks a consultant's existing work. That ordering is a rule, and a hand-written queue
 * of 600 modules would be out of date the morning after the first night. This reads the
 * baseline, ranks by the rule, and writes `scripts/overnight/queue` plus one goal file
 * per batch, so re-running it after a night's work produces the next night's queue.
 *
 * THE ORDER. Areas first, in the sequence the plan names — updates and rollback, auth,
 * project state, then the operation this repo calls non-negotiable (reset), the
 * lifecycle commands, prerequisites, project creation — then every other area. Within
 * an area, most open gaps first. A module already at zero is never queued.
 *
 * BATCHES OF FIVE. One `claude -p "/goal …"` session per batch: enough that a session
 * has real work, few enough that a context overflow — which CLEARS a goal outright —
 * loses one batch, not the night. The 4,000-character cap on a goal condition is the
 * other bound on batch size.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

import { profile, tierOf } from './mutationScope.mjs';

const BASELINE = 'reports/mutation/baseline.json';
const QUEUE = 'scripts/overnight/queue';
const GOALS = 'scripts/overnight/goals';
const BATCH = 5;

/** Consequence order — what breaks an SC's existing work, then everything else. */
const AREA_ORDER = [
    'features/updates',
    'features/authentication',
    'core/state',
    'features/eds/services/reset',
    'features/lifecycle',
    'features/prerequisites',
    'features/project-creation',
    'features/eds',
    'features/dashboard',
    'features/projects-dashboard',
    'features/data-installer',
    'features/components',
    'features/mesh',
    'features/app-builder',
    'features/ai',
];

const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
};
const LIMIT = Number(arg('--limit', '30'));
const DRY = process.argv.includes('--dry');

function areaRank(path) {
    const p = path.replace(/^src\//, '');
    const i = AREA_ORDER.findIndex((a) => p.startsWith(a + '/'));
    return i === -1 ? AREA_ORDER.length : i;
}

function rankedModules() {
    const rows = JSON.parse(readFileSync(BASELINE, 'utf8')).modules;
    return Object.entries(rows)
        .map(([path, r]) => ({ path, ...r, tier: tierOf(profile(path)), area: areaRank(path) }))
        .filter((r) => r.openGaps > 0)
        .sort((a, b) => a.area - b.area || b.openGaps - a.openGaps);
}

function goalText(batchName, mods) {
    const list = mods
        .map((m) => `  - ${m.path}  (${m.tier}, ${m.score}%, ${m.openGaps} open gaps)`)
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

THE CYCLE, one module at a time — never two measurements at once (the focus configs are
single generated files and collide):
  1. node scripts/focusModule.mjs <module>
  2. npx stryker run stryker.focus.config.json > /tmp/focus.txt 2>&1
     Start it in the BACKGROUND and read the module while it runs — a measurement is a
     fifth of a session and nothing blocks on it. Wait on \`Done in\`, never on
     \`mutation score\`: Stryker capitalises it, so a case-sensitive match never fires
     (16 minutes lost that way, 2026-09-04).
  3. node scripts/mutationWorklist.mjs         — the decisions nothing constrains, ranked
  4. write the tests (or the ledger entries), run them
  5. re-measure (1–2), then \`node scripts/checkMutationBaseline.mjs --report
     reports/mutation/focus.json\` — the ratchet must hold; padding means a log-string test
  6. the same command with \`--write "<what changed>"\` once it holds
  7. PASTE the module's new row: score, survived, noCoverage, equivalent, openGaps —
     the evaluator reads only what you surface.

A mutant revealing a REAL defect or dead code may be fixed in src/ — say so, with the
reason, in the commit. Any other src/ change is out of scope.

NEVER kill a mutant by asserting a logger call's arguments (\`expect(logger.x)
.toHaveBeenCalledWith(...)\`). That pins wording, not behaviour, and an enforcer refuses
any file whose count rises. If the only observable difference is which log line prints,
the mutant belongs in the ledger. Add rows with \`node scripts/mutationLedger.mjs add ...\`
— it writes the file's own format and refuses an anchor that does not resolve.

RULES. Stay on the current work branch; never checkout or merge develop. One commit per
module, \`Backlog: PL-22\` trailer. No cloud writes. No attribution trailers.

CHECK PER MODULE, SCOPED: this module's suites, both typecheckers, eslint on the files
you changed. Capture each exit code in a variable, never through a pipe. Commit on green.

PUSH ONCE, WHEN THE BATCH IS DONE — the pre-push hook then runs the full gate against
committed state, which a scoped run cannot replace. If it refuses, fix and push again;
nothing has left the machine. NEVER \`--no-verify\`. Gating every module the heavy way
cost 95 minutes of one run on 2026-09-05: the same suite twice per module.

WORK THE BATCH TO THE END — no turn budget; a turn count fired in four batches on
2026-09-04 and was right in none. Stop early only on evidence: two consecutive checks
failing the same way (say which), or a module whose openGaps will not move across two
measure cycles — commit what it gained and go to the NEXT module.

FINISH by pasting the batch table ONCE, at the end: module, openGaps before, after, tests
added, ledger rows added.
`;
}

function main() {
    const ranked = rankedModules();
    const chosen = ranked.slice(0, LIMIT);
    const batches = [];
    for (let i = 0; i < chosen.length; i += BATCH) batches.push(chosen.slice(i, i + BATCH));

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
    const tooLong = goals.filter((g) => g.text.length > 4000);
    if (tooLong.length) {
        throw new Error(
            `the 4,000-character cap is exceeded by ${tooLong.length} batch(es), nothing written: ` +
                tooLong.map((g) => `${g.name} at ${g.text.length}`).join(', ')
        );
    }
    for (const g of goals) writeFileSync(`${GOALS}/${g.name}.goal`, g.text);
    const names = goals.map((g) => g.name);
    writeFileSync(
        QUEUE,
        `# GENERATED by scripts/mutationQueue.mjs — re-run it, do not edit. Order is by\n` +
            `# consequence (updates, auth, state, reset, lifecycle, prerequisites, creation, …),\n` +
            `# then by open gaps. ${new Date().toISOString().slice(0, 10)}, ${chosen.length} modules.\n\n` +
            names.join('\n') +
            '\n'
    );
    console.log(`\nwrote ${QUEUE} and ${names.length} goal file(s) under ${GOALS}/`);
}

main();
