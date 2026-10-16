import { expectationLine, stageLine, stepUnder } from '@/core/utils/stageLine';

describe('stageLine', () => {
    it('adds the pair count after the stage', () => {
        expect(stageLine('Deploying the app', { index: 1, total: 2 })).toBe('Deploying the app (1 of 2)');
    });

    it('is the stage alone when the operation is not a pair', () => {
        expect(stageLine('Deploying the app')).toBe('Deploying the app');
    });

    // "(1 of 2)" read as a step count when each part is many steps (owner, 2026-09-21).
    it('names the part instead of counting it, when it has a name', () => {
        expect(stageLine('Adding Adobe services', { index: 1, total: 2, name: 'Northwind ERP' })).toBe(
            'Adding Adobe services · Northwind ERP'
        );
    });
});

// Line 2 under a step (progress vocabulary, owner 2026-10-16): when the step IS the
// job reporting, the name shows once, on line 1.
describe('stepUnder', () => {
    it("is only what follows the step's name when the line repeats it", () => {
        expect(stepUnder('Copying the content', 'Copying the content: 40 of 103 files')).toBe('40 of 103 files');
    });

    it('is the line as it came when it names something else', () => {
        expect(stepUnder('Setting up authoring', 'Building block library')).toBe('Building block library');
    });

    it('is nothing when the line is only the step again, so the caller shows its detail', () => {
        expect(stepUnder('Publishing the pages', 'Publishing the pages')).toBeUndefined();
        expect(stepUnder('Publishing the pages', '')).toBeUndefined();
        expect(stepUnder('Publishing the pages', undefined)).toBeUndefined();
    });
});

// Line 3: the step's expectation and the whole run's clock. The middle dot is the one
// this UI allows (owner, 2026-10-16).
describe('expectationLine', () => {
    it('joins the expectation and the clock', () => {
        expect(expectationLine('Usually about a minute', '3 minutes, 43 seconds')).toBe(
            'Usually about a minute · 3 minutes, 43 seconds'
        );
    });

    it('is whichever one is known when the other is not', () => {
        expect(expectationLine('Usually about a minute', undefined)).toBe('Usually about a minute');
        expect(expectationLine(undefined, '8 seconds')).toBe('8 seconds');
    });

    it('holds the row with a non-breaking space when neither is known', () => {
        expect(expectationLine(undefined, undefined)).toBe(' ');
    });
});
