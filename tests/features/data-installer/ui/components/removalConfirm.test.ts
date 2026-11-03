/**
 * The removal confirm's decisions, without React: what it shows for what the read found, what the
 * boxes do, and what the Remove press sends.
 */

import type { DatapackRemovalChanges } from '@/features/data-installer/removalChanges';
import {
    FRESH_CHOICE,
    confirmContent,
    recordedRemovalLines,
    removalAnswer,
    removeLabel,
    toggleAlways,
    toggleSave,
} from '@/features/data-installer/ui/components/removalConfirm';
import type { DataInstallerFailure } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';

const CHANGED: DatapackRemovalChanges = {
    count: 3,
    kinds: [],
    sentence: '3 items changed since install: the category Critical Power, and 2 products.',
    ownPackName: 'Acme Demo',
    alwaysSave: false,
};
const NOTHING: DatapackRemovalChanges = { count: 0, kinds: [], ownPackName: 'Acme Demo', alwaysSave: false };
const FAILED: DataInstallerFailure = { message: 'The store could not be read.' };

describe('confirmContent', () => {
    it('is the plain confirm when nothing changed', () => {
        expect(confirmContent(NOTHING, null)).toEqual({ kind: 'plain' });
    });

    it('is the plain confirm when the setting is on and nothing changed', () => {
        expect(confirmContent({ ...NOTHING, alwaysSave: true }, null)).toEqual({ kind: 'plain' });
    });

    it('offers the box when something changed', () => {
        expect(confirmContent(CHANGED, null)).toEqual({ kind: 'changes', sentence: CHANGED.sentence, packName: 'Acme Demo' });
    });

    it('says only that they will be saved when the setting answers', () => {
        expect(confirmContent({ ...CHANGED, alwaysSave: true }, null)).toEqual({ kind: 'will-save', packName: 'Acme Demo' });
    });

    it('never reads a failed read as nothing changed', () => {
        expect(confirmContent(null, FAILED)).toEqual({ kind: 'read-failed', reason: FAILED.message });
    });

    it('does not show transport text when no answer came back', () => {
        expect(confirmContent(null, { message: 'Request timeout: get-datapack-removal-changes', unanswered: true })).toEqual({ kind: 'read-failed', reason: 'The check took too long to answer.' });
    });

    it('believes the failure over an answer left by an earlier read', () => {
        expect(confirmContent(CHANGED, FAILED).kind).toBe('read-failed');
    });
});

describe('the boxes', () => {
    it('start with the save ticked and the always not', () => {
        expect(FRESH_CHOICE).toEqual({ saveFirst: true, always: false });
    });

    it('unticking the save takes the always with it: it cannot always do what it is not doing', () => {
        const ticked = toggleAlways(FRESH_CHOICE);

        expect(ticked).toEqual({ saveFirst: true, always: true });
        expect(toggleSave(ticked)).toEqual({ saveFirst: false, always: false });
    });

    it('ticking the save again leaves the always off', () => {
        expect(toggleSave({ saveFirst: false, always: false })).toEqual({ saveFirst: true, always: false });
    });
});

describe('removalAnswer', () => {
    const changes = confirmContent(CHANGED, null);

    it('keeps with the box ticked', () => {
        expect(removalAnswer(changes, FRESH_CHOICE)).toEqual({ changes: 'keep' });
    });

    it('drops with the box unticked', () => {
        expect(removalAnswer(changes, { saveFirst: false, always: false })).toEqual({ changes: 'drop' });
    });

    it('asks for the setting only when always is ticked', () => {
        expect(removalAnswer(changes, { saveFirst: true, always: true })).toEqual({ changes: 'keep', alwaysSave: true });
    });

    it('keeps when the setting already answers, whatever the boxes hold', () => {
        expect(removalAnswer({ kind: 'will-save', packName: 'Acme Demo' }, { saveFirst: false, always: false })).toEqual({ changes: 'keep' });
    });

    it('has nothing to keep with nothing changed', () => {
        expect(removalAnswer({ kind: 'plain' }, FRESH_CHOICE)).toEqual({ changes: 'drop' });
    });

    it('drops after a failed read: Remove Anyway is that choice', () => {
        expect(removalAnswer({ kind: 'read-failed', reason: 'x' }, FRESH_CHOICE)).toEqual({ changes: 'drop' });
    });
});

describe('removeLabel', () => {
    it('says Remove Anyway only after a failed read', () => {
        expect(removeLabel({ kind: 'read-failed', reason: 'x' })).toBe('Remove Anyway');
        expect(removeLabel({ kind: 'plain' })).toBe('Remove');
        expect(removeLabel({ kind: 'changes', sentence: 's', packName: 'p' })).toBe('Remove');
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
