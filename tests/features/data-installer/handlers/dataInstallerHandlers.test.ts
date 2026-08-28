/**
 * Tests for the Data Installer handler map and its access guard.
 *
 * The guard is the load-bearing part. `ensureAdobeIOAuth` pops a VS Code warning
 * notification, which is correct from a webview and wrong from an MCP tool — a
 * modal on the user's window that blocks the agent until someone clicks it. So the
 * guard branches on `context.panel`, and the headless branch is asserted never to
 * call it.
 */

import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import {
    dataInstallerHandlers,
    resolveDataInstallerAccess,
} from '@/features/data-installer/handlers/dataInstallerHandlers';
import { DataInstallerApiError } from '@/features/data-installer/services/dataInstallerErrors';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import * as vscode from 'vscode';

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));
jest.mock('@/features/data-installer/services/dataInstallerClient');

const MockedClient = DataInstallerClient as jest.MockedClass<typeof DataInstallerClient>;
const mockedEnsureAuth = ensureAdobeIOAuth as jest.MockedFunction<typeof ensureAdobeIOAuth>;

const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

/** Stub the two settings the guard reads. */
function setupSettings(values: { apiBaseUrl?: unknown; enabled?: unknown } = {}): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string, fallback?: unknown) => {
            if (key === 'apiBaseUrl') return 'apiBaseUrl' in values ? values.apiBaseUrl : BASE;
            if (key === 'enabled') return 'enabled' in values ? values.enabled : true;
            return fallback;
        }),
    });
}

/** A context with the fields the guard and handlers actually touch. */
function makeImportHarness(overrides: Partial<HandlerContext> = {}): HandlerContext {
    const tokenManager = { inspectToken: jest.fn().mockResolvedValue({ valid: true, expiresIn: 55, token: 'tok' }) };
    return {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn() },
        debugLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn() },
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue(tokenManager),
        },
        panel: {} as vscode.WebviewPanel,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as unknown as HandlerContext;
}

/** A headless context — what `createHeadlessHandlerContext` produces. */
function makeHeadlessContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
    return makeImportHarness({ panel: undefined, ...overrides });
}

