/**
 * AdobeProjectPicker — per-row delete affordance (Batch E)
 *
 * Covers the quiet trash button rendered at the end of each project row:
 *  - sends `delete-adobe-project` via webviewClient.request with the exact
 *    payload (projectId, projectTitle, orgId) without changing row selection,
 *  - in-flight state: the row stays untouched at press time (the native
 *    confirm modal is still open) and only disables — via `disabledIds`,
 *    no spinner or reason text — once the extension pushes
 *    `project-delete-started` after the user confirms,
 *  - response handling: success (selected vs other row), `cancelled: true`
 *    (silent, row never disabled), failure (inline error, row re-enabled),
 *    request rejection,
 *  - auto-select suppression after a delete (autoSelectSingle flips off when
 *    `project-delete-started` arrives — before the handler's refreshed
 *    `get-projects` push can arrive; a cancelled delete never suppresses).
 *
 * Split from AdobeProjectPicker.test.tsx (471 lines) to keep both files
 * comfortably under the test-file size cap; shares its testUtils.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeProjectPicker } from '@/features/authentication/ui/components/AdobeProjectPicker';
import { AdobeProject, WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockProjects,
    baseState,
    createMockSelectionStep,
} from './AdobeProjectPicker.testUtils';

// Mock WebviewClient (postMessage for the hook contract, request for delete,
// onMessage for the extension's project-delete-started push)
const mockPostMessage = jest.fn();
const mockRequest = jest.fn();
const mockOnMessage = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        request: (...args: unknown[]) => mockRequest(...args),
        onMessage: (...args: unknown[]) => mockOnMessage(...args),
    },
}));

// Mock useSelectionStep hook (list data supplied per-test)
jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

// Mock LoadingDisplay component
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: { message: string }) => (
        <div data-testid="loading-display">{message}</div>
    ),
}));

import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

/** Deferred promise so tests control when the delete request settles. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** Latest options object the component passed into useSelectionStep. */
function latestHookOptions(): Record<string, unknown> {
    const calls = mockUseSelectionStep.mock.calls;
    return calls[calls.length - 1][0];
}

/** The <li> row (from the ListView mock) containing the given row title. */
function projectRow(title: string): HTMLElement {
    const row = screen.getByText(title).closest('li');
    expect(row).not.toBeNull();
    return row as HTMLElement;
}

