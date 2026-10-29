/**
 * The pre-flight both Console create handlers share (PL-69 pair 35): no auth
 * service, no developer permission, no name. What a test can pin is the ORDER
 * the refusals come in, the exact copy per noun, and that the permission probe
 * is called the one way the handlers always called it.
 */

import { gateConsoleCreate } from '@/features/authentication/handlers/consoleCreateGate';
import { ErrorCode } from '@/types/errorCodes';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

function authAnswering(answer: { hasPermissions: boolean; error?: string }) {
    return createMockAuthenticationService({
        testDeveloperPermissions: jest.fn().mockResolvedValue(answer),
    });
}

describe('gateConsoleCreate — the refusals, in order', () => {
    it('refuses with no auth service, before the permission probe runs', async () => {
        const gate = await gateConsoleCreate({ authManager: undefined }, { name: 'Stage' }, 'project');

        expect(gate.refusal).toEqual({ success: false, error: 'Authentication not available' });
    });

    it('asks the permission probe once, with no arguments', async () => {
        const authManager = authAnswering({ hasPermissions: true });

        await gateConsoleCreate({ authManager }, { name: 'Stage' }, 'project');

        expect(authManager.testDeveloperPermissions).toHaveBeenCalledTimes(1);
        expect(authManager.testDeveloperPermissions).toHaveBeenCalledWith();
    });

    it("a denial carries the service's own reason and the AUTH_FORBIDDEN code", async () => {
        const authManager = authAnswering({
            hasPermissions: false,
            error: 'Developer or System Admin role required.',
        });

        const gate = await gateConsoleCreate({ authManager }, { name: 'Stage' }, 'workspace');

        expect(gate.refusal).toEqual({
            success: false,
            code: ErrorCode.AUTH_FORBIDDEN,
            error: 'Developer or System Admin role required.',
        });
    });

    it.each([
        [
            'project',
            'You do not have permission to create projects in this organization. Select an existing project instead.',
        ],
        [
            'workspace',
            'You do not have permission to create workspaces in this organization. Select an existing workspace instead.',
        ],
    ] as const)('a denial without a reason falls back to the %s copy', async (noun, copy) => {
        const authManager = authAnswering({ hasPermissions: false });

        const gate = await gateConsoleCreate({ authManager }, { name: 'Stage' }, noun);

        expect(gate.refusal?.error).toBe(copy);
        expect(gate.refusal?.code).toBe(ErrorCode.AUTH_FORBIDDEN);
    });

    it('permission is checked before the name: a denied caller with no name sees the denial', async () => {
        const authManager = authAnswering({ hasPermissions: false });

        const gate = await gateConsoleCreate({ authManager }, { name: '' }, 'project');

        expect(gate.refusal?.code).toBe(ErrorCode.AUTH_FORBIDDEN);
    });

    it.each([
        ['project', 'Project name is required.'],
        ['workspace', 'Workspace name is required.'],
    ] as const)('a blank %s name is refused with no code', async (noun, copy) => {
        const authManager = authAnswering({ hasPermissions: true });

        const gate = await gateConsoleCreate({ authManager }, { name: '   ' }, noun);

        expect(gate.refusal).toEqual({ success: false, error: copy });
    });

    it('a missing payload is a blank name, not a crash', async () => {
        const authManager = authAnswering({ hasPermissions: true });

        const gate = await gateConsoleCreate({ authManager }, undefined, 'project');

        expect(gate.refusal).toEqual({ success: false, error: 'Project name is required.' });
    });

    it('lets the probe’s failure through: the caller’s catch owns that answer', async () => {
        const failure = new Error('IMS unreachable');
        const authManager = createMockAuthenticationService({
            testDeveloperPermissions: jest.fn().mockRejectedValue(failure),
        });

        await expect(gateConsoleCreate({ authManager }, { name: 'Stage' }, 'project')).rejects.toBe(
            failure,
        );
    });
});

describe('gateConsoleCreate — what a permitted create gets', () => {
    it('hands back the SAME auth service, the trimmed name and the description', async () => {
        const authManager = authAnswering({ hasPermissions: true });

        const gate = await gateConsoleCreate(
            { authManager },
            { name: '  My Demo  ', description: 'for the loop' },
            'project',
        );

        expect(gate.refusal).toBeUndefined();
        expect(gate.authManager).toBe(authManager);
        expect(gate.name).toBe('My Demo');
        expect(gate.description).toBe('for the loop');
    });

    it('an omitted description is the empty string, so the SDK call always gets one', async () => {
        const authManager = authAnswering({ hasPermissions: true });

        const gate = await gateConsoleCreate({ authManager }, { name: 'Stage' }, 'workspace');

        expect(gate.description).toBe('');
    });
});
