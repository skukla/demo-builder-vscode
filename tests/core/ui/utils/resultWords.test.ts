/**
 * resultOutcome: a result's sentence ("My Luma Installed", "Couldn't Install My Luma") split at the
 * thing it names, so the window's title names the thing and the body says what happened (owner,
 * 2026-11-17, walk F222). The words stay the owner's; only where they sit changes.
 */

import { resultOutcome } from '@/core/ui/utils/resultWords';

describe('resultOutcome', () => {
    it.each<[string, string, string]>([
        ['My Luma Installed', 'My Luma', 'Installed'],
        ["Couldn't Install My Luma", 'My Luma', "Couldn't Install"],
        ['Release Save Test 2 Is Up to Date', 'Release Save Test 2', 'Up to Date'],
        ["Couldn't Republish the Storefront", 'Storefront', "Couldn't Republish"],
        ['Products Assigned to Test ERP', 'Test ERP', 'Products Assigned'],
        ['Demo Setup Applied for Luma', 'Luma', 'Demo Setup Applied'],
        ['Saved as Luma Copy', 'Luma Copy', 'Saved'],
    ])('splits "%s" at "%s" into "%s"', (sentence, thing, outcome) => {
        expect(resultOutcome(sentence, thing)).toBe(outcome);
    });

    it('keeps the whole sentence when it does not name the thing at either end', () => {
        expect(resultOutcome('No Changes to Save', 'My Luma')).toBe('No Changes to Save');
    });

    it('keeps the whole sentence when there is no thing', () => {
        expect(resultOutcome('Dry Run Passed', undefined)).toBe('Dry Run Passed');
    });

    it('keeps the whole sentence when it is the thing alone', () => {
        expect(resultOutcome('My Luma', 'My Luma')).toBe('My Luma');
    });
});
