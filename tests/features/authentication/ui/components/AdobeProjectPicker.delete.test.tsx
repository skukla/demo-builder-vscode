/**
 * AdobeProjectPicker — per-row delete affordance (Batch E)
 *
 * Covers the quiet trash button rendered at the end of each project row:
 *  - sends `delete-adobe-project` via webviewClient.request with the exact
 *    payload (projectId, projectTitle, orgId) without changing row selection,
 *  - in-flight state: row disabled with a "Deleting…" reason, trash swapped
 *    for a ProgressCircle, second press impossible,
 *  - response handling: success (selected vs other row), `cancelled: true`
 *    (silent), failure (inline error, row re-enabled), request rejection,
 *  - auto-select suppression after a delete (autoSelectSingle flipped off
 *    per-render, synchronously at press time — before the handler's
 *    refreshed `get-projects` push can arrive).
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

// Mock WebviewClient (postMessage for the hook contract, request for delete)
const mockPostMessage = jest.fn();
const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        request: (...args: unknown[]) => mockRequest(...args),
        onMessage: jest.fn(),
    },
}));

// Mock useSelectionStep hook (list data supplied per-test)
jest.mock('@/core/ui/hooks', () => ({
    useSelectionStep: jest.fn(),
}));

// Mock LoadingDisplay component
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: { message: string }) => (
        <div data-testid="loading-display">{message}</div>
    ),
}));

import { useSelectionStep } from '@/core/ui/hooks';

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

describe('AdobeProjectPicker — delete affordance', () => {
    const mockUpdateState = jest.fn();
    const mockSelectItem = jest.fn();

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

    /** Press a row's trash button and flush the settled request. */
    async function pressDeleteAndSettle(label: string) {
        fireEvent.click(screen.getByLabelText(label));
        await act(async () => {
            await Promise.resolve();
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
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
        it('should show a ProgressCircle in place of the trash button on the deleting row', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));

            expect(screen.queryByLabelText('Delete project Test Project 1')).not.toBeInTheDocument();
            expect(screen.getByLabelText('Deleting project Test Project 1')).toBeInTheDocument();
        });

        it('should show a "Deleting…" reason on the deleting row', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));

            expect(screen.getByText('Deleting…')).toBeInTheDocument();
        });

        it('should keep other rows deletable-looking but ignore a second press while one delete is in flight', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));
            fireEvent.click(screen.getByLabelText('Delete project Test Project 2'));

            expect(mockRequest).toHaveBeenCalledTimes(1);
        });

        it('should make a second press on the same row impossible (button replaced)', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));

            // The trash button is gone; only the progress indicator remains.
            expect(screen.queryByLabelText('Delete project Test Project 1')).not.toBeInTheDocument();
            expect(mockRequest).toHaveBeenCalledTimes(1);
        });
    });

    describe('Success handling', () => {
        it('should clear adobeProject, adobeWorkspace and workspacesCache when the deleted project was selected', async () => {
            mockRequest.mockResolvedValue({ success: true });
            const stateWithSelection: Partial<WizardState> = {
                ...baseState,
                adobeProject: mockProjects[0],
            };

            renderPicker(stateWithSelection);
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(mockUpdateState).toHaveBeenCalledWith({
                adobeProject: undefined,
                adobeWorkspace: undefined,
                workspacesCache: undefined,
            });
        });

        it('should leave wizard selection state untouched when a non-selected project is deleted', async () => {
            mockRequest.mockResolvedValue({ success: true });
            const stateWithSelection: Partial<WizardState> = {
                ...baseState,
                adobeProject: mockProjects[0],
            };

            renderPicker(stateWithSelection);
            await pressDeleteAndSettle('Delete project Test Project 2');

            expect(mockUpdateState).not.toHaveBeenCalled();
        });

        it('should clear the in-flight state after success (trash button returns)', async () => {
            mockRequest.mockResolvedValue({ success: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
            expect(screen.queryByText('Deleting…')).not.toBeInTheDocument();
        });

        it('should not show any error after success', async () => {
            mockRequest.mockResolvedValue({ success: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

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

        it('should clear the in-flight state after a cancel (trash button returns)', async () => {
            mockRequest.mockResolvedValue({ success: false, cancelled: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
            expect(screen.queryByText('Deleting…')).not.toBeInTheDocument();
        });

        it('should restore auto-selection after a cancel (nothing was deleted)', async () => {
            mockRequest.mockResolvedValue({ success: false, cancelled: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(latestHookOptions().autoSelectSingle).toBe(true);
        });
    });

    describe('Failure handling', () => {
        it('should surface the handler error inline', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                error: 'Failed to delete the Adobe project. Check the logs for details.',
            });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(
                screen.getByText('Failed to delete the Adobe project. Check the logs for details.')
            ).toBeInTheDocument();
        });

        it('should show a fallback error message when the handler returns no error text', async () => {
            mockRequest.mockResolvedValue({ success: false });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(screen.getByText(/could not delete/i)).toBeInTheDocument();
        });

        it('should re-enable the row after a failure (trash back, reason gone)', async () => {
            mockRequest.mockResolvedValue({ success: false, error: 'boom' });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(screen.getByLabelText('Delete project Test Project 1')).toBeInTheDocument();
            expect(screen.queryByText('Deleting…')).not.toBeInTheDocument();
        });

        it('should not touch wizard selection state on failure', async () => {
            mockRequest.mockResolvedValue({ success: false, error: 'boom' });
            const stateWithSelection: Partial<WizardState> = {
                ...baseState,
                adobeProject: mockProjects[0],
            };

            renderPicker(stateWithSelection);
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(mockUpdateState).not.toHaveBeenCalled();
        });

        it('should surface a rejected request as an inline error and re-enable the row', async () => {
            mockRequest.mockRejectedValue(new Error('Request timed out'));

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(screen.getByText('Request timed out')).toBeInTheDocument();
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

    describe('Auto-select suppression', () => {
        it('should enable autoSelectSingle before any delete (baseline)', () => {
            renderPicker();

            expect(latestHookOptions().autoSelectSingle).toBe(true);
        });

        it('should suppress autoSelectSingle synchronously at press time (before the refreshed list arrives)', () => {
            const { promise } = deferred<unknown>();
            mockRequest.mockReturnValue(promise);

            renderPicker();
            fireEvent.click(screen.getByLabelText('Delete project Test Project 1'));

            expect(latestHookOptions().autoSelectSingle).toBe(false);
        });

        it('should keep autoSelectSingle suppressed after a successful delete', async () => {
            mockRequest.mockResolvedValue({ success: true });

            renderPicker();
            await pressDeleteAndSettle('Delete project Test Project 1');

            expect(latestHookOptions().autoSelectSingle).toBe(false);
        });
    });
});
