/**
 * useEntityCreate — the create window's state and its create, read against the handler answers
 * it must survive. The window itself is AddIntegrationFlowModal.create.test.tsx; this pins the
 * response contract the old in-list create form held (moved here with the create, walk F286).
 *
 * The project half runs the REAL useProjectCreationPhases; only the webview request is faked.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import { useEntityCreate } from '@/features/project-creation/ui/components/integration-flow/useEntityCreate';
import type { AdobeAuthSessionState, WizardState } from '@/types/webview';

const STATE = {
    adobeOrg: { id: 'org-1', code: 'ORG@AdobeOrg', name: 'Test Org' },
    adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
} as AdobeAuthSessionState;
const WS = { id: 'w-new', name: 'Production', title: 'Production' };

function setup() {
    const updateState = jest.fn<void, [Partial<WizardState>]>();
    const onCreated = jest.fn();
    const hook = renderHook(() => useEntityCreate({ state: STATE, updateState, onCreated }));
    return { hook, updateState, onCreated };
}

async function createNamed(
    hook: ReturnType<typeof setup>['hook'],
    entity: 'project' | 'workspace',
    name: string
) {
    act(() => hook.result.current.open(entity));
    act(() => hook.result.current.setName(name));
    await act(async () => hook.result.current.submit());
}

beforeEach(() => mockRequest.mockReset());

describe('a workspace create', () => {
    it('commits the new workspace and the refreshed list, then reports it made', async () => {
        mockRequest.mockResolvedValue({ success: true, data: WS, workspaces: [WS] });
        const { hook, updateState, onCreated } = setup();

        await createNamed(hook, 'workspace', 'Production');

        expect(updateState).toHaveBeenCalledWith({ adobeWorkspace: WS, workspacesCache: [WS] });
        expect(onCreated).toHaveBeenCalledWith('workspace');
        expect(hook.result.current.entity).toBeUndefined();
    });

    it('clears the cache when the answer carries no list, so the picker reloads', async () => {
        mockRequest.mockResolvedValue({ success: true, data: WS });
        const { hook, updateState } = setup();

        await createNamed(hook, 'workspace', 'Production');

        expect(updateState).toHaveBeenCalledWith({
            adobeWorkspace: WS,
            workspacesCache: undefined,
        });
        expect(Object.keys(updateState.mock.calls[0][0])).toContain('workspacesCache');
    });

    it('reads success without data as a failure, writing nothing', async () => {
        mockRequest.mockResolvedValue({ success: true });
        const { hook, updateState, onCreated } = setup();

        await createNamed(hook, 'workspace', 'Production');

        expect(hook.result.current.error).toBe('Could not create the workspace.');
        expect(updateState).not.toHaveBeenCalled();
        expect(onCreated).not.toHaveBeenCalled();
    });

    it("shows a rejected request's message", async () => {
        mockRequest.mockRejectedValue(new Error('socket closed'));
        const { hook } = setup();

        await createNamed(hook, 'workspace', 'Production');

        expect(hook.result.current.error).toBe('socket closed');
        expect(hook.result.current.busy).toBe(false);
    });
});

describe('the window itself', () => {
    it('opens empty each time, dropping the last name and refusal', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Workspace limit reached.' });
        const { hook } = setup();
        await createNamed(hook, 'workspace', 'Production');
        expect(hook.result.current.error).toBe('Workspace limit reached.');

        act(() => hook.result.current.close());
        act(() => hook.result.current.open('workspace'));

        expect(hook.result.current.name).toBe('');
        expect(hook.result.current.error).toBeUndefined();
    });

    it("a project's refusal stays under the field and is not a setup failure", async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'name taken' });
        const { hook, onCreated } = setup();

        await createNamed(hook, 'project', 'Kukla Demo');

        expect(hook.result.current.error).toBe('name taken');
        expect(hook.result.current.setupFailure).toBeUndefined();
        expect(hook.result.current.entity).toBe('project');
        expect(onCreated).not.toHaveBeenCalled();
    });
});
