/**
 * AdobeEntityFetcher.createWorkspace Unit Tests
 *
 * In-app Adobe I/O workspace creation. Mirrors createProject: SDK-only (no CLI
 * fallback), needs org id AND project id, validates input, never throws.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { Logger } from '@/types/logger';
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging/debugLogger';
import { parseJSON } from '@/types/typeGuards';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

describe('AdobeEntityFetcher.createWorkspace()', () => {
    let fetcher: AdobeEntityFetcher;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let createWorkspace: jest.Mock;
    let createRuntimeNamespace: jest.Mock;

    const ORG = { id: 'org-123', code: 'ORG@AdobeOrg', name: 'Test Org' };
    const PROJECT = { id: 'proj-456', name: 'Test Project', title: 'Test Project' };

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        mockCommandExecutor = createMockCommandExecutor({ execute: jest.fn() });

        createWorkspace = jest.fn();
        createRuntimeNamespace = jest.fn().mockResolvedValue({ body: {} });
        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue({ createWorkspace, createRuntimeNamespace }),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        mockCacheManager = {
            getCachedOrganization: jest.fn().mockReturnValue(ORG),
            getCachedProject: jest.fn().mockReturnValue(PROJECT),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockLogger = createMockLogger() as unknown as jest.Mocked<Logger>;
        mockStepLogger = { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>;

        fetcher = new AdobeEntityFetcher(
            mockCommandExecutor,
            mockSDKClient,
            mockCacheManager,
            mockLogger,
            mockStepLogger,
            {}
        );
    });

    it('constructs the workspace from the returned workspaceId + the details we sent', async () => {
        // The create endpoint returns ONLY the new id ({ workspaceId }), not a full workspace.
        createWorkspace.mockResolvedValue({ body: { workspaceId: 'ws-new' } });

        const result = await fetcher.createWorkspace('Stage', 'A workspace');

        expect(result).toEqual({
            id: 'ws-new',
            name: expect.stringMatching(/^Stage[A-Za-z0-9]+$/),
            title: 'Stage',
        });
    });

    it('passes the free-form title through and derives an alphanumeric name from it', async () => {
        createWorkspace.mockResolvedValue({ body: { id: 'ws1', name: 'Stage', title: 'Stage' } });

        await fetcher.createWorkspace('My Stage', 'A workspace');

        expect(createWorkspace).toHaveBeenCalledWith(
            'org-123',
            'proj-456',
            expect.objectContaining({
                title: 'My Stage',
                name: expect.stringMatching(/^MyStage[A-Za-z0-9]+$/),
            })
        );
        // See createProject.test.ts: Adobe owns this field; sending a literal is misleading.
        expect(createWorkspace.mock.calls[0][2]).not.toHaveProperty('who_created');
    });

    it('provisions a Runtime namespace on the new workspace', async () => {
        // A user-added workspace also needs Runtime for App Builder app deploys.
        createWorkspace.mockResolvedValue({ body: { workspaceId: 'ws-new' } });

        await fetcher.createWorkspace('Stage', '');

        expect(createRuntimeNamespace).toHaveBeenCalledWith('org-123', 'proj-456', 'ws-new');
    });

    it('returns the workspace even when Runtime provisioning fails (best-effort)', async () => {
        createWorkspace.mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        createRuntimeNamespace.mockRejectedValue(new Error('500 Internal Error'));

        const result = await fetcher.createWorkspace('Stage', '');

        expect(result).toEqual(expect.objectContaining({ id: 'ws-new' }));
    });

    it('names the failure for an empty name (no SDK call)', async () => {
        const result = await fetcher.createWorkspace('', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('1–200 characters') });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('names the failure for a name longer than 200 chars (no SDK call)', async () => {
        const result = await fetcher.createWorkspace('x'.repeat(201), 'desc');
        expect(result).toEqual({ error: expect.stringContaining('1–200 characters') });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('names the failure for a description longer than 500 chars (no SDK call)', async () => {
        const result = await fetcher.createWorkspace('Stage', 'd'.repeat(501));
        expect(result).toEqual({ error: expect.stringContaining('500 characters') });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('names the failure when no organization is selected', async () => {
        mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('No organization or project') });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('names the failure when no project is selected', async () => {
        mockCacheManager.getCachedProject.mockReturnValue(undefined);
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('No organization or project') });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('names the failure when the SDK is not initialized', async () => {
        mockSDKClient.isInitialized.mockReturnValue(false);
        mockSDKClient.ensureInitialized.mockResolvedValue(false);
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('sign in to Adobe') });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('carries the SDK error TEXT when the SDK throws', async () => {
        createWorkspace.mockRejectedValue(new Error('403 Forbidden'));
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('403 Forbidden') });
    });

    it('translates a 409 Conflict into the name-taken reason', async () => {
        createWorkspace.mockRejectedValue(new Error('409 Conflict'));
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('already exists') });
    });

    it('names the failure when the response has no workspace body', async () => {
        createWorkspace.mockResolvedValue({ body: undefined });
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('no workspace id') });
    });
});
