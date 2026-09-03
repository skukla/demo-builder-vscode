/**
 * Shared preamble for the split importHandlers suites.
 *
 * Owns the mocks AND the SUT import (§3 of webview-test-authoring: `jest.mock`
 * hoists only within the module it appears in, so a spec that imported
 * `importHandlers` itself could bind to the REAL write client). Specs import
 * everything from here and never reach for the handlers directly.
 *
 * Split out when `importHandlers.test.ts` crossed the 500-line cap.
 */

import * as vscode from 'vscode';
import { DataInstallerWriteClient } from '@/features/data-installer/services/dataInstallerWriteClient';
import { watchImportJob } from '@/features/data-installer/services/importJobRunner';
import type { Project } from '@/types/base';

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));
// `PollingService` reads the GLOBAL logger at construction, and the extension
// host initializes that at activation — which no handler test does. Without this
// the detached watch dies in its own try/catch and simply never starts, showing
// up as "watchImportJob was not called" rather than as a logger error.
jest.mock('@/features/data-installer/services/dataInstallerWriteClient');
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));

// Below the mocks on purpose — see the module docstring. `import/first` is not a
// registered rule here, so this needs no disable comment.
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import {
    createMockExtensionContext,
    createStatefulGlobalState,
} from '../../../helpers/extensionContextFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

export { importHandlers };

export const MockedWriteClient = DataInstallerWriteClient as jest.MockedClass<
    typeof DataInstallerWriteClient
>;
export const mockedWatch = watchImportJob as jest.MockedFunction<typeof watchImportJob>;

const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

export function setupSettings(): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => (key === 'apiBaseUrl' ? BASE : true)),
    });
}

/** In-memory globalState + secrets, standing in for the extension context. */
export function makeStores() {
    const { globalState, store: mem } = createStatefulGlobalState();
    const { secrets } = createMockSecretStorage();
    return { globalState, secrets, peek: (k: string) => mem.get(k) };
}

/**
 * A PaaS project, shaped like a PERSISTED one.
 *
 * `componentSelections.backend` is where the backend id actually lives — typed as
 * `Project` on purpose, so tsc rejects an invented field. An earlier fixture used
 * `stack: { backend }`, which exists nowhere in persisted state; every test passed
 * against the invention and the import path could not resolve credentials for any
 * real project. A live dry run found it, not this suite.
 */
export const PAAS_PROJECT: Partial<Project> = {
    name: 'demo-a',
    componentSelections: { backend: 'adobe-commerce-paas' },
    componentConfigs: {
        'adobe-commerce-paas': {
            ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
            ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
        },
    },
};

/**
 * RENAMED from `makeImportHarness` 2026-08-28: this returns a HARNESS
 * ({ context, stores }), not a context. It shared a name with eleven builders
 * that do return one, which is what made a family of unrelated fixtures look
 * like a single duplicated helper.
 */
export function makeImportHarness(project: unknown = PAAS_PROJECT) {
    const stores = makeStores();
    const tokenManager = {
        inspectToken: jest.fn().mockResolvedValue({ valid: true, token: 'tok' }),
    };
    const context = createMockHandlerContext({
        debugLogger: createMockLogger(),
        authManager: createMockAuthenticationService({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue(tokenManager),
        }),
        panel: createMockWebviewPanel(),
        context: createMockExtensionContext({
            globalState: stores.globalState,
            secrets: stores.secrets,
        }),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
    });
    return { context, stores };
}

export const PAYLOAD = {
    datapackName: 'bodea',
    version: 'main',
    commerceInstance: 'whatever-the-user-typed',
    dataTypes: ['categories', 'products'],
};

/**
 * Install a partial write client. The class carries private state no literal can
 * supply, so the methods a test hands in stand for the whole instance.
 */
export function stubWriteClient(methods: Partial<DataInstallerWriteClient>): void {
    MockedWriteClient.mockImplementation(() => methods as DataInstallerWriteClient);
}

/** A write client whose validate passes and whose start is accepted. */
export function happyClient() {
    const validateImport = jest.fn().mockResolvedValue({ valid: true });
    const startImport = jest.fn().mockResolvedValue({ activationId: 'act-1' });
    const startDelete = jest.fn().mockResolvedValue({ activationId: 'act-9' });
    const checkCredentials = jest.fn().mockResolvedValue({ usable: true });
    stubWriteClient({ validateImport, startImport, startDelete, checkCredentials });
    return { validateImport, startImport, startDelete, checkCredentials };
}

/**
 * The preamble every spec runs. A shared `beforeEach` in this module would NOT
 * apply to importing specs, so each calls this from its own.
 */
export function resetImportHandlerMocks(): void {
    jest.clearAllMocks();
    setupSettings();
    mockedWatch.mockResolvedValue({ outcome: 'success', perType: {} });
}
