/**
 * The stage table, and the rule that keeps it true: a component operation reports a
 * STAGE by reference, never as a literal — a literal is a stage with no expectation
 * line, and one that silently loses it the day its wording changes.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
    OPERATION_STAGES,
    detailFor,
    expectationFor,
} from '@/features/app-builder/services/operationStages';

const ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * The files whose progress calls report STAGES. The App Management installer and
 * uninstaller are deliberately absent: what they report is the STEP under the
 * runner's install/remove stage, and their messages carry live detail (retry rounds).
 */
const STAGE_REPORTERS = [
    'src/features/app-builder/services/appBuilderComponentRunner.ts',
    'src/features/app-builder/services/appDeployment.ts',
    'src/features/dashboard/handlers/appBuilderComponentHandlers.ts',
    'src/features/dashboard/handlers/appManagementInstallHandlers.ts',
];

/** A progress call whose FIRST argument is a string or template literal. */
const LITERAL_STAGE = /\b(?:onProgress\??\.?|report)\(\s*[`'"]/;

describe('OPERATION_STAGES', () => {
    // The detail is row 2, shown when a report names no step of its own. A stage
    // without one left that row blank, and the modal read as two lines with a gap
    // (owner, 2026-09-19).
    it('gives every stage a label, an expectation and a detail', () => {
        for (const stage of Object.values(OPERATION_STAGES)) {
            expect(stage.label.trim()).not.toBe('');
            expect(stage.expectation.trim()).not.toBe('');
            expect(stage.detail.trim()).not.toBe('');
        }
    });

    // The label is the SHORT set: it is all a background notification shows, after a
    // title that already takes ~29 of the ~64 characters VS Code draws before cutting
    // the line off (owner screenshot, 2026-09-19). The detail is the long set.
    it('keeps every label to 25 characters, so a notification shows it whole', () => {
        const long = Object.values(OPERATION_STAGES)
            .map((stage) => stage.label)
            .filter((label) => label.length > 25);

        expect(long).toEqual([]);
    });

    it('never gives two stages the same label, so a lookup is unambiguous', () => {
        const labels = Object.values(OPERATION_STAGES).map((stage) => stage.label);

        expect(new Set(labels).size).toBe(labels.length);
    });
});

describe('expectationFor', () => {
    it("returns a stage's expectation from its label", () => {
        expect(expectationFor(OPERATION_STAGES.deployingApp.label)).toBe('Usually 1–2 minutes');
    });

    it('returns nothing for a stage the table does not name, rather than a guess', () => {
        expect(expectationFor('Doing something new…')).toBeUndefined();
    });
});

describe('detailFor', () => {
    it("returns a stage's detail from its label", () => {
        expect(detailFor(OPERATION_STAGES.subscribingApis.label)).toBe(OPERATION_STAGES.subscribingApis.detail);
    });

    it('returns nothing for a stage the table does not name', () => {
        expect(detailFor('Doing something new…')).toBeUndefined();
    });
});

describe('stage reporters', () => {
    it.each(STAGE_REPORTERS)('%s reports stages by reference, not as literals', (file) => {
        const offending = readFileSync(join(ROOT, file), 'utf8')
            .split('\n')
            .map((line, i) => ({ line: line.trim(), at: i + 1 }))
            .filter(({ line }) => !line.startsWith('*') && !line.startsWith('//'))
            .filter(({ line }) => LITERAL_STAGE.test(line))
            .map(({ line, at }) => `${file}:${at}  ${line}`);

        expect(offending).toStrictEqual([]);
    });

    it('control: the pattern catches a literal stage', () => {
        expect(LITERAL_STAGE.test("deps.onProgress?.('Subscribing Adobe APIs…');")).toBe(true);
        expect(LITERAL_STAGE.test("report('Checking requirements…');")).toBe(true);
        expect(LITERAL_STAGE.test('report(OPERATION_STAGES.adding.label);')).toBe(false);
    });
});
