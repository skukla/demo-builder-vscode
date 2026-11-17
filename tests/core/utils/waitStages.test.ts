/**
 * The waits' words (`WAIT_STAGES`, owner 2026-11-08): the progress window's three rows, held to the
 * stage table's rules. A label of 25 characters at most, a detail of 40, an expectation of 25 with
 * the clock after it, and all three written.
 */

import { WAIT_STAGES, type WaitStage } from '@/core/utils/waitStages';

const WAITS: readonly WaitStage[] = Object.values(WAIT_STAGES);

const tooLong = (field: keyof WaitStage, max: number, stages: readonly WaitStage[] = WAITS) =>
    stages.map((stage) => stage[field] ?? '').filter((text) => text.length > max);

describe('WAIT_STAGES', () => {
    it('gives every wait a label and an expectation, and a detail that says something when it has one', () => {
        expect(WAITS.filter((wait) => wait.label.trim() === '' || wait.expectation.trim() === '')).toStrictEqual([]);
        expect(WAITS.filter((wait) => wait.detail !== undefined && wait.detail.trim() === '')).toStrictEqual([]);
    });

    it('words Share and Stop Sharing by the label alone (owner, 2026-11-08)', () => {
        expect(WAIT_STAGES.sharingPack).toStrictEqual({ label: 'Sharing the datapack', expectation: 'Usually a few seconds' });
        expect(WAIT_STAGES.makingPackPrivate).toStrictEqual({ label: 'Making it private', expectation: 'Usually a few seconds' });
    });

    it('keeps labels to 25, details to 40 and expectations to 25 characters', () => {
        expect(tooLong('label', 25)).toStrictEqual([]);
        expect(tooLong('detail', 40)).toStrictEqual([]);
        expect(tooLong('expectation', 25)).toStrictEqual([]);
    });

    it('CONTROL: the length check flags a planted long line, and reads the real table', () => {
        const planted: WaitStage[] = [{ label: 'x'.repeat(26), detail: 'd', expectation: 'e' }];
        expect(tooLong('label', 25, planted)).toStrictEqual(['x'.repeat(26)]);
        expect(WAITS.length).toBeGreaterThan(20);
    });

    it('never says "the store", the words the owner rejected as an AI talking', () => {
        expect(WAITS.filter((wait) => /the store\b/i.test(`${wait.label} ${wait.detail}`))).toStrictEqual([]);
    });

    // Walk F193, then F200 (owner, 2026-11-17): the check before an action does two reads (the edits
    // it would lose, and what it goes back to or puts in), so it is named for the action it prepares;
    // before a save, whose point is the edits, the comparison itself.
    it('names the check by the action it prepares', () => {
        expect(WAIT_STAGES.preparingRestore.label).toBe('Preparing to restore');
        expect(WAIT_STAGES.preparingUninstall.label).toBe('Preparing to uninstall');
        expect(WAIT_STAGES.preparingSwitch.label).toBe('Preparing to switch');
        expect(WAIT_STAGES.preparingInstall.label).toBe('Preparing to install');
        expect(WAIT_STAGES.comparingWithCommerce.label).toBe('Comparing with Commerce');
        expect(WAIT_STAGES).not.toHaveProperty('checkingForChanges');
    });
});
