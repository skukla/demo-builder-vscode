/**
 * Shared setup for the `discover-store-structure` handler suites.
 *
 * The handler's job is entirely about what it hands its collaborators and what
 * it answers, so every double here is a jest.fn whose ARGUMENTS the specs assert
 * — a mock cannot see a malformed call, and this handler builds a params object
 * field by field before passing it on.
 *
 * `validateURL` is deliberately NOT mocked: it is pure, and the handler's two
 * URL guards are only meaningful against the real protocol/SSRF rules.
 */

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import type { DiscoveryServiceSelection } from '@/features/eds/services/accsDiscoveryConfig';
import type { HandlerContext } from '@/types/handlers';
import type { StoreDiscoveryResult } from '@/types/commerceStore';
import type { Project } from '@/types/base';

export const mockSelectDiscoveryService = jest.fn<DiscoveryServiceSelection, [string | undefined]>();
export const mockDiscoverStoreStructure = jest.fn();
export const mockEnsureAdobeIOAuth = jest.fn();
export const mockResolvePaasAdminPair = jest.fn();
export const mockInspectToken = jest.fn();

jest.mock('@/features/eds/services/accsDiscoveryConfig', () => ({
    ...jest.requireActual('@/features/eds/services/accsDiscoveryConfig'),
    selectDiscoveryService: (orgId?: string) => mockSelectDiscoveryService(orgId),
}));
jest.mock('@/features/eds/services/commerceStoreDiscovery', () => ({
    ...jest.requireActual('@/features/eds/services/commerceStoreDiscovery'),
    discoverStoreStructure: (params: unknown) => mockDiscoverStoreStructure(params),
}));
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ...jest.requireActual('@/core/auth/adobeAuthGuard'),
    ensureAdobeIOAuth: (options: unknown) => mockEnsureAdobeIOAuth(options),
}));
jest.mock('@/features/components/services/commerceCredentialStore', () => ({
    ...jest.requireActual('@/features/components/services/commerceCredentialStore'),
    resolvePaasAdminPair: (deps: unknown, configs: unknown) =>
        mockResolvePaasAdminPair(deps, configs),
}));

// The subject is imported after the mocks above are registered.
import { handleDiscoverStoreStructure } from '@/features/eds/handlers/edsHandlers';

export { handleDiscoverStoreStructure };

/** The handler's own payload type, read off the function rather than retyped. */
export type DiscoverPayload = NonNullable<Parameters<typeof handleDiscoverStoreStructure>[1]>;

export const STORE_STRUCTURE: StoreDiscoveryResult = {
    success: true,
    data: {
        websites: [{ id: 1, code: 'base', name: 'Main Website' }],
        storeGroups: [
            { id: 1, code: 'main', name: 'Main Store', website_id: 1, root_category_id: 2 },
        ],
        storeViews: [
            {
                id: 1,
                code: 'default',
                name: 'Default View',
                store_group_id: 1,
                website_id: 1,
                is_active: 1,
            },
        ],
    },
};

/** An auth manager whose token inspection is steerable per test. */
export function authManagerFake(): HandlerContext['authManager'] {
    return {
        isAuthenticated: jest.fn().mockResolvedValue(true),
        loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        getTokenManager: () => ({ inspectToken: mockInspectToken }),
    } as unknown as HandlerContext['authManager'];
}

export interface ContextOptions {
    /** Omit the state manager entirely (a headless caller with no project store). */
    withoutStateManager?: boolean;
    /** Omit the auth manager (the ACCS path's second guard). */
    withoutAuthManager?: boolean;
    /** Omit SecretStorage but keep the extension context. */
    withoutSecrets?: boolean;
    /** Omit the extension context entirely (a headless caller). */
    withoutExtensionContext?: boolean;
    project?: Project | null;
}

export function makeDiscoveryContext(options: ContextOptions = {}) {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const getCurrentProject = jest.fn().mockResolvedValue(options.project ?? null);
    const secrets = { get: jest.fn(), store: jest.fn(), delete: jest.fn() };

    const context = createMockHandlerContext({
        sendMessage,
        authManager: options.withoutAuthManager ? undefined : authManagerFake(),
        ...(options.withoutStateManager
            ? { stateManager: undefined }
            : { stateManager: createMockStateManager({ getCurrentProject }) }),
        context: (options.withoutExtensionContext
            ? undefined
            : options.withoutSecrets
              ? { extensionPath: '/test/extension/path' }
              : {
                    extensionPath: '/test/extension/path',
                    secrets,
                }) as unknown as HandlerContext['context'],
    });

    return { context, sendMessage, getCurrentProject, secrets };
}

/** The payload the webview sends once a message reaches `store-discovery-result`. */
export function resultMessage(sendMessage: jest.Mock): unknown {
    const call = sendMessage.mock.calls.find(([type]) => type === 'store-discovery-result');
    return call?.[1];
}

export function resetDiscoveryMocks(): void {
    mockSelectDiscoveryService.mockReset();
    mockDiscoverStoreStructure.mockReset();
    mockEnsureAdobeIOAuth.mockReset();
    mockResolvePaasAdminPair.mockReset();
    mockInspectToken.mockReset();

    mockDiscoverStoreStructure.mockResolvedValue(STORE_STRUCTURE);
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockResolvePaasAdminPair.mockResolvedValue(undefined);
    mockInspectToken.mockResolvedValue({ token: 'ims-token', valid: true, expiresIn: 42 });
    mockSelectDiscoveryService.mockReturnValue({
        ok: true,
        serviceUrl: 'https://discovery.example.test/api/v1/web/store-discovery/discover-stores',
    });
}
