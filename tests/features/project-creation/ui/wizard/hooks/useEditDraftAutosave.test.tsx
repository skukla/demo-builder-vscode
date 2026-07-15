/**
 * useEditDraftAutosave tests — the edit-mode-only autosave of the wizard's
 * reversible draft.
 *
 * The hook watches the editable slice of wizard state and, in edit mode, writes a
 * draft (debounced) ONLY while that slice diverges from the saved baseline. It
 * flushes any pending save on unmount so closing the editor persists the latest.
 * In create/import mode (no project path), or when the slice equals the baseline,
 * it never posts.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

import {
    useEditDraftAutosave,
    EDIT_DRAFT_DEBOUNCE_MS,
} from '@/features/project-creation/ui/wizard/hooks/useEditDraftAutosave';
import { pickEditDraft } from '@/features/project-creation/ui/wizard/editDraft';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { WizardState } from '@/types/webview';

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn() },
}));

const postMessage = vscode.postMessage as jest.Mock;

function state(overrides: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'build-your-project',
        projectName: 'demo',
        adobeAuth: { isAuthenticated: true, isChecking: false },
        selectedAppBuilderComponents: ['erp-sync'],
        ...overrides,
    } as WizardState;
}

const PATH = '/projects/demo';
// A baseline the fixtures diverge from (they all carry selectedAppBuilderComponents).
const EMPTY_BASELINE = '';

describe('useEditDraftAutosave', () => {
    beforeEach(() => postMessage.mockClear());

    it('debounce-posts save-edit-draft with the path + picked draft when diverged', async () => {
        await act(async () => {
            renderHook(() =>
                useEditDraftAutosave({
                    state: state(),
                    editProjectPath: PATH,
                    baselineSerialized: EMPTY_BASELINE,
                }),
            );
        });

        // Nothing before the debounce elapses.
        expect(postMessage).not.toHaveBeenCalled();

        await act(async () => {
            jest.advanceTimersByTime(EDIT_DRAFT_DEBOUNCE_MS);
        });

        expect(postMessage).toHaveBeenCalledTimes(1);
        const [type, payload] = postMessage.mock.calls[0];
        expect(type).toBe('save-edit-draft');
        expect(payload.projectPath).toBe(PATH);
        expect(payload.draft.selectedAppBuilderComponents).toEqual(['erp-sync']);
    });

    it('never posts when the slice equals the saved baseline (no divergence)', async () => {
        const baseline = JSON.stringify(pickEditDraft(state()));
        await act(async () => {
            renderHook(() =>
                useEditDraftAutosave({
                    state: state(),
                    editProjectPath: PATH,
                    baselineSerialized: baseline,
                }),
            );
        });
        await act(async () => {
            jest.advanceTimersByTime(EDIT_DRAFT_DEBOUNCE_MS * 3);
        });

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('coalesces rapid edits into a single debounced post', async () => {
        let rerender!: (props: { s: WizardState }) => void;
        await act(async () => {
            ({ rerender } = renderHook(
                ({ s }) =>
                    useEditDraftAutosave({
                        state: s,
                        editProjectPath: PATH,
                        baselineSerialized: EMPTY_BASELINE,
                    }),
                { initialProps: { s: state({ selectedAppBuilderComponents: ['a'] }) } },
            ));
        });
        await act(async () => {
            rerender({ s: state({ selectedAppBuilderComponents: ['a', 'b'] }) });
        });
        await act(async () => {
            rerender({ s: state({ selectedAppBuilderComponents: [] }) });
        });

        await act(async () => {
            jest.advanceTimersByTime(EDIT_DRAFT_DEBOUNCE_MS);
        });

        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage.mock.calls[0][1].draft.selectedAppBuilderComponents).toEqual([]);
    });

    it('never posts in create/import mode (no project path)', async () => {
        let rerender!: (props: { s: WizardState }) => void;
        await act(async () => {
            ({ rerender } = renderHook(
                ({ s }) =>
                    useEditDraftAutosave({
                        state: s,
                        editProjectPath: undefined,
                        baselineSerialized: EMPTY_BASELINE,
                    }),
                { initialProps: { s: state({ selectedAppBuilderComponents: ['a'] }) } },
            ));
        });
        await act(async () => {
            rerender({ s: state({ selectedAppBuilderComponents: ['a', 'b'] }) });
        });
        await act(async () => {
            jest.advanceTimersByTime(EDIT_DRAFT_DEBOUNCE_MS * 3);
        });

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('clears the persisted draft when edits are reverted back to the baseline', async () => {
        const baseline = JSON.stringify(
            pickEditDraft(state({ selectedAppBuilderComponents: ['erp-sync'] })),
        );
        let rerender!: (props: { s: WizardState }) => void;
        await act(async () => {
            ({ rerender } = renderHook(
                ({ s }) =>
                    useEditDraftAutosave({
                        state: s,
                        editProjectPath: PATH,
                        baselineSerialized: baseline,
                    }),
                // Diverged: the integration was removed.
                { initialProps: { s: state({ selectedAppBuilderComponents: [] }) } },
            ));
        });
        await act(async () => {
            jest.advanceTimersByTime(EDIT_DRAFT_DEBOUNCE_MS);
        });
        expect(postMessage).toHaveBeenCalledWith(
            'save-edit-draft',
            expect.objectContaining({ projectPath: PATH }),
        );
        postMessage.mockClear();

        // Revert to the saved value → the draft must be cleared, not left stale.
        await act(async () => {
            rerender({ s: state({ selectedAppBuilderComponents: ['erp-sync'] }) });
        });

        expect(postMessage).toHaveBeenCalledWith('clear-edit-draft', { projectPath: PATH });
    });

    it('drops a pending save (no stale flush) when reverted within the debounce window', async () => {
        const baseline = JSON.stringify(
            pickEditDraft(state({ selectedAppBuilderComponents: ['erp-sync'] })),
        );
        let rerender!: (props: { s: WizardState }) => void;
        let unmount!: () => void;
        await act(async () => {
            ({ rerender, unmount } = renderHook(
                ({ s }) =>
                    useEditDraftAutosave({
                        state: s,
                        editProjectPath: PATH,
                        baselineSerialized: baseline,
                    }),
                { initialProps: { s: state({ selectedAppBuilderComponents: [] }) } },
            ));
        });
        // Revert BEFORE the debounce fires.
        await act(async () => {
            rerender({ s: state({ selectedAppBuilderComponents: ['erp-sync'] }) });
        });
        postMessage.mockClear();

        await act(async () => {
            unmount();
        });

        // The pending diverged draft must NOT be flushed on unmount.
        expect(postMessage).not.toHaveBeenCalledWith('save-edit-draft', expect.anything());
    });

    it('flushes the latest draft on unmount (closing the editor)', async () => {
        let unmount!: () => void;
        await act(async () => {
            ({ unmount } = renderHook(() =>
                useEditDraftAutosave({
                    state: state({ selectedAppBuilderComponents: ['x'] }),
                    editProjectPath: PATH,
                    baselineSerialized: EMPTY_BASELINE,
                }),
            ));
        });
        // Unmount BEFORE the debounce fires — the flush must still persist the latest.
        await act(async () => {
            unmount();
        });

        expect(postMessage).toHaveBeenCalledTimes(1);
        const [type, payload] = postMessage.mock.calls[0];
        expect(type).toBe('save-edit-draft');
        expect(payload.projectPath).toBe(PATH);
        expect(payload.draft.selectedAppBuilderComponents).toEqual(['x']);
    });
});
