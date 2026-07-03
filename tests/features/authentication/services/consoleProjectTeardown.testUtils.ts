/**
 * Shared harness for the consoleProjectTeardown test suites.
 *
 * Plain-object TeardownDeps mock (same pattern as the apiSubscriber client
 * tests): every dep is a jest.fn(). Events clients are minted per apiKey so
 * tests can assert "each workspace uses its own client" and pre-configure a
 * client's behavior via `clientFor(apiKey)` BEFORE running the teardown —
 * `createEventsClient` hands back the same instance during the run.
 */

import type {
    TeardownDeps,
    TeardownTarget,
    TeardownEventsClient,
} from '@/features/authentication/services/consoleProjectTeardown';
import {
    IoEventsApiError,
    THIRD_PARTY_PROVIDER_METADATA,
    type RawProvider,
} from '@/features/authentication/services/ioEventsClient';
import type { WorkspaceS2SCredentialIds } from '@/features/authentication/services/types';

/** Canonical teardown target used across the suites. */
export const TARGET: TeardownTarget = {
    orgId: 'org1',
    projectId: 'proj1',
    projectTitle: 'My Demo',
};

export const CRED_WS1: WorkspaceS2SCredentialIds = {
    clientId: 'client-ws1',
    idIntegration: 'int-ws1',
};

export const CRED_WS2: WorkspaceS2SCredentialIds = {
    clientId: 'client-ws2',
    idIntegration: 'int-ws2',
};

export const WORKSPACES = [
    { id: 'ws1', name: 'Production' },
    { id: 'ws2', name: 'Stage' },
];

/** An I/O Events 403 — what an unsubscribed credential produces. */
export function accessDenied(label = 'List providers'): IoEventsApiError {
    return new IoEventsApiError(`${label} failed (HTTP 403)`, 403);
}

/** Raw provider bound to a project/workspace via its `rel:update` href. */
export function boundProvider(
    id: string,
    projectId: string,
    workspaceId: string,
    label?: string,
): RawProvider {
    return {
        id,
        label,
        provider_metadata: THIRD_PARTY_PROVIDER_METADATA,
        _links: {
            'rel:update': {
                href: `/events/org1/${projectId}/${workspaceId}/providers/${id}`,
            },
        },
    };
}

export type MockedEventsClient = { [K in keyof TeardownEventsClient]: jest.Mock };

export interface HarnessOptions {
    workspaces?: Array<{ id: string; name: string }>;
    /** wsId → credential; omit a key (or pass undefined/empty clientId) for "no credential". */
    credentials?: Record<string, WorkspaceS2SCredentialIds | undefined>;
    /** Org-wide provider list served by every client's listProviders. */
    providers?: RawProvider[];
}

export function makeHarness(options: HarnessOptions = {}) {
    const workspaces = options.workspaces ?? WORKSPACES;
    const credentials = options.credentials ?? { ws1: CRED_WS1, ws2: CRED_WS2 };
    const providers = options.providers ?? [];

    const clients = new Map<string, MockedEventsClient>();
    const clientFor = (apiKey: string): MockedEventsClient => {
        let client = clients.get(apiKey);
        if (!client) {
            client = {
                listProviders: jest.fn().mockResolvedValue(providers),
                listRegistrations: jest.fn().mockResolvedValue([]),
                deleteRegistration: jest.fn().mockResolvedValue(undefined),
                deleteProvider: jest.fn().mockResolvedValue(undefined),
            };
            clients.set(apiKey, client);
        }
        return client;
    };

    const deps = {
        getAccessToken: jest.fn().mockResolvedValue('token-abc'),
        getWorkspaces: jest.fn().mockResolvedValue(workspaces),
        getWorkspaceS2SCredential: jest.fn(
            (_orgId: string, _projectId: string, workspaceId: string) =>
                Promise.resolve(credentials[workspaceId]),
        ),
        createWorkspaceS2SCredentialFor: jest.fn(
            (_orgId: string, _projectId: string, workspaceId: string) =>
                Promise.resolve({
                    clientId: `client-${workspaceId}-new`,
                    idIntegration: `int-${workspaceId}-new`,
                }),
        ),
        subscribeManagementApi: jest.fn().mockResolvedValue(undefined),
        deleteConsoleProject: jest.fn().mockResolvedValue(undefined),
        createEventsClient: jest.fn(
            (auth: { accessToken: string; apiKey: string }) => clientFor(auth.apiKey),
        ),
    } satisfies TeardownDeps;

    return { deps, clientFor };
}

export type Harness = ReturnType<typeof makeHarness>;
