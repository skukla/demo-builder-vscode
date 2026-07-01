/**
 * AdobeEntityFetcher.createWorkspace Unit Tests
 *
 * In-app Adobe I/O workspace creation. Mirrors createProject: SDK-only (no CLI
 * fallback), needs org id AND project id, validates input, never throws.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger, StepLogger } from '@/core/logging';

jest.mock('@/core/logging');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityFetcher.createWorkspace()', () => {
    let fetcher: AdobeEntityFetcher;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let createWorkspace: jest.Mock;

    const ORG = { id: 'org-123', code: 'ORG@AdobeOrg', name: 'Test Org' };
    const PROJECT = { id: 'proj-456', name: 'Test Project', title: 'Test Project' };

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        });
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try { return JSON.parse(str); } catch { return null; }
        });

        mockCommandExecutor = { execute: jest.fn() } as unknown as jest.Mocked<CommandExecutor>;

        createWorkspace = jest.fn();
        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue({ createWorkspace }),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        mockCacheManager = {
            getCachedOrganization: jest.fn().mockReturnValue(ORG),
            getCachedProject: jest.fn().mockReturnValue(PROJECT),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockLogger = {
            debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;
        mockStepLogger = { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>;

        fetcher = new AdobeEntityFetcher(
            mockCommandExecutor, mockSDKClient, mockCacheManager, mockLogger, mockStepLogger, {},
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
                who_created: 'Demo Builder',
            }),
        );
    });

    it('returns undefined for an empty name (no SDK call)', async () => {
        const result = await fetcher.createWorkspace('', 'desc');
        expect(result).toBeUndefined();
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('returns undefined for a name longer than 200 chars (no SDK call)', async () => {
        const result = await fetcher.createWorkspace('x'.repeat(201), 'desc');
        expect(result).toBeUndefined();
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('returns undefined for a description longer than 500 chars (no SDK call)', async () => {
        const result = await fetcher.createWorkspace('Stage', 'd'.repeat(501));
        expect(result).toBeUndefined();
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('returns undefined when no organization is selected', async () => {
        mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toBeUndefined();
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('returns undefined when no project is selected', async () => {
        mockCacheManager.getCachedProject.mockReturnValue(undefined);
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toBeUndefined();
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('returns undefined when the SDK is not initialized', async () => {
        mockSDKClient.isInitialized.mockReturnValue(false);
        mockSDKClient.ensureInitialized.mockResolvedValue(false);
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toBeUndefined();
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('returns undefined when the SDK throws (e.g. permission denied)', async () => {
        createWorkspace.mockRejectedValue(new Error('403 Forbidden'));
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toBeUndefined();
    });

    it('returns undefined on a 409 Conflict (name already taken)', async () => {
        createWorkspace.mockRejectedValue(new Error('409 Conflict'));
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toBeUndefined();
    });

    it('returns undefined when the response has no workspace body', async () => {
        createWorkspace.mockResolvedValue({ body: undefined });
        const result = await fetcher.createWorkspace('Stage', 'desc');
        expect(result).toBeUndefined();
    });
});
