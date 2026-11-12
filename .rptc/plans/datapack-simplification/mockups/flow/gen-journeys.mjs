/*
 * Writes ../../journeys.md from reviewSteps.ts, the one list of review steps the prototype's step
 * switcher also reads. Run after changing a step (from the repo root):
 *
 *   node .rptc/plans/datapack-simplification/mockups/flow/gen-journeys.mjs
 *
 * `--check` writes nothing and exits 1 when journeys.md is out of date.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cell, loadJourneys, planDir } from './steps-loader.mjs';

const target = join(planDir, 'journeys.md');

function render(journeys) {
    const built = (j) => j.steps.some((s) => s.window);
    const lines = [
        '# Journeys: Review Guide',
        '',
        '<!-- Generated from mockups/flow/reviewSteps.ts by mockups/flow/gen-journeys.mjs. Do not edit by hand: change the steps there and run it. -->',
        '',
        'The owner reviews one journey at a time, one step at a time, and answers one question per step.',
        'Verdicts go to `prototype-feedback.md` in the owner\'s words (`log-verdict.mjs`). Each journey names',
        'the plan section it comes from, so a verdict that changes the plan can be traced back.',
        '',
        'Prototype: http://127.0.0.1:26839/proto-j1.html. Pick a step in the panel\'s Step menu.',
        '',
        'Tools, all in `mockups/flow/` (run from the repo root):',
        '',
        '| Tool | Does |',
        '|---|---|',
        '| Start the J<n> Guided Tour (one button per built journey, top of the screen) | **The journey review.** Points at each next action in the product; doing it moves the tour on; each stop shows what was decided there. Its stops are `j1Tour.ts`, `j2Tour.ts` and `j3Tour.ts`, whose decided lines come from `reviewSteps.ts` |',
        '| Check All Steps (panel button) | Opens every built step and reports any window that grows or scrolls, every window of a step included (J2\'s run, then its small result); results also in `window.__CHECK__` |',
        '| `log-verdict.mjs` | Records a verdict in the owner\'s own words (`--words` required) and any build item (`--build`) |',
        '| Decisions panel (left of the window) | What was decided at the step on screen (its `decided` list in `reviewSteps.ts`, updated with each verdict), what it leaves for the build phase, and the verdict history in the owner\'s words. Shown when a step is opened from the Step menu, hidden during the tour |',
        '| `gen-decisions.mjs` | Writes the panel\'s data (`reviewDecisions.ts`) from `prototype-feedback.md`; `log-verdict.mjs` runs it |',
        '| `gen-journeys.mjs` | Writes this file from `reviewSteps.ts`; `--check` fails when it is out of date |',
        '',
        'When feedback needs a change (owner, 2026-11-11):',
        '',
        '| Kind of feedback | When it is settled |',
        '|---|---|',
        '| Small fix: words, remove something, move something | During the step; the owner moves on |',
        '| Needs new design | Logged as open; settled with the journey\'s other open items after its last step, before the next journey starts |',
        '| Exception | Settled at once when later steps in the same journey depend on it |',
        '',
        '| Journey | What the SC is doing | Status |',
        '|---|---|---|',
        ...journeys.map((j) => `| ${j.id} | ${cell(j.summary)} | ${built(j) ? 'Built' : 'To build'} |`),
    ];
    for (const j of journeys) {
        lines.push('', `## ${j.id}: ${j.name}`, '', `Plan: overview.md, ${cell(j.plan)}.`, '', '| Step | Title | Do this | Judge this one thing |', '|---|---|---|---|');
        for (const s of j.steps) lines.push(`| ${s.id} | ${cell(s.title)}${s.window ? '' : ' (to build)'} | ${cell(s.action)} | ${cell(s.question)} |`);
    }
    return `${lines.join('\n')}\n`;
}

const next = render(loadJourneys());
const current = readFileSync(target, 'utf8');
if (process.argv.includes('--check')) {
    if (next !== current) {
        console.error('journeys.md is out of date with reviewSteps.ts: run gen-journeys.mjs');
        process.exit(1);
    }
    console.log('journeys.md matches reviewSteps.ts');
} else {
    writeFileSync(target, next);
    console.log(`wrote ${target}`);
}
