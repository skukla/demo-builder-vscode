/**
 * useProjectHolding tests: what the Datapacks screen reads about the open project.
 *
 * Characterisation tests, written when the reads moved out of `DatapackCatalogView`
 * (step-04 R1): they pin the behaviour the view's suites already relied on.
 */

import '../../../../helpers/webviewClientMock';
import { act, renderHook, waitFor } from '@testing-library/react';

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { useProjectHolding } from '@/features/data-installer/ui/hooks/useProjectHolding';

const mockRequest = webviewClient.request as jest.Mock;

const PROJECT = {
    projectName: 'demo',
    instance: 'https://store.example.test',
    installedAt: '2026-11-10T09:15:00Z',
    datapack: { name: 'luma', version: 'main' },
};

/** Answers each request by its type; anything unnamed refuses. */
function answer(byType: Record<string, unknown>): void {
    mockRequest.mockImplementation((type: string) =>
        type in byType
            ? Promise.resolve({ success: true, data: byType[type] })
            : Promise.resolve({ success: false, error: 'not here' })
    );
}

function callsOf(type: string): unknown[] {
    return mockRequest.mock.calls.filter((call) => call[0] === type).map((call) => call[1]);
}

describe('useProjectHolding', () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('reads nothing in the Datapack Library', () => {
        answer({ 'get-datapack-import-target': PROJECT });

        const { result } = renderHook(() => useProjectHolding(true));

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current.held).toBeUndefined();
    });

    // Walk F92: in a project's Datapacks the flyout waits for the project's first answer.
    it('has not answered in a project until the project read comes back', async () => {
        let resolveProject: (value: unknown) => void = () => undefined;
        mockRequest.mockImplementation((type: string) =>
            type === 'get-datapack-import-target'
                ? new Promise((resolve) => {
                      resolveProject = resolve;
                  })
                : new Promise(() => undefined)
        );

        const { result } = renderHook(() => useProjectHolding(false));

        expect(result.current.projectAnswered).toBe(false);
        await act(async () => resolveProject({ success: true, data: { projectName: 'demo' } }));
        expect(result.current.projectAnswered).toBe(true);
    });

    it('has answered in a project once the project read refuses', async () => {
        answer({});

        const { result } = renderHook(() => useProjectHolding(false));

        await waitFor(() => expect(result.current.projectAnswered).toBe(true));
        expect(result.current.held).toBeUndefined();
    });

    // The Datapack Library reads no project, so there is nothing to wait for.
    it('has answered in the Datapack Library from the first render', () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));

        const { result } = renderHook(() => useProjectHolding(true));

        expect(result.current.projectAnswered).toBe(true);
    });

    it('reports the held datapack, its install time, and the union of both self-reports', async () => {
        answer({
            'get-datapack-import-target': PROJECT,
            'list-installed-datapacks': { items: [{ id: { name: 'bodea', version: 'main' } }] },
        });

        const { result } = renderHook(() => useProjectHolding(false));

        await waitFor(() => expect(result.current.installedPacks.size).toBe(2));
        expect([...result.current.installedPacks].sort()).toEqual(['bodea', 'luma']);
        expect(result.current.held).toEqual({ name: 'luma', version: 'main' });
        expect(result.current.installedAt).toBe('2026-11-10T09:15:00Z');
        expect(result.current.projectAnswered).toBe(true);
        expect(callsOf('list-installed-datapacks')).toEqual([
            { commerceInstance: PROJECT.instance },
        ]);
    });

    it('does not read the installed list when the project names no instance', async () => {
        answer({ 'get-datapack-import-target': { projectName: 'demo' } });

        const { result } = renderHook(() => useProjectHolding(false));

        await waitFor(() => expect(result.current.projectAnswered).toBe(true));
        expect(callsOf('list-installed-datapacks')).toStrictEqual([]);
        expect(result.current.installedPacks.size).toBe(0);
    });

    it('reloadHolding reads the project and the installed list again; reloadProject only the project', async () => {
        answer({
            'get-datapack-import-target': PROJECT,
            'list-installed-datapacks': { items: [] },
        });
        const { result } = renderHook(() => useProjectHolding(false));
        await waitFor(() => expect(callsOf('list-installed-datapacks')).toHaveLength(1));

        await act(async () => result.current.reloadHolding());
        expect(callsOf('get-datapack-import-target')).toHaveLength(2);
        expect(callsOf('list-installed-datapacks')).toHaveLength(2);

        await act(async () => result.current.reloadProject());
        expect(callsOf('get-datapack-import-target')).toHaveLength(3);
        expect(callsOf('list-installed-datapacks')).toHaveLength(2);
    });
});
