/**
 * Eventing handlers (AB-6 headful) — list + confirm-gated delete.
 *
 * The service is mocked; what this suite pins is the HANDLER contract:
 * project-scoped targeting, unavailability answered as data (not error),
 * the native confirm's exact gating of the delete, and the argument shape
 * the service receives (the mock cannot see a malformed call — so the
 * arguments are asserted, per the repo's standing rule).
 */

const mockLifecycle = {
    listEventEntities: jest.fn(),
    deleteEventEntities: jest.fn(),
};
jest.mock('@/features/authentication/services/eventProviderLifecycle', () => ({
    listEventEntities: (...a: unknown[]) => mockLifecycle.listEventEntities(...a),
    deleteEventEntities: (...a: unknown[]) => mockLifecycle.deleteEventEntities(...a),
}));

jest.mock('@/features/authentication/handlers/eventLifecycleDeps', () => ({
    createEventLifecycleDeps: jest.fn(() => ({ deps: 'stub' })),
}));

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn(() => ({})) },
}));

const mockShowWarningMessage = jest.fn();
jest.mock(
    'vscode',
    () => ({
        window: { showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a) },
    }),
    { virtual: true }
);

import {
    handleDeleteEventEntity,
    handleGetEventEntities,
} from '@/features/dashboard/handlers/eventingHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const ADOBE = { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-1' };

const NO_CONTEXT = 'This project has no Adobe Console context yet.';

function makeContext(adobe: unknown = ADOBE): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue({ name: 'bodea', adobe }),
        }),
    });
}

/** No project at all — `getCurrentProject` answers undefined. */
function makeProjectlessContext(): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(undefined),
        }),
    });
}

describe('handleGetEventEntities', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['no project at all', makeProjectlessContext],
        ['an empty adobe block', () => makeContext({})],
        ['a project whose adobe block is absent', () => makeContext(null)],
        ['organization missing', () => makeContext({ projectId: 'proj-1', workspace: 'ws-1' })],
        ['projectId missing', () => makeContext({ organization: 'org-1', workspace: 'ws-1' })],
        ['workspace missing', () => makeContext({ organization: 'org-1', projectId: 'proj-1' })],
    ])('answers unavailable-as-data with the reason when %s', async (_label, build) => {
        const result = await handleGetEventEntities(build(), {});

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ available: false, reason: NO_CONTEXT });
        expect(mockLifecycle.listEventEntities).not.toHaveBeenCalled();
    });

    it('lists against the PROJECT workspace target', async () => {
        mockLifecycle.listEventEntities.mockResolvedValue({
            providers: [{ id: 'p1' }],
            registrations: [],
        });

        const result = await handleGetEventEntities(makeContext(), {});

        expect(mockLifecycle.listEventEntities).toHaveBeenCalledWith(expect.anything(), {
            orgId: 'org-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ available: true, providers: [{ id: 'p1' }] });
    });

    it('a service failure answers unavailable-as-data with a reason, not a throw', async () => {
        mockLifecycle.listEventEntities.mockRejectedValue(new Error('403'));

        const result = await handleGetEventEntities(makeContext(), {});

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            available: false,
            reason: 'Could not reach Adobe I/O Events — check your Adobe sign-in.',
        });
    });
});

describe('handleDeleteEventEntity', () => {
    beforeEach(() => jest.clearAllMocks());

    it('a cancelled confirm deletes NOTHING and answers cancelled-as-data', async () => {
        mockShowWarningMessage.mockResolvedValue(undefined);

        const result = await handleDeleteEventEntity(makeContext(), {
            kind: 'provider',
            id: 'p1',
            label: 'ERP',
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ deleted: false, cancelled: true });
        expect(mockLifecycle.deleteEventEntities).not.toHaveBeenCalled();
    });

    it('the provider confirm names the LABEL and says types can no longer publish', async () => {
        mockShowWarningMessage.mockResolvedValue(undefined);

        await handleDeleteEventEntity(makeContext(), {
            kind: 'provider',
            id: 'p1',
            label: 'ERP',
        });

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Delete event provider "ERP"?',
            {
                modal: true,
                detail: 'Events of its types can no longer be published in this workspace.',
            },
            'Delete'
        );
    });

    it('the registration confirm falls back to the ID and names delivery stopping', async () => {
        mockShowWarningMessage.mockResolvedValue(undefined);

        await handleDeleteEventEntity(makeContext(), { kind: 'registration', id: 'r1' });

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Delete event registration "r1"?',
            { modal: true, detail: 'Event delivery for this registration stops.' },
            'Delete'
        );
    });

    it('refuses without a Console context, before prompting', async () => {
        const result = await handleDeleteEventEntity(makeContext({}), {
            kind: 'provider',
            id: 'p1',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe(NO_CONTEXT);
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
        expect(mockLifecycle.deleteEventEntities).not.toHaveBeenCalled();
    });

    it('a confirmed provider delete passes the provider-shaped input', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');
        mockLifecycle.deleteEventEntities.mockResolvedValue([
            { kind: 'provider', id: 'p1', outcome: 'deleted' },
        ]);

        const result = await handleDeleteEventEntity(makeContext(), {
            kind: 'provider',
            id: 'p1',
        });

        expect(mockLifecycle.deleteEventEntities).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            { registrationIds: [], providerId: 'p1' }
        );
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ deleted: true });
    });

    it('a confirmed registration delete passes the registration-shaped input', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');
        mockLifecycle.deleteEventEntities.mockResolvedValue([
            { kind: 'registration', id: 'r1', outcome: 'deleted' },
        ]);

        await handleDeleteEventEntity(makeContext(), { kind: 'registration', id: 'r1' });

        expect(mockLifecycle.deleteEventEntities).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            { registrationIds: ['r1'] }
        );
    });

    it('a collected failure surfaces as the handler error', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');
        mockLifecycle.deleteEventEntities.mockResolvedValue([
            { kind: 'provider', id: 'p1', outcome: 'failed', error: 'HTTP 409' },
        ]);

        const result = await handleDeleteEventEntity(makeContext(), {
            kind: 'provider',
            id: 'p1',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('HTTP 409');
    });

    it('a failure with no message falls back to naming the kind', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');
        mockLifecycle.deleteEventEntities.mockResolvedValue([
            { kind: 'registration', id: 'r1', outcome: 'failed' },
        ]);

        const result = await handleDeleteEventEntity(makeContext(), {
            kind: 'registration',
            id: 'r1',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to delete the registration.');
    });

    it('rejects a missing kind or id without prompting', async () => {
        const result = await handleDeleteEventEntity(makeContext(), { id: 'p1' });
        expect(result.success).toBe(false);
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('rejects an entirely absent payload without touching the project', async () => {
        const result = await handleDeleteEventEntity(makeContext(), undefined);

        expect(result.success).toBe(false);
        expect(result.error).toBe('kind (provider|registration) and id are required');
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });
});
