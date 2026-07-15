/**
 * editDraftStore Tests
 *
 * Verifies the thin Memento wrapper round-trips per-project edit drafts under a
 * path-namespaced key, returns undefined when absent, and clears only the target
 * project's draft (a second project's draft survives).
 */

import type * as vscode from 'vscode';
import {
    DRAFT_KEY_PREFIX,
    getEditDraft,
    saveEditDraft,
    clearEditDraft,
} from '@/features/project-creation/services/editDraftStore';
import type { EditDraft } from '@/types/webview';

/** Minimal in-memory Memento fake sufficient for the store's get/update calls. */
function createMementoFake(): vscode.Memento {
    const store = new Map<string, unknown>();
    return {
        keys: () => Array.from(store.keys()),
        get: (<T>(key: string, defaultValue?: T) =>
            store.has(key) ? (store.get(key) as T) : defaultValue) as vscode.Memento['get'],
        update: (key: string, value: unknown) => {
            if (value === undefined) {
                store.delete(key);
            } else {
                store.set(key, value);
            }
            return Promise.resolve();
        },
    };
}

const draftA: EditDraft = { projectName: 'Project A', selectedStack: 'eds-paas' };
const draftB: EditDraft = { projectName: 'Project B', selectedStack: 'headless-paas' };

describe('editDraftStore', () => {
    let memento: vscode.Memento;

    beforeEach(() => {
        memento = createMementoFake();
    });

    it('round-trips a saved draft via get', async () => {
        await saveEditDraft(memento, '/path/to/a', draftA);

        expect(getEditDraft(memento, '/path/to/a')).toEqual(draftA);
    });

    it('returns undefined when no draft has been saved', () => {
        expect(getEditDraft(memento, '/path/to/absent')).toBeUndefined();
    });

    it('namespaces keys by project path', async () => {
        await saveEditDraft(memento, '/path/to/a', draftA);

        expect(memento.get(`${DRAFT_KEY_PREFIX}/path/to/a`)).toEqual(draftA);
    });

    it('clears only the target project draft; a second project survives', async () => {
        await saveEditDraft(memento, '/path/to/a', draftA);
        await saveEditDraft(memento, '/path/to/b', draftB);

        await clearEditDraft(memento, '/path/to/a');

        expect(getEditDraft(memento, '/path/to/a')).toBeUndefined();
        expect(getEditDraft(memento, '/path/to/b')).toEqual(draftB);
    });
});
