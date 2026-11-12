/*
 * Records the owner's verdict on one review step in ../../prototype-feedback.md, in the owner's own
 * words, and any item it leaves for the build phase. From the repo root:
 *
 *   node .rptc/plans/datapack-simplification/mockups/flow/log-verdict.mjs \
 *     --step J2-1 --verdict Pass --words "Looks good." [--note "what changed"] [--build "item"]...
 *
 * Refuses a step that reviewSteps.ts does not have, a verdict outside Pass / Change / Fail / Open,
 * and an empty --words: a verdict the owner did not plainly give is never recorded (2026-11-11, a
 * bare "Yes" was once logged as a pass). The step's question comes from reviewSteps.ts.
 *
 * Rows go to the journey's "Walk, Step by Step" table (made if missing); build items go to
 * "Build-Phase Items", tagged with the step. Then reviewDecisions.ts is regenerated, so the
 * prototype's decisions panel shows the verdict beside the step (rebuild with build-j1.js).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeDecisions } from './gen-decisions.mjs';
import { cell, loadJourneys, planDir } from './steps-loader.mjs';

const VERDICTS = ['Pass', 'Change', 'Fail', 'Open'];
const target = join(planDir, 'prototype-feedback.md');
const BUILD_HEADING = '## Build-Phase Items';

function parse(argv) {
    const args = { build: [] };
    for (let i = 0; i < argv.length; i += 2) {
        const [flag, value] = [argv[i], argv[i + 1]];
        if (value === undefined) throw new Error(`${flag} needs a value`);
        if (flag === '--build') args.build.push(value);
        else args[flag.replace(/^--/, '')] = value;
    }
    return args;
}

function fail(message) {
    console.error(`log-verdict: ${message}`);
    process.exit(1);
}

const args = (() => {
    try {
        return parse(process.argv.slice(2));
    } catch (error) {
        return fail(error.message);
    }
})();
const journeys = loadJourneys();
const journey = journeys.find((j) => j.steps.some((s) => s.id === args.step));
const step = journey?.steps.find((s) => s.id === args.step);
if (!step) fail(`no step "${args.step}" in reviewSteps.ts`);
if (!VERDICTS.includes(args.verdict)) fail(`--verdict must be one of ${VERDICTS.join(', ')}`);
if (!args.words?.trim()) fail('--words is required: the owner\'s own words, quoted');

const date = new Date().toISOString().slice(0, 10);
const verdict = args.note ? `**${args.verdict}**: ${args.note}` : `**${args.verdict}**`;
const row = `| ${step.id} | ${cell(step.question)} | ${cell(verdict)} | ${cell(`"${args.words.trim()}"`)} | ${date} |`;

let text = readFileSync(target, 'utf8');
const walkHeading = `### ${journey.id} Walk, Step by Step`;
const buildAt = text.indexOf(`\n${BUILD_HEADING}`);

/** Insert before the build section (always last), or at the end when there is none. */
const insertBeforeBuild = (block) => {
    const at = text.indexOf(`\n${BUILD_HEADING}`);
    text = at === -1 ? `${text.trimEnd()}\n\n${block}\n` : `${text.slice(0, at).trimEnd()}\n\n${block}\n${text.slice(at)}`;
};

if (!text.includes(walkHeading)) {
    insertBeforeBuild(`## ${journey.id}: ${journey.name}\n\n${walkHeading}\n\n| Step | Question | Verdict | Owner's words | Date |\n|---|---|---|---|---|`);
}
// Append the row after the last row of the walk table.
{
    const start = text.indexOf(walkHeading);
    const lines = text.slice(start).split('\n');
    let last = lines.findIndex((l) => l.startsWith('|'));
    while (lines[last + 1]?.startsWith('|')) last += 1;
    lines.splice(last + 1, 0, row);
    text = text.slice(0, start) + lines.join('\n');
}
if (args.build.length) {
    if (buildAt === -1 && !text.includes(`\n${BUILD_HEADING}`)) text = `${text.trimEnd()}\n\n${BUILD_HEADING}\n\nWhat the reviews leave for the build phase, by step. The prototype's decisions panel shows them beside each step.\n`;
    text = `${text.trimEnd()}\n${args.build.map((b) => `- **${step.id}**: ${b.trim()}`).join('\n')}\n`;
}
writeFileSync(target, text);
writeDecisions();
console.log(`logged ${step.id} ${args.verdict}${args.build.length ? ` and ${args.build.length} build item(s)` : ''}`);
