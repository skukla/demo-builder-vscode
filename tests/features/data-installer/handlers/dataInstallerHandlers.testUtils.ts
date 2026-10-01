/**
 * Shared harness for the `dataInstallerHandlers` suite family.
 *
 * THIS FILE OWNS THE MOCK WALL AND THE SUT IMPORT — `jest.mock` hoists above the
 * imports of the module it appears in, not across modules, so a spec importing the
 * handlers itself could bind to an unmocked client (webview-test-authoring §3).
 *
 * Split from the single suite on 2026-10-01, when the datapack library's catalog
 * tests took it past the 750-line CI limit.
 */

import * as vscode from 'vscode';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));
jest.mock('@/features/data-installer/services/dataInstallerClient');

// Below the wall on purpose — see the header.
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import {
    dataInstallerHandlers,
    resolveDataInstallerAccess,
} from '@/features/data-installer/handlers/dataInstallerHandlers';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import type { HandlerContext } from '@/types/handlers';

export { dataInstallerHandlers, resolveDataInstallerAccess };

export const MockedClient = DataInstallerClient as jest.MockedClass<typeof DataInstallerClient>;
export const mockedEnsureAuth = ensureAdobeIOAuth as jest.MockedFunction<typeof ensureAdobeIOAuth>;

export const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

/** Stub the two settings the guard reads. */
export function setupSettings(values: { apiBaseUrl?: unknown; enabled?: unknown } = {}): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string, fallback?: unknown) => {
            if (key === 'apiBaseUrl') return 'apiBaseUrl' in values ? values.apiBaseUrl : BASE;
            if (key === 'enabled') return 'enabled' in values ? values.enabled : true;
            return fallback;
        }),
    });
}

/** A context with the fields the guard and handlers actually touch. */
export function makeAccessContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
    const tokenManager = {
        inspectToken: jest.fn().mockResolvedValue({ valid: true, expiresIn: 55, token: 'tok' }),
    };
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        authManager: createMockAuthenticationService({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue(tokenManager),
        }),
        panel: {} as vscode.WebviewPanel,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    });
}

/** A headless context — what `createHeadlessHandlerContext` produces. */
export function makeHeadlessContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
    return makeAccessContext({ panel: undefined, ...overrides });
}

/** Each spec's beforeEach: calls cleared, the default sign-in and settings back. */
export function resetDataInstallerHandlerMocks(): void {
    jest.clearAllMocks();
    MockedClient.mockClear();
    mockedEnsureAuth.mockResolvedValue({ authenticated: true });
    setupSettings();
}
