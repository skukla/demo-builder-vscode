/**
 * The background warm-up of the org's Adobe API list.
 *
 * Its callers' tests check WHEN it runs; this suite checks what it does. It makes
 * no retry of its own: the fetcher's tries run inside the shared request, so a
 * dialog that opens mid-load waits on them too (adobeOrgServices-retry.test.ts).
 */

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));

const mockWithOrgContext = jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    withOrgContext: (t: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(t, fn),
    buildOrgTargetFromProjectAdobe: (adobe?: { organization?: string }) => ({
        orgId: adobe?.organization ?? '',
    }),
}));

import { ServiceLocator } from '@/core/di/serviceLocator';
import { warmOrgServicesCatalog } from '@/features/dashboard/handlers/warmOrgServicesCatalog';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockGetTokenStatus = jest.fn();
const mockGetServicesForOrg = jest.fn();

const PROJECT = createMockProject({
    name: 'demo',
    path: '/p',
    adobe: { organization: 'org-A', projectId: 'p1', workspace: 'w1' },
});

function contextFor(project: Project = PROJECT) {
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue({
        getTokenStatus: mockGetTokenStatus,
        getServicesForOrg: mockGetServicesForOrg,
    });
    return createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetTokenStatus.mockResolvedValue({ isAuthenticated: true });
    mockGetServicesForOrg.mockReset().mockResolvedValue([]);
});

it('loads the project org\'s API list, org-targeted', async () => {
    await warmOrgServicesCatalog(contextFor());

    expect(mockGetServicesForOrg).toHaveBeenCalledTimes(1);
    expect(mockGetServicesForOrg).toHaveBeenCalledWith('org-A');
    expect(mockWithOrgContext).toHaveBeenCalledWith({ orgId: 'org-A' }, expect.any(Function));
});

// A retry here once ran where the Manage APIs dialog could not see it: the dialog
// showed an error while this reloaded the list behind it (2026-09-21).
it('asks once and never throws — the retries belong to the shared request', async () => {
    mockGetServicesForOrg.mockRejectedValue(new Error('504 Gateway Timeout'));

    await expect(warmOrgServicesCatalog(contextFor())).resolves.toBeUndefined();

    expect(mockGetServicesForOrg).toHaveBeenCalledTimes(1);
});

it('does nothing when signed out — a warm-up must never open a browser', async () => {
    mockGetTokenStatus.mockResolvedValue({ isAuthenticated: false });

    await warmOrgServicesCatalog(contextFor());

    expect(mockGetServicesForOrg).not.toHaveBeenCalled();
});

it('does nothing without an org to target', async () => {
    await warmOrgServicesCatalog(
        contextFor(createMockProject({ name: 'demo', path: '/p', adobe: undefined })),
    );

    expect(mockGetTokenStatus).not.toHaveBeenCalled();
    expect(mockGetServicesForOrg).not.toHaveBeenCalled();
});
