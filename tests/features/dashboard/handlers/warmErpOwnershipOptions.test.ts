/**
 * The background start of the "Add another ERP" store read when a project screen opens.
 *
 * How the read is kept belongs to `erpOwnershipOptionsShared` (its own suite); here the kept
 * read passes straight through, and the assertions are on when it starts, what the read is
 * handed, and that it never reports.
 */

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));

const mockResolveAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    resolveAppManagementAuth: (...a: unknown[]) => mockResolveAuth(...a),
}));

const mockReadOptions = jest.fn();
jest.mock('@/features/project-creation/services/erpOwnershipSync', () => ({
    readErpOwnershipOptionsForProject: (...a: unknown[]) => mockReadOptions(...a),
}));

const mockShared = jest.fn((_project: unknown, _id: string, read: () => Promise<unknown>) => read());
jest.mock('@/features/project-creation/services/erpOwnershipOptionsShared', () => ({
    readErpOwnershipOptionsShared: (...a: [unknown, string, () => Promise<unknown>]) => mockShared(...a),
}));

import { ServiceLocator } from '@/core/di/serviceLocator';
import { warmErpOwnershipOptions } from '@/features/dashboard/handlers/warmErpOwnershipOptions';
import type { Project } from '@/types/base';
import { poolUnits } from '../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockGetTokenStatus = jest.fn();
const ERP_ACTIONS = { 'erp/status': 'https://ns.adobeio-static.net/api/v1/web/erp/status' };

const WITH_ERPS = createMockProject({
    name: 'justrite',
    path: '/p',
    appBuilderComponents: {
        'erp-integration': {
            kind: 'integration',
            status: 'deployed',
            source: { owner: 'skukla', repo: 'erp-integration' },
            deployedUrls: ERP_ACTIONS,
        },
    },
});

function contextFor(project: Project | undefined) {
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(
        poolUnits({ getTokenStatus: mockGetTokenStatus }),
    );
    return createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
    });
}

const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };

beforeEach(() => {
    jest.clearAllMocks();
    mockGetTokenStatus.mockResolvedValue({ isAuthenticated: true });
    mockResolveAuth.mockResolvedValue(AUTH);
    mockReadOptions.mockResolvedValue({ websites: [], products: [], erps: [], takenListIds: [] });
});

it('starts the kept read for each integration that serves ERPs', async () => {
    await warmErpOwnershipOptions(contextFor(WITH_ERPS));

    expect(mockShared).toHaveBeenCalledTimes(1);
    expect(mockShared.mock.calls[0][0]).toBe(WITH_ERPS);
    expect(mockShared.mock.calls[0][1]).toBe('erp-integration');
});

it('hands the read the sign-in and the extension\'s credential store, as the dialog does', async () => {
    const context = contextFor(WITH_ERPS);

    await warmErpOwnershipOptions(context);

    const [project, id, auth, , credentials] = mockReadOptions.mock.calls[0];
    expect(project).toBe(WITH_ERPS);
    expect(id).toBe('erp-integration');
    expect(auth).toBe(AUTH);
    expect(credentials).toBe(context.context?.secrets);
});

it('never throws, whatever the read does', async () => {
    mockReadOptions.mockRejectedValue(new Error('Commerce answered 504'));

    await expect(warmErpOwnershipOptions(contextFor(WITH_ERPS))).resolves.toBeUndefined();
});

it('stops when there is no Adobe sign-in for the project\'s org', async () => {
    mockResolveAuth.mockResolvedValue(undefined);

    await warmErpOwnershipOptions(contextFor(WITH_ERPS));

    expect(mockReadOptions).not.toHaveBeenCalled();
});

it('does nothing when signed out: a warm-up must never open a browser', async () => {
    mockGetTokenStatus.mockResolvedValue({ isAuthenticated: false });

    await warmErpOwnershipOptions(contextFor(WITH_ERPS));

    expect(mockResolveAuth).not.toHaveBeenCalled();
    expect(mockReadOptions).not.toHaveBeenCalled();
});

it('does nothing for an integration that deploys no ERP actions', async () => {
    const noErps = createMockProject({
        name: 'storefront',
        path: '/p',
        appBuilderComponents: {
            'other-integration': { kind: 'integration', status: 'deployed', source: { owner: 'o', repo: 'r' } },
        },
    });

    await warmErpOwnershipOptions(contextFor(noErps));

    expect(mockGetTokenStatus).not.toHaveBeenCalled();
    expect(mockReadOptions).not.toHaveBeenCalled();
});

it('does nothing without a current project', async () => {
    await warmErpOwnershipOptions(contextFor(undefined));

    expect(mockReadOptions).not.toHaveBeenCalled();
});
