/**
 * The removal confirm's decisions, without React: what it shows for what the read found, and what
 * each of its buttons sends (Save and Remove, Remove Without Saving), with the Save As name when
 * the demo's pack is not the SC's (`.rptc/plans/datapack-save-as/`).
 */

import type { DatapackRemovalChanges } from '@/features/data-installer/removalChanges';
import {
    FRESH_CHOICE,
    confirmContent,
    recordedRemovalLines,
    removalAnswer,
    removeLabel,
    saveAsNameOf,
    toggleAlways,
} from '@/features/data-installer/ui/components/removalConfirm';
import type { DataInstallerFailure } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';

const SENTENCE = '3 items changed since install: the category Critical Power, and 2 products.';
/** The demo's pack is the SC's own: saving goes into it. */
const CHANGED_MINE: DatapackRemovalChanges = { count: 3, kinds: [], sentence: SENTENCE, packName: 'Acme Bodea', alwaysSave: false };
/** The demo's pack is a team pack: saving makes a new pack, starting from this name. */
const CHANGED_TEAM: DatapackRemovalChanges = { count: 3, kinds: [], sentence: SENTENCE, alwaysSave: false };
const NOTHING: DatapackRemovalChanges = { count: 0, kinds: [], alwaysSave: false };
const FAILED: DataInstallerFailure = { message: 'The store could not be read.' };

describe('confirmContent', () => {
    it('is the plain confirm when nothing changed', () => {
        expect(confirmContent(NOTHING, null)).toEqual({ kind: 'plain' });
    });

    it('is the plain confirm when the setting is on and nothing changed', () => {
        expect(confirmContent({ ...NOTHING, alwaysSave: true }, null)).toEqual({ kind: 'plain' });
    });

    it("names the SC's pack the changes go into", () => {
        expect(confirmContent(CHANGED_MINE, null)).toEqual({ kind: 'changes', sentence: SENTENCE, packName: 'Acme Bodea' });
    });

    it("names no pack when the pack is not the SC's: Save As's name starts empty", () => {
        expect(confirmContent(CHANGED_TEAM, null)).toEqual({ kind: 'changes', sentence: SENTENCE });
    });

    it("says only that they will be saved when the setting answers and the pack is the SC's", () => {
        expect(confirmContent({ ...CHANGED_MINE, alwaysSave: true }, null)).toEqual({ kind: 'will-save', packName: 'Acme Bodea' });
    });

    it("still asks when the setting answers but the pack is not the SC's: a save needs a name", () => {
        expect(confirmContent({ ...CHANGED_TEAM, alwaysSave: true }, null).kind).toBe('changes');
    });

    it('never reads a failed read as nothing changed', () => {
        expect(confirmContent(null, FAILED)).toEqual({ kind: 'read-failed', reason: FAILED.message });
    });

    it('does not show transport text when no answer came back', () => {
        expect(confirmContent(null, { message: 'Request timeout: get-datapack-removal-changes', unanswered: true })).toEqual({ kind: 'read-failed', reason: 'The check took too long to answer.' });
    });

    it('believes the failure over an answer left by an earlier read', () => {
        expect(confirmContent(CHANGED_MINE, FAILED).kind).toBe('read-failed');
    });
});

describe('the box and the name', () => {
    it('start with always off and no name typed', () => {
        expect(FRESH_CHOICE).toEqual({ always: false });
    });

    it('turns always on and off', () => {
        expect(toggleAlways(toggleAlways(FRESH_CHOICE))).toEqual({ always: false });
        expect(toggleAlways(FRESH_CHOICE)).toEqual({ always: true });
    });

    it('takes the name typed, trimmed; it starts empty, as Create Datapack\'s does', () => {
        const team = confirmContent(CHANGED_TEAM, null);
        expect(saveAsNameOf(team, FRESH_CHOICE)).toBe('');
        expect(saveAsNameOf(team, { always: false, saveAsName: '  My Bodea ' })).toBe('My Bodea');
        expect(saveAsNameOf(team, { always: false, saveAsName: '' })).toBe('');
    });
});

