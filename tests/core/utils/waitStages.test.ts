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

    // Walk F114: the re-import's comparison, the replace's check and Remove Data's check are one read.
    // F126: its line says since when, in the question's own words, not which pack.
    it('names the changes check one way', () => {
        expect(WAIT_STAGES.checkingForChanges).toEqual({
            label: 'Checking for your changes',
            expectation: 'Usually about a minute',
        });
    });
});
