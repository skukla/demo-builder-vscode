/**
 * useListBatch — the projects list's Reset and Delete (step-05 S2, decisions J7-1): a card's or
 * row's Reset or Delete opens the batch window on that one project, as Reset Selected and Delete
 * Selected open it on the ticked ones. Nothing asks VS Code: the old one-project messages
 * (`resetProject`, `deleteProject`) are never sent, and nothing runs before the window's press.
 */

// FIRST: the shared webview client double; its jest.mock must register before the hook binds.
import {
    mockPostMessage,
    mockRequest,
    webviewClientHandlers,
} from '../../../../helpers/webviewClientMock';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createProjectsDashboardProject } from '../../testUtils';
import { useListBatch } from '@/features/projects-dashboard/ui/hooks/useListBatch';
import type { Project } from '@/types/base';
import type { OpenDeleteWindowPayload, TakeDeleteRequestResponse } from '@/types/projectsBatch';

const KUKLA = createProjectsDashboardProject({
    name: 'kukla-luma',
    title: 'Kukla Luma',
    path: '/p/kukla',
});

const NO_PROJECTS: Project[] = [];
const OTHER = createProjectsDashboardProject({ name: 'other', path: '/p/other' });
const LOADED: Project[] = [OTHER, KUKLA];

/** The extension's answer to the arrival question: this project's Delete window, or none. */
function holds(projectPath: string | null): void {
    const answer: TakeDeleteRequestResponse = { success: true, data: { projectPath } };
    mockRequest.mockImplementation((type: string) =>
        type === 'takeDeleteRequest' ? Promise.resolve(answer) : new Promise(() => undefined)
    );
}

/** The prepares the hook sent, by their payloads. */
function prepares(): unknown[] {
    return mockRequest.mock.calls
        .filter(([type]) => type === 'prepareProjectsBatch')
        .map(([, payload]) => payload);
}

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
        const { result } = renderHook(() => useListBatch(jest.fn(), NO_PROJECTS));

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
        const { result } = renderHook(() => useListBatch(jest.fn(), NO_PROJECTS));

        act(() => result.current.onResetProject(KUKLA));
        act(() => result.current.batch.close());
        act(() => result.current.onDeleteProject(KUKLA));

        // The first is the arrival question asked on mount (step-05 S4); it starts nothing.
        expect(sentTypes()).toEqual([
            'takeDeleteRequest',
            'prepareProjectsBatch',
            'prepareProjectsBatch',
        ]);
    });

    it('hands the list the same start Reset Selected and Delete Selected use', () => {
        const { result } = renderHook(() => useListBatch(jest.fn(), NO_PROJECTS));

        expect(result.current.listBatch.start).toBe(result.current.batch.start);
        expect(result.current.listBatch.isOpen).toBe(false);
        expect(result.current.listBatch.runs).toBe(0);
    });
});

/**
 * The project dashboard's Delete opens the list on its one-row Delete window (step-05 S4, owner
 * 2026-11-13, P5-Q2): a list that loads takes the instruction once mounted, one already open is
 * pushed it. The window opens once the project is among those the list loaded; it only asks, and
 * nothing runs before its red button.
 */
describe('useListBatch: the Delete window on arrival', () => {
    it('takes the held instruction and opens the Delete window on that one project', async () => {
        holds('/p/kukla');
        const { result } = renderHook(() => useListBatch(jest.fn(), LOADED));

        await waitFor(() =>
            expect(prepares()).toEqual([{ action: 'delete', projectPaths: ['/p/kukla'] }])
        );
        expect(result.current.batch.view).toEqual({
            phase: 'reading',
            action: 'delete',
            names: ['Kukla Luma'],
        });
        expect(sentTypes()).not.toContain('runProjectsBatch');
    });

    it('waits for the projects to load, then opens it once', async () => {
        holds('/p/kukla');
        const { rerender } = renderHook(({ projects }) => useListBatch(jest.fn(), projects), {
            initialProps: { projects: NO_PROJECTS },
        });
        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeDeleteRequest'));
        expect(prepares()).toStrictEqual([]);

        rerender({ projects: LOADED });
        await waitFor(() => expect(prepares()).toHaveLength(1));
        rerender({ projects: [...LOADED] });

        expect(prepares()).toEqual([{ action: 'delete', projectPaths: ['/p/kukla'] }]);
    });

    it('opens it on a list already open when the instruction is pushed', async () => {
        holds(null);
        renderHook(() => useListBatch(jest.fn(), LOADED));
        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeDeleteRequest'));

        const pushed: OpenDeleteWindowPayload = { projectPath: '/p/kukla' };
        act(() => webviewClientHandlers.get('openDeleteWindow')?.(pushed));

        await waitFor(() =>
            expect(prepares()).toEqual([{ action: 'delete', projectPaths: ['/p/kukla'] }])
        );
    });

    it('opens nothing when nothing is held', async () => {
        holds(null);
        renderHook(() => useListBatch(jest.fn(), LOADED));

        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeDeleteRequest'));
        expect(prepares()).toStrictEqual([]);
    });

    // Found by the visual check (step-05 S4): its harness answers the arrival question with nothing,
    // and reading `data.projectPath` through that threw on every load of the projects list.
    it.each([
        ['nothing', null],
        ['a refusal with no data', { success: false, error: 'Unknown message' }],
    ])('opens nothing, and throws nothing, when the answer is %s', async (_what, answer) => {
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);
        mockRequest.mockImplementation((type: string) =>
            type === 'takeDeleteRequest' ? Promise.resolve(answer) : new Promise(() => undefined)
        );
        renderHook(() => useListBatch(jest.fn(), LOADED));

        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeDeleteRequest'));
        await act(async () => {
            await Promise.resolve();
        });
        process.off('unhandledRejection', unhandled);

        expect(prepares()).toStrictEqual([]);
        expect(unhandled).not.toHaveBeenCalled();
    });

    it('opens nothing for a project the list does not have', async () => {
        holds('/p/gone');
        renderHook(() => useListBatch(jest.fn(), LOADED));

        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeDeleteRequest'));
        expect(prepares()).toStrictEqual([]);
    });
});