describe('AdobeProjectPicker — delete affordance', () => {
    const mockUpdateState = jest.fn();
    const mockSelectItem = jest.fn();

    // Handlers the component registered via webviewClient.onMessage, keyed by
    // message type — lets tests fire the extension's project-delete-started push.
    const messageHandlers = new Map<string, (data: unknown) => void>();

    function mockHookWithProjects(items: AdobeProject[] = mockProjects) {
        mockUseSelectionStep.mockImplementation(() =>
            createMockSelectionStep({
                items,
                filteredItems: items,
                hasLoadedOnce: true,
                selectItem: mockSelectItem,
            })
        );
    }

    function renderPicker(state: Partial<WizardState> = baseState) {
        return render(
            <Provider theme={defaultTheme}>
                <AdobeProjectPicker
                    state={state as WizardState}
                    updateState={mockUpdateState}
                />
            </Provider>
        );
    }

    /** Fire the captured project-delete-started handler (post-confirm signal). */
    function fireDeleteStarted(projectId: string) {
        const handler = messageHandlers.get('project-delete-started');
        expect(handler).toBeDefined();
        act(() => {
            handler!({ projectId });
        });
    }

    /** Press a row's trash button and flush the settled request. */
    async function pressDeleteAndSettle(label: string) {
        fireEvent.click(screen.getByLabelText(label));
        await act(async () => {
            await Promise.resolve();
        });
    }

    /**
     * Full confirmed-delete flow: press the trash, fire the extension's
     * project-delete-started push (the user confirmed the native modal),
     * then settle the request with the given result.
     */
    async function pressDeleteConfirmAndSettle(
        label: string,
        projectId: string,
        result: unknown,
    ) {
        const { promise, resolve } = deferred<unknown>();
        mockRequest.mockReturnValue(promise);
        fireEvent.click(screen.getByLabelText(label));
        fireDeleteStarted(projectId);
        await act(async () => {
            resolve(result);
            await promise;
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers.clear();
        mockOnMessage.mockImplementation(
            (type: string, handler: (data: unknown) => void) => {
                messageHandlers.set(type, handler);
                return jest.fn(); // unsubscribe
            },
        );
        mockHookWithProjects();
    });

    describe('Trash button rendering', () => {
        it('should render a delete button for every DELETABLE project row with a project-specific aria-label', () => {
            renderPicker();

            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
            expect(screen.getByLabelText('Delete project Test Project 2')).toBeInTheDocument();
            expect(screen.getByLabelText('Delete project Test Project 3')).toBeInTheDocument();
        });

        it('should fall back to the project name in the aria-label when title is missing', () => {
            const untitled: AdobeProject[] = [
                { id: 'p9', name: 'proj-nine', org_id: 'org123', deletable: true },
            ];
            mockHookWithProjects(untitled);

            renderPicker();

            expect(screen.getByLabelText('Delete project proj-nine')).toBeInTheDocument();
        });

        it('should still render the row title next to the delete button', () => {
            renderPicker();

            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
        });

        it('should subscribe to project-delete-started pushes from the extension', () => {
            renderPicker();

            expect(messageHandlers.has('project-delete-started')).toBe(true);
        });
    });

    describe('Ownership gating (deletable flag)', () => {
        it('should NOT render a delete button when the project is not deletable', () => {
            mockHookWithProjects([
                { ...mockProjects[0], deletable: false },
            ]);

            renderPicker();

            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
            expect(screen.queryByLabelText('Delete project Test Project 1')).not.toBeInTheDocument();
        });

        it('should NOT render a delete button when deletable is missing (fail closed)', () => {
            const unstamped: AdobeProject[] = [
                { id: 'p9', name: 'proj-nine', title: 'Unstamped', org_id: 'org123' },
            ];
            mockHookWithProjects(unstamped);

            renderPicker();

            expect(screen.getByText('Unstamped')).toBeInTheDocument();
            expect(screen.queryByLabelText('Delete project Unstamped')).not.toBeInTheDocument();
        });

        it('should render trash buttons only on the deletable rows of a mixed list', () => {
            mockHookWithProjects([
                { ...mockProjects[0], deletable: true },
                { ...mockProjects[1], deletable: false },
                { ...mockProjects[2], deletable: undefined },
            ]);

            renderPicker();

            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
            expect(screen.queryByLabelText('Delete project Test Project 2')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Delete project Test Project 3')).not.toBeInTheDocument();
        });

        it('should send no delete request from a non-deletable row (no affordance exists)', async () => {
            mockHookWithProjects([
                { ...mockProjects[0], deletable: false },
            ]);

            renderPicker();
            // Clicking the row itself selects; it must never fire a delete request.
            fireEvent.click(screen.getByText('Test Project 1'));
            await act(async () => {
                await Promise.resolve();
            });

            expect(mockRequest).not.toHaveBeenCalled();
        });

        it('should keep selection working on non-deletable rows', () => {
            mockHookWithProjects([
                { ...mockProjects[0], deletable: false },
            ]);

            renderPicker();
            fireEvent.click(screen.getByText('Test Project 1'));

            expect(mockSelectItem).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'project1' })
            );
        });
    });

    describe('Press behavior', () => {
        it('should send delete-adobe-project with the exact payload including orgId', async () => {
            mockRequest.mockResolvedValue({ success: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(mockRequest).toHaveBeenCalledWith('delete-adobe-project', {
                projectId: 'project1',
                projectTitle: 'Test Project 1',
                orgId: 'org1',
            });
        });

        it('should use the project name as projectTitle when title is missing', async () => {
            const untitled: AdobeProject[] = [
                { id: 'p9', name: 'proj-nine', org_id: 'org123', deletable: true },
            ];
            mockHookWithProjects(untitled);
            mockRequest.mockResolvedValue({ success: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project proj-nine');

            expect(mockRequest).toHaveBeenCalledWith('delete-adobe-project', {
                projectId: 'p9',
                projectTitle: 'proj-nine',
                orgId: 'org1',
            });
        });

        it('should not change row selection when the trash button is pressed', async () => {
            mockRequest.mockResolvedValue({ success: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(mockSelectItem).not.toHaveBeenCalled();
        });

        it('should still select the row when the row itself is clicked (sanity)', () => {
            renderPicker();

            fireEvent.click(screen.getByText('Test Project 2'));

            expect(mockSelectItem).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'project2' })
            );
        });

        it('should not call the list refresh directly (single refresh path is the handler push)', async () => {
            mockRequest.mockResolvedValue({ success: true });
            const mockRefresh = jest.fn();
            mockUseSelectionStep.mockImplementation(() =>
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: mockProjects,
                    hasLoadedOnce: true,
                    refresh: mockRefresh,
                })
            );

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(mockRefresh).not.toHaveBeenCalled();
        });
    });

    describe('In-flight state', () => {
        it('should NOT disable the row at press time (confirm modal still open, no signal yet)', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));

            expect(mockRequest).toHaveBeenCalledTimes(1);
            expect(projectRow('Test Project 1')).not.toHaveAttribute('aria-disabled');
            // No spinner or reason text — the trash affordance stays as-is.
            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
        });

        it('should disable the row once project-delete-started arrives (confirmed)', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));
            fireDeleteStarted('project1');

            expect(projectRow('Test Project 1')).toHaveAttribute('aria-disabled', 'true');
            expect(projectRow('Test Project 2')).not.toHaveAttribute('aria-disabled');
        });

        it('should show no spinner or "Deleting…" text on the disabled row', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));
            fireDeleteStarted('project1');

            expect(screen.queryByText('Deleting…')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Deleting project Test Project 1')).not.toBeInTheDocument();
        });

        it('should ignore a second press while a confirmed delete is in flight', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));
            fireDeleteStarted('project1');
            fireEvent.click(screen.getByLabelText('Delete project Test Project 2'));

            expect(mockRequest).toHaveBeenCalledTimes(1);
        });
    });

    describe('Success handling', () => {
        it('should clear adobeProject, adobeWorkspace and workspacesCache when the deleted project was selected', async () => {
            const stateWithSelection: Partial<WizardState> = {
                ...baseState,
                adobeProject: mockProjects[0],
            };

            renderPicker(stateWithSelection);
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', { success: true },
            );

            // toStrictEqual, not toHaveBeenCalledWith: the loose matcher treats an
            // `undefined` property as equal to a MISSING one, so an emptied `{}`
            // update passed as a clear until 2026-09-03.
            expect(mockUpdateState).toHaveBeenCalledTimes(1);
            expect(mockUpdateState.mock.calls[0][0]).toStrictEqual({
                adobeProject: undefined,
                adobeWorkspace: undefined,
                workspacesCache: undefined,
            });
        });

        it('should leave wizard selection state untouched when a non-selected project is deleted', async () => {
            const stateWithSelection: Partial<WizardState> = {
                ...baseState,
                adobeProject: mockProjects[0],
            };

            renderPicker(stateWithSelection);
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 2', 'project2', { success: true },
            );

            expect(mockUpdateState).not.toHaveBeenCalled();
        });

        it('should re-enable the row after success', async () => {
            renderPicker();
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', { success: true },
            );

            expect(projectRow('Test Project 1')).not.toHaveAttribute('aria-disabled');
            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
        });

        it('should not show any error after success', async () => {
            renderPicker();
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', { success: true },
            );

            expect(screen.queryByText(/could not delete/i)).not.toBeInTheDocument();
        });
    });

    describe('Cancelled handling', () => {
        it('should stay silent when the user dismisses the confirmation (no error, no state change)', async () => {
            mockRequest.mockResolvedValue({ success: false, cancelled: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(screen.queryByText(/could not delete/i)).not.toBeInTheDocument();
            expect(mockUpdateState).not.toHaveBeenCalled();
        });

        it('should never disable the row on a cancelled delete (no project-delete-started)', async () => {
            const { promise, resolve } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));
            // While the (dismissed) modal round-trip is pending: still enabled.
            expect(projectRow('Test Project 1')).not.toHaveAttribute('aria-disabled');

            await act(async () => {
                resolve({ success: false, cancelled: true });
                await promise;
            });

            expect(projectRow('Test Project 1')).not.toHaveAttribute('aria-disabled');
            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
        });

        it('should keep auto-selection enabled after a cancel (nothing was deleted)', async () => {
            mockRequest.mockResolvedValue({ success: false, cancelled: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(latestHookOptions().autoSelectSingle).toBe(true);
        });
    });

    describe('Failure handling', () => {
        it('should surface the handler error inline', async () => {
            renderPicker();
            await pressDeleteConfirmAndSettle('Delete project Test Project 1', 'project1', {
                success: false,
                error: 'Failed to delete the Adobe project. Check the logs for details.',
            });

            expect(
                screen.getByText('Failed to delete the Adobe project. Check the logs for details.')
            ).toBeInTheDocument();
        });

        it('should show a fallback error message when the handler returns no error text', async () => {
            renderPicker();
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', { success: false },
            );

            expect(screen.getByText(/could not delete/i)).toBeInTheDocument();
        });

        it('should re-enable the row after a failure', async () => {
            renderPicker();
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', { success: false, error: 'boom' },
            );

            expect(projectRow('Test Project 1')).not.toHaveAttribute('aria-disabled');
            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
        });

        it('should not touch wizard selection state on failure', async () => {
            const stateWithSelection: Partial<WizardState> = {
                ...baseState,
                adobeProject: mockProjects[0],
            };

            renderPicker(stateWithSelection);
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', { success: false, error: 'boom' },
            );

            expect(mockUpdateState).not.toHaveBeenCalled();
        });

        it('should surface a rejected request as an inline error and keep the row enabled', async () => {
            mockRequest.mockRejectedValue(new Error('Request timed out'));

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(screen.getByText('Request timed out')).toBeInTheDocument();
            expect(projectRow('Test Project 1')).not.toHaveAttribute('aria-disabled');
            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
        });

        it('should clear a previous delete error when a new delete starts', async () => {
            mockRequest.mockResolvedValueOnce({ success: false, error: 'boom' });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');
            expect(screen.getByText('boom')).toBeInTheDocument();

            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);
            fireEvent.click(screen.getByLabelText('Delete project Test Project 2'));

            expect(screen.queryByText('boom')).not.toBeInTheDocument();
        });
    });

    /**
     * Shapes the extension may hand over that the happy paths never do: a push
     * with no body, a response that is not an object, a wizard with no org or no
     * selection. Each survived a mutation run on 2026-09-03 because every other
     * test supplied the full shape.
     */
    describe('Defensive shapes from the extension', () => {
        it('ignores a project-delete-started push with no body', () => {
            renderPicker();
            const handler = messageHandlers.get('project-delete-started');
            expect(handler).toBeDefined();

            expect(() => act(() => handler!(undefined))).not.toThrow();

            expect(latestHookOptions().autoSelectSingle).toBe(true);
        });

        it('ignores a project-delete-started push that names no project', () => {
            renderPicker();
            const handler = messageHandlers.get('project-delete-started');

            act(() => handler!({}));

            expect(latestHookOptions().autoSelectSingle).toBe(true);
        });

        it('shows the fallback error when the handler answers with nothing at all', async () => {
            renderPicker();
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', undefined,
            );

            expect(screen.getByText('Could not delete the project.')).toBeInTheDocument();
        });

        it('sends an undefined orgId when the wizard has no org', async () => {
            renderPicker({ ...baseState, adobeOrg: undefined });
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(mockRequest).toHaveBeenCalledWith('delete-adobe-project', {
                projectId: 'project1',
                projectTitle: 'Test Project 1',
                orgId: undefined,
            });
        });

        it('succeeds quietly when nothing was selected to begin with', async () => {
            const { container } = renderPicker({ ...baseState, adobeProject: undefined });
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', { success: true },
            );

            expect(mockUpdateState).not.toHaveBeenCalled();
            // No inline error of ANY wording — a thrown TypeError's message would
            // land in the same red text and not match /could not delete/.
            expect(container.querySelector('.text-red-600')).toBeNull();
        });
    });

    describe('Auto-select suppression', () => {
        it('should enable autoSelectSingle before any delete (baseline)', () => {
            renderPicker();

            expect(latestHookOptions().autoSelectSingle).toBe(true);
        });

        it('should keep autoSelectSingle enabled at press time (user has not confirmed yet)', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));

            expect(latestHookOptions().autoSelectSingle).toBe(true);
        });

        it('should suppress autoSelectSingle when project-delete-started arrives (before the refreshed list)', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));
            fireDeleteStarted('project1');

            expect(latestHookOptions().autoSelectSingle).toBe(false);
        });

        it('should keep autoSelectSingle suppressed after a successful delete', async () => {
            renderPicker();
            await pressDeleteConfirmAndSettle(
                'Delete project Test Project 1', 'project1', { success: true },
            );

            expect(latestHookOptions().autoSelectSingle).toBe(false);
        });
    });
});
