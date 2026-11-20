/*
 * Writes reviewDecisions.ts from ../../prototype-feedback.md: every verdict row and build item,
 * keyed by review step, so the prototype can show the decisions made at a step beside that step's
 * own window while the owner clicks through the journey (owner, 2026-11-11: "a click-through
 * journey that encapsulates all of the decisions made", not a page of screenshots).
 *
 *   node .rptc/plans/datapack-simplification/mockups/flow/gen-decisions.mjs [--check]
 *
 * log-verdict.mjs runs it after every verdict. Rebuild the prototype afterwards (build-j1.js).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { here, loadJourneys, planDir } from './steps-loader.mjs';

const target = join(here, 'reviewDecisions.ts');

/** A table row's cells, with escaped pipes kept inside their cell. */
const cells = (line) => line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, '|'));

/** Markdown bold and code marks dropped: the panel shows plain text. */
const plain = (s) => (s ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');

export function renderDecisions() {
    const ids = loadJourneys().flatMap((j) => j.steps.map((s) => s.id));
    const lines = readFileSync(join(planDir, 'prototype-feedback.md'), 'utf8').split('\n');
    const decisions = Object.fromEntries(ids.map((id) => [id, { verdicts: [], build: [] }]));
    for (const line of lines) {
        if (line.startsWith('|')) {
            const c = cells(line);
            // "J1-3b" or "J1-3b (keep reasons)"; never "J1.3", the earlier scenario ids.
            const match = /^(J\d+-[0-9a-z]+)(?: \((.+)\))?$/.exec(c[0] ?? '');
            if (!match || !decisions[match[1]]) continue;
            decisions[match[1]].verdicts.push({ topic: match[2] ?? '', asked: plain(c[1]), verdict: plain(c[2]), words: plain(c[3]), date: c[4] ?? '' });
        } else {
            const match = /^- \*\*(J\d+-[0-9a-z]+)\*\*: (.+)$/.exec(line);
            if (match && decisions[match[1]]) decisions[match[1]].build.push(plain(match[2]));
        }
    }
    return `/*
 * Generated from prototype-feedback.md by gen-decisions.mjs. Do not edit by hand: log a verdict
 * with log-verdict.mjs, or run gen-decisions.mjs after editing the log.
 */

/** One verdict at a step, as the log records it. */
export interface StepVerdict {
    /** What part of the step it settled, when a step had several ("keep reasons"); empty for the step itself. */
    topic: string;
    /** What was put to the owner. */
    asked: string;
    /** Pass, Change, Fail or Open, and what was decided or made. */
    verdict: string;
    /** The owner's own words. */
    words: string;
    date: string;
}

export interface StepDecisions {
    verdicts: StepVerdict[];
    /** What the step leaves for the build phase. */
    build: string[];
}

export const DECISIONS: Record<string, StepDecisions> = ${JSON.stringify(decisions, null, 4)};
`;
}

export function writeDecisions() {
    writeFileSync(target, renderDecisions());
    return target;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const next = renderDecisions();
    if (process.argv.includes('--check')) {
        let current = '';
        try {
            current = readFileSync(target, 'utf8');
        } catch {
            current = '';
        }
        if (current !== next) {
            console.error('reviewDecisions.ts is out of date with prototype-feedback.md: run gen-decisions.mjs');
            process.exit(1);
        }
        console.log('reviewDecisions.ts matches prototype-feedback.md');
    } else {
        console.log(`wrote ${writeDecisions()}`);
    }
}