describe('dataInstallerHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        MockedClient.mockClear();
        mockedEnsureAuth.mockResolvedValue({ authenticated: true });
        setupSettings();
    });

    describe('the map', () => {
        const EXPECTED: Array<keyof typeof dataInstallerHandlers> = [
            'check-datapack-service',
            'find-datapacks',
            'get-datapack-detail',
            'list-datapack-data-types',
            'list-installed-datapacks',
            'get-datapack-activity',
        ];

        it('registers exactly the six Stage 1 message types', () => {
            // Count pin. An unregistered type is SILENCE, not an error — the
            // webview request hangs to timeout — so the set is asserted exactly.
            expect(Object.keys(dataInstallerHandlers).sort()).toEqual([...EXPECTED].sort());
        });

        it('maps every type to a function', () => {
            for (const type of EXPECTED) {
                expect(typeof dataInstallerHandlers[type]).toBe('function');
            }
        });

        it('uses kebab-case with no colon, matching the house convention', () => {
            for (const type of Object.keys(dataInstallerHandlers)) {
                expect(type).not.toContain(':');
                expect(type).toMatch(/^[a-z][a-z-]*$/);
            }
        });
    });

    describe('resolveDataInstallerAccess', () => {
        it('returns a client when settings and auth are in order', async () => {
            const access = await resolveDataInstallerAccess(makeImportHarness());
            expect(access.ok).toBe(true);
        });

        it('refuses when the feature is disabled, without constructing a client', async () => {
            setupSettings({ enabled: false });
            const access = await resolveDataInstallerAccess(makeImportHarness());
            expect(access.ok).toBe(false);
            expect(access.ok === false && access.response.code).toBe(ErrorCode.INVALID_OPERATION);
            expect(MockedClient).not.toHaveBeenCalled();
        });

        it('refuses when the base URL is unusable, without constructing a client', async () => {
            setupSettings({ apiBaseUrl: 'not a url' });
            const access = await resolveDataInstallerAccess(makeImportHarness());
            expect(access.ok).toBe(false);
            expect(MockedClient).not.toHaveBeenCalled();
        });

        /**
         * A colleague's 864-line debug log carried ZERO `[Data Installer]` lines
         * while the catalog failed on every surface, because the two config
         * refusals returned in silence. The log is the support artifact; a
         * feature that fails without a trace costs a round trip to the user's
         * settings every single time.
         */
        describe('every config refusal leaves a trace and says how to fix it', () => {
            it('logs the unset base URL by name', async () => {
                setupSettings({ apiBaseUrl: '' });
                const context = makeImportHarness();

                const access = await resolveDataInstallerAccess(context);

                expect(access.ok).toBe(false);
                const logged = JSON.stringify((context.logger.warn as jest.Mock).mock.calls);
                expect(logged).toContain('apiBaseUrl');
            });

            it('logs the disabled feature by name', async () => {
                setupSettings({ enabled: false });
                const context = makeImportHarness();

                await resolveDataInstallerAccess(context);

                const logged = JSON.stringify((context.logger.warn as jest.Mock).mock.calls);
                expect(logged).toContain('enabled');
            });

            /**
             * The code is the discriminator `renderDataInstallerFailure` reads to
             * offer "Open Settings" instead of a Retry that cannot help, so both
             * config refusals must carry it.
             */
            it('codes both config refusals so the UI can offer the settings fix', async () => {
                setupSettings({ apiBaseUrl: '' });
                const unset = await resolveDataInstallerAccess(makeImportHarness());
                setupSettings({ enabled: false });
                const off = await resolveDataInstallerAccess(makeImportHarness());

                expect(unset.ok === false && unset.response.code).toBe(ErrorCode.INVALID_OPERATION);
                expect(off.ok === false && off.response.code).toBe(ErrorCode.INVALID_OPERATION);
            });
        });

        it('logs a URL fingerprint and never the rejected value', async () => {
            const secret = 'http://host.example.invalid/p?token=super-secret';
            setupSettings({ apiBaseUrl: secret });
            const context = makeImportHarness();
            await resolveDataInstallerAccess(context);
            const logged = JSON.stringify((context.logger.warn as jest.Mock).mock.calls);
            expect(logged).not.toContain('super-secret');
            expect(logged).toContain('host.example.invalid');
        });

        it('reports AUTH_REQUIRED when sign-in fails', async () => {
            mockedEnsureAuth.mockResolvedValue({ authenticated: false });
            const access = await resolveDataInstallerAccess(makeImportHarness());
            expect(access.ok === false && access.response.code).toBe(ErrorCode.AUTH_REQUIRED);
        });

        it('reports AUTH_REQUIRED when the token is missing after sign-in', async () => {
            const context = makeImportHarness();
            (context.authManager!.getTokenManager() as unknown as { inspectToken: jest.Mock }).inspectToken
                .mockResolvedValue({ valid: false, expiresIn: 0, token: undefined });
            const access = await resolveDataInstallerAccess(context);
            expect(access.ok === false && access.response.code).toBe(ErrorCode.AUTH_REQUIRED);
        });

        describe('the headless branch', () => {
            it('NEVER calls ensureAdobeIOAuth when there is no panel', async () => {
                // It would pop a modal on the user's window from an agent tool.
                await resolveDataInstallerAccess(makeHeadlessContext());
                expect(mockedEnsureAuth).not.toHaveBeenCalled();
            });

            it('still calls it when a panel IS present', async () => {
                await resolveDataInstallerAccess(makeImportHarness());
                expect(mockedEnsureAuth).toHaveBeenCalledTimes(1);
            });

            it('reports AUTH_REQUIRED with a needsAuth handoff when not signed in', async () => {
                const context = makeHeadlessContext();
                (context.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                const access = await resolveDataInstallerAccess(context);
                expect(access.ok).toBe(false);
                expect(access.ok === false && access.response.code).toBe(ErrorCode.AUTH_REQUIRED);
                expect(access.ok === false && access.response.needsAuth).toBe('adobe');
                expect(mockedEnsureAuth).not.toHaveBeenCalled();
            });
        });
    });

    describe('handler behaviour', () => {
        it('check-datapack-service returns health', async () => {
            const context = makeImportHarness();
            MockedClient.prototype.checkHealth = jest.fn().mockResolvedValue({ reachable: true });
            const res = await dataInstallerHandlers['check-datapack-service'](context);
            expect(res.success).toBe(true);
            expect(res.data).toMatchObject({ reachable: true });
        });

        it('find-datapacks defaults to the curated (shared) catalog', async () => {
            // 23 of 40 live entries are shared; the rest is developer scratch.
            const findDatapacks = jest.fn().mockResolvedValue({ items: [], count: 0, total: 0 });
            MockedClient.prototype.findDatapacks = findDatapacks;
            await dataInstallerHandlers['find-datapacks'](makeImportHarness(), {});
            expect(findDatapacks).toHaveBeenCalledWith(expect.objectContaining({ shared: true }));
        });

        it('find-datapacks drops the shared filter when community packs are requested', async () => {
            const findDatapacks = jest.fn().mockResolvedValue({ items: [], count: 0, total: 0 });
            MockedClient.prototype.findDatapacks = findDatapacks;
            await dataInstallerHandlers['find-datapacks'](makeImportHarness(), { includeCommunity: true });
            expect(findDatapacks.mock.calls[0][0].shared).toBeUndefined();
        });

        it('get-datapack-detail asks for the inventory with EXPLICIT data types', async () => {
            // Omitting data_types trips a live 400, so the detail path derives
            // them from the metadata rather than relying on an "all" default.
            MockedClient.prototype.getDatapackDetail = jest.fn().mockResolvedValue({
                id: { name: 'citisignal_new', version: 'main' },
                displayName: 'CitiSignal',
                shared: true,
                dataTypes: ['categories', 'products'],
                art: {},
            });
            const batch = jest.fn().mockResolvedValue({ present: [], missing: [], presentCount: 0, missingCount: 0, requestedCount: 0 });
            MockedClient.prototype.batchGetDataItems = batch;

            await dataInstallerHandlers['get-datapack-detail'](makeImportHarness(), {
                datapackName: 'citisignal_new',
                version: 'main',
            });

            expect(batch).toHaveBeenCalledWith(
                { name: 'citisignal_new', version: 'main' },
                ['categories', 'products'],
            );
        });

        it('get-datapack-detail skips the inventory call when the datapack has no data types', async () => {
            MockedClient.prototype.getDatapackDetail = jest.fn().mockResolvedValue({
                id: { name: 'empty', version: 'main' },
                displayName: 'Empty',
                shared: false,
                dataTypes: [],
                art: {},
            });
            const batch = jest.fn();
            MockedClient.prototype.batchGetDataItems = batch;

            const res = await dataInstallerHandlers['get-datapack-detail'](makeImportHarness(), {
                datapackName: 'empty',
                version: 'main',
            });

            expect(batch).not.toHaveBeenCalled();
            expect(res.success).toBe(true);
        });

        it('list-datapack-data-types requires an operation mode', async () => {
            const res = await dataInstallerHandlers['list-datapack-data-types'](makeImportHarness(), {});
            expect(res.success).toBe(false);
        });

        it('list-datapack-data-types asks per mode, since the sets differ', async () => {
            const order = jest.fn().mockResolvedValue(['giftcards']);
            MockedClient.prototype.getProcessorOrder = order;
            await dataInstallerHandlers['list-datapack-data-types'](makeImportHarness(), { operationMode: 'import' });
            expect(order).toHaveBeenCalledWith('import');
        });

        it('surfaces an auth failure as AUTH_REQUIRED so the UI offers Sign In', async () => {
            MockedClient.prototype.findDatapacks = jest
                .fn()
                .mockRejectedValue(new DataInstallerApiError('nope', 401, 'find-datapacks'));
            const res = await dataInstallerHandlers['find-datapacks'](makeImportHarness(), {});
            expect(res.success).toBe(false);
            expect(res.code).toBe(ErrorCode.AUTH_REQUIRED);
        });

        it('surfaces other API failures without an auth code', async () => {
            MockedClient.prototype.findDatapacks = jest
                .fn()
                .mockRejectedValue(new DataInstallerApiError('boom', 500, 'find-datapacks'));
            const res = await dataInstallerHandlers['find-datapacks'](makeImportHarness(), {});
            expect(res.success).toBe(false);
            expect(res.code).not.toBe(ErrorCode.AUTH_REQUIRED);
            expect(res.error).toContain('boom');
        });

        it('never lets a thrown error escape as an unhandled rejection', async () => {
            MockedClient.prototype.findDatapacks = jest.fn().mockRejectedValue(new Error('unexpected'));
            const res = await dataInstallerHandlers['find-datapacks'](makeImportHarness(), {});
            expect(res.success).toBe(false);
            expect(res.error).toBeDefined();
        });

        /**
         * The other half of the silence: a refusal now logs, but a FAILED CALL
         * did not, so a reachability problem and a missing setting produced the
         * same empty log. Distinguishing them is the whole reason to read one.
         */
        it('logs a failed call, so the log distinguishes it from a refusal', async () => {
            MockedClient.prototype.findDatapacks = jest
                .fn()
                .mockRejectedValue(new DataInstallerApiError('boom', 500, 'find-datapacks'));
            const context = makeImportHarness();

            await dataInstallerHandlers['find-datapacks'](context, {});

            const logged = JSON.stringify((context.logger.error as jest.Mock).mock.calls);
            expect(logged).toContain('boom');
        });

        it('returns the guard failure unchanged rather than calling the client', async () => {
            setupSettings({ enabled: false });
            const findDatapacks = jest.fn();
            MockedClient.prototype.findDatapacks = findDatapacks;
            const res = await dataInstallerHandlers['find-datapacks'](makeImportHarness(), {});
            expect(res.success).toBe(false);
            expect(findDatapacks).not.toHaveBeenCalled();
        });
    });

    describe('the drift canary reaches the logger', () => {
        it('wires onDrift so a moved shape warns with key names only', async () => {
            await resolveDataInstallerAccess(makeImportHarness());
            const deps = MockedClient.mock.calls[0][0];
            expect(typeof deps.onDrift).toBe('function');

            const context = makeImportHarness();
            const access = await resolveDataInstallerAccess(context);
            expect(access.ok).toBe(true);
            const latest = MockedClient.mock.calls[MockedClient.mock.calls.length - 1][0];
            latest.onDrift!('find-datapacks', ['datapacks']);
            const logged = JSON.stringify((context.logger.warn as jest.Mock).mock.calls);
            expect(logged).toContain('find-datapacks');
            expect(logged).toContain('datapacks');
        });
    });

    describe('token handling', () => {
        it('passes a token provider rather than a token, so it refreshes per call', async () => {
            await resolveDataInstallerAccess(makeImportHarness());
            const deps = MockedClient.mock.calls[0][0];
            expect(typeof deps.getToken).toBe('function');
            await expect(deps.getToken()).resolves.toBe('tok');
        });

        it('never logs the token value', async () => {
            const context = makeImportHarness();
            await resolveDataInstallerAccess(context);
            const allLogs = JSON.stringify([
                (context.logger.info as jest.Mock).mock.calls,
                (context.logger.warn as jest.Mock).mock.calls,
                (context.logger.debug as jest.Mock).mock.calls,
            ]);
            expect(allLogs).not.toContain('tok');
        });
    });
});
