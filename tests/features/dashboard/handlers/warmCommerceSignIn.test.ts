/**
 * The background Commerce sign-in a project screen starts when it opens.
 *
 * Its callers' tests check WHEN it runs (warmProjectReads, the dashboard, the Integrations
 * command); this suite checks what it does. The sign-in itself, its single flight and the
 * credential kept across reloads, belong to the REST client.
 */

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));

const mockResolveRestTarget = jest.fn();
jest.mock('@/features/ai/server/commerceRestClient', () => ({
    resolveRestTarget: (...args: unknown[]) => mockResolveRestTarget(...args),
}));

import { ServiceLocator } from '@/core/di/serviceLocator';
import { warmCommerceSignIn } from '@/features/dashboard/handlers/warmCommerceSignIn';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { poolUnits } from '../../../helpers/authenticationServiceFake';

const mockGetTokenStatus = jest.fn();

const WITH_INTEGRATION = createMockProject({
    name: 'justrite',
    path: '/p',
    appBuilderComponents: {
        'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 'skukla', repo: 'erp-integration' } },
    },
});

function contextFor(project: Project | undefined) {
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(
        poolUnits({ getTokenStatus: mockGetTokenStatus }),
    );
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
    mockResolveRestTarget.mockResolvedValue({ base: 'https://store.example', token: 't' });
});

it('signs in to Commerce with the panel\'s own context', async () => {
    const context = contextFor(WITH_INTEGRATION);

    await warmCommerceSignIn(context);

    expect(mockResolveRestTarget).toHaveBeenCalledTimes(1);
    expect(mockResolveRestTarget.mock.calls[0][0]).toBe(context);
});

it('never throws, whatever the sign-in does', async () => {
    mockResolveRestTarget.mockRejectedValue(new Error('Console answered 504'));

    await expect(warmCommerceSignIn(contextFor(WITH_INTEGRATION))).resolves.toBeUndefined();
});

it('does nothing when signed out: a warm-up must never open a browser', async () => {
    mockGetTokenStatus.mockResolvedValue({ isAuthenticated: false });

    await warmCommerceSignIn(contextFor(WITH_INTEGRATION));

    expect(mockResolveRestTarget).not.toHaveBeenCalled();
});

it('does nothing for a project with no integration: nothing there reads the store', async () => {
    await warmCommerceSignIn(contextFor(createMockProject({ name: 'storefront', path: '/p' })));

    expect(mockGetTokenStatus).not.toHaveBeenCalled();
    expect(mockResolveRestTarget).not.toHaveBeenCalled();
});

it('does nothing without a current project', async () => {
    await warmCommerceSignIn(contextFor(undefined));

    expect(mockResolveRestTarget).not.toHaveBeenCalled();
});