describe('removalAnswer', () => {
    const mine = confirmContent(CHANGED_MINE, null);
    const team = confirmContent(CHANGED_TEAM, null);

    it("keeps into the SC's pack on Save and Remove", () => {
        expect(removalAnswer(mine, FRESH_CHOICE, true)).toEqual({ changes: 'keep' });
    });

    it('drops on Remove Without Saving', () => {
        expect(removalAnswer(mine, { always: true }, false)).toEqual({ changes: 'drop' });
    });

    it("asks for the setting only when always is ticked, and only for the SC's own pack", () => {
        expect(removalAnswer(mine, { always: true }, true)).toEqual({ changes: 'keep', alwaysSave: true });
        expect(removalAnswer(team, { always: true }, true)).not.toHaveProperty('alwaysSave');
    });

    it("keeps as a new pack by the name given when the pack is not the SC's", () => {
        expect(removalAnswer(team, { always: false, saveAsName: 'My Bodea' }, true)).toEqual({ changes: 'keep', saveAs: { displayName: 'My Bodea' } });
    });

    it('keeps when the setting already answers, whichever button', () => {
        expect(removalAnswer({ kind: 'will-save', packName: 'Acme Bodea' }, FRESH_CHOICE, false)).toEqual({ changes: 'keep' });
    });

    it('has nothing to keep with nothing changed', () => {
        expect(removalAnswer({ kind: 'plain' }, FRESH_CHOICE, true)).toEqual({ changes: 'drop' });
    });

    it('drops after a failed read: Remove Anyway is that choice', () => {
        expect(removalAnswer({ kind: 'read-failed', reason: 'x' }, FRESH_CHOICE, true)).toEqual({ changes: 'drop' });
    });
});

describe('removeLabel', () => {
    it('names what the main button does', () => {
        expect(removeLabel({ kind: 'read-failed', reason: 'x' })).toBe('Remove Anyway');
        expect(removeLabel({ kind: 'plain' })).toBe('Remove');
        expect(removeLabel({ kind: 'changes', sentence: 's', packName: 'p' })).toBe('Save and Remove');
        expect(removeLabel({ kind: 'changes', sentence: 's' })).toBe('Save As New and Remove');
    });
});

describe('recordedRemovalLines', () => {
    const inWords = (kinds: string[]) => kinds.join(' and ');

    it('names the kinds on the record, not the ticks', () => {
        expect(recordedRemovalLines('Bodea', ['categories', 'products'], ['categories', 'products'], inWords)).toEqual(['Permanently deletes what Bodea installed: categories and products.']);
    });

    it('says the ticks only choose what an import installs when they name less than what goes', () => {
        expect(recordedRemovalLines('Bodea', ['categories', 'products'], ['categories'], inWords)).toEqual(
            ['Permanently deletes what Bodea installed: categories and products.', 'Selected data types apply to Import only.'],
        );
    });

    it('says nothing about ticks when none are ticked: nothing suggests a limit', () => {
        expect(recordedRemovalLines('Bodea', ['categories'], [], inWords)).toEqual(['Permanently deletes what Bodea installed: categories.']);
    });

    it('says nothing about ticks when they name more than what goes', () => {
        expect(recordedRemovalLines('Bodea', ['categories'], ['categories', 'products'], inWords)).toEqual(['Permanently deletes what Bodea installed: categories.']);
    });

    it('says settings go back, since nothing deletes them', () => {
        expect(recordedRemovalLines('Bodea', ['categories', 'store_config'], [], inWords)).toEqual(['Permanently deletes what Bodea installed: categories.', 'Puts back the store settings it changed.']);
    });

    it('does not claim a deletion when settings are all it holds', () => {
        expect(recordedRemovalLines('Bodea', ['store_config'], [], inWords)).toEqual(['Puts back the store settings Bodea changed.']);
    });

    it('says so when the record lists nothing', () => {
        expect(recordedRemovalLines('Bodea', [], ['categories'], inWords)).toEqual(['Bodea has nothing left in the store to delete.']);
    });
});
