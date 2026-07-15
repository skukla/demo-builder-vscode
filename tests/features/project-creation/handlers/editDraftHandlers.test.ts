/**
 * editDraftHandlers Tests
 *
 * Verifies the save/clear edit-draft webview handlers write through the store to
 * the ExtensionContext globalState Memento, return shaped results (never throw),
 * and reject a missing projectPath without performing any write.
 */

import type * as vscode from 'vscode';
import {
    handleSaveEditDraft,
    handleClearEditDraft,
} from '@/features/project-creation/handlers/editDraftHandlers';
import { getEditDraft } from '@/features/project-creation/services/editDraftStore';
import type { HandlerContext } from '@/commands/handlers/HandlerContext';
import type { EditDraft } from '@/types/webview';

/** In-memory Memento fake with a spyable update. */
function createMementoFake(): vscode.Memento & { update: jest.Mock } {
    const store = new Map<string, unknown>();
    return {
        keys: () => Array.from(store.keys()),
        get: (<T>(key: string, defaultValue?: T) =>
            store.has(key) ? (store.get(key) as T) : defaultValue) as vscode.Memento['get'],
        update: jest.fn((key: string, value: unknown) => {
            if (value === undefined) {
                store.delete(key);
            } else {
                store.set(key, value);
            }
            return Promise.resolve();
        }),
    };
}

const draft: EditDraft = { projectName: 'Handler Project', selectedStack: 'eds-paas' };

describe('editDraftHandlers', () => {
    let globalState: vscode.Memento & { update: jest.Mock };
    let context: HandlerContext;

    beforeEach(() => {
        globalState = createMementoFake();
        context = {
            context: { globalState } as unknown as vscode.ExtensionContext,
        } as HandlerContext;
    });

    describe('handleSaveEditDraft', () => {
        it('writes the draft and returns success', async () => {
            const result = await handleSaveEditDraft(context, {
                projectPath: '/path/to/a',
                draft,
            });

            expect(result).toEqual({ success: true });
            expect(getEditDraft(globalState, '/path/to/a')).toEqual(draft);
        });

        it('saves an empty draft when none is provided', async () => {
            const result = await handleSaveEditDraft(context, { projectPath: '/path/to/a' });

            expect(result).toEqual({ success: true });
            expect(getEditDraft(globalState, '/path/to/a')).toEqual({});
        });

        it('returns failure and does not write when projectPath is missing', async () => {
            const result = await handleSaveEditDraft(context, { draft });

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
            expect(globalState.update).not.toHaveBeenCalled();
        });

        it('returns failure and does not write when payload is absent', async () => {
            const result = await handleSaveEditDraft(context, undefined);

            expect(result.success).toBe(false);
            expect(globalState.update).not.toHaveBeenCalled();
        });
    });

    describe('handleClearEditDraft', () => {
        it('removes a previously saved draft and returns success', async () => {
            await handleSaveEditDraft(context, { projectPath: '/path/to/a', draft });

            const result = await handleClearEditDraft(context, { projectPath: '/path/to/a' });

            expect(result).toEqual({ success: true });
            expect(getEditDraft(globalState, '/path/to/a')).toBeUndefined();
        });

        it('returns failure and does not write when projectPath is missing', async () => {
            const result = await handleClearEditDraft(context, {});

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
            expect(globalState.update).not.toHaveBeenCalled();
        });
    });
});
