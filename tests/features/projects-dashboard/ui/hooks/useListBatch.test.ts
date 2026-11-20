/**
 * useListBatch — the projects list's Reset and Delete (step-05 S2, decisions J7-1): a card's or
 * row's Reset or Delete opens the batch window on that one project, as Reset Selected and Delete
 * Selected open it on the ticked ones. Nothing asks VS Code: the old one-project messages
 * (`resetProject`, `deleteProject`) are never sent, and nothing runs before the window's press.
 */

// FIRST: the shared webview client double; its jest.mock must register before the hook binds.
import { mockPostMessage, mockRequest } from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import { createProjectsDashboardProject } from '../../testUtils';
import { useListBatch } from '@/features/projects-dashboard/ui/hooks/useListBatch';

const KUKLA = createProjectsDashboardProject({
    name: 'kukla-luma',
    title: 'Kukla Luma',
    path: '/p/kukla',
});

/** Every message type the hook sent, by either channel. */
function sentTypes(): string[] {
    return [...mockRequest.mock.calls, ...mockPostMessage.mock.calls].map(
        ([type]) => type as string
    );
}

beforeEach(() => {
    mockRequest.mockReset();
    mockPostMessage.mockReset();
    // The prepare never answers: the window stays on its read wait.
    mockRequest.mockImplementation(() => new Promise(() => undefined));
});

describe('useListBatch', () => {
    it.each([
        ['reset', 'onResetProject'],
        ['delete', 'onDeleteProject'],
    ] as const)("a card's %s opens the batch window on that one project", (action, handler) => {
        const { result } = renderHook(() => useListBatch(jest.fn()));

        act(() => result.current[handler](KUKLA));

        expect(mockRequest).toHaveBeenCalledWith('prepareProjectsBatch', {
            action,
            projectPaths: ['/p/kukla'],
        });
        expect(result.current.batch.view).toEqual({
            phase: 'reading',
            action,
            names: ['Kukla Luma'],
        });
        expect(result.current.listBatch.isOpen).toBe(true);
    });

    it('never sends the old one-project messages, and starts no run before the press', () => {
        const { result } = renderHook(() => useListBatch(jest.fn()));

        act(() => result.current.onResetProject(KUKLA));
        act(() => result.current.batch.close());
        act(() => result.current.onDeleteProject(KUKLA));

        expect(sentTypes()).toEqual(['prepareProjectsBatch', 'prepareProjectsBatch']);
    });

    it('hands the list the same start Reset Selected and Delete Selected use', () => {
        const { result } = renderHook(() => useListBatch(jest.fn()));

        expect(result.current.listBatch.start).toBe(result.current.batch.start);
        expect(result.current.listBatch.isOpen).toBe(false);
        expect(result.current.listBatch.runs).toBe(0);
    });
});
