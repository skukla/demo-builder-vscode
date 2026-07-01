/**
 * AdobeEntityFetcher.createProject Unit Tests
 *
 * In-app Adobe I/O App Builder project creation. Mirrors the createWorkspaceCredential
 * pattern: SDK-only (no CLI fallback), needs org id, validates input, never throws.
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

describe('AdobeEntityFetcher.createProject()', () => {
    let fetcher: AdobeEntityFetcher;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let createFireflyProject: jest.Mock;

    const ORG = { id: 'org-123', code: 'ORG@AdobeOrg', name: 'Test Org' };

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        });
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try { return JSON.parse(str); } catch { return null; }
        });

        mockCommandExecutor = { execute: jest.fn() } as unknown as jest.Mocked<CommandExecutor>;

        createFireflyProject = jest.fn();
        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue({ createFireflyProject }),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        mockCacheManager = {
            getCachedOrganization: jest.fn().mockReturnValue(ORG),
            getCachedProject: jest.fn().mockReturnValue(undefined),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockLogger = {
            debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;
        mockStepLogger = { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>;

        fetcher = new AdobeEntityFetcher(
            mockCommandExecutor, mockSDKClient, mockCacheManager, mockLogger, mockStepLogger, {},
        );
    });

    it('creates an App Builder project and returns the mapped AdobeProject', async () => {
        createFireflyProject.mockResolvedValue({
            body: { id: 'proj-new', name: 'My Demo', title: 'My Demo', org_id: 'org-123' },
        });

        const result = await fetcher.createProject('My Demo', 'A demo project');

        expect(result).toEqual({
            id: 'proj-new', name: 'My Demo', title: 'My Demo', description: undefined, org_id: 'org-123',
        });
    });

    it('passes the free-form title through and derives an alphanumeric name from it', async () => {
        createFireflyProject.mockResolvedValue({ body: { id: 'p1', name: 'MyDemo', title: 'My Demo' } });

        // "My Demo" has a space — Adobe rejects a spaced `name`, so it must be stripped.
        await fetcher.createProject('My Demo', 'A demo project');

        expect(createFireflyProject).toHaveBeenCalledWith(
            'org-123',
            expect.objectContaining({
                title: 'My Demo',
                name: expect.stringMatching(/^MyDemo[A-Za-z0-9]+$/),
                who_created: 'Demo Builder',
            }),
        );
    });

    it('returns undefined for an empty name (no SDK call)', async () => {
        const result = await fetcher.createProject('', 'desc');
        expect(result).toBeUndefined();
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('returns undefined for a name longer than 200 chars (no SDK call)', async () => {
        const result = await fetcher.createProject('x'.repeat(201), 'desc');
        expect(result).toBeUndefined();
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('returns undefined for a description longer than 500 chars (no SDK call)', async () => {
        const result = await fetcher.createProject('My Demo', 'd'.repeat(501));
        expect(result).toBeUndefined();
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('returns undefined when no organization is selected', async () => {
        mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toBeUndefined();
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('returns undefined when the SDK is not initialized', async () => {
        mockSDKClient.isInitialized.mockReturnValue(false);
        mockSDKClient.ensureInitialized.mockResolvedValue(false);
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toBeUndefined();
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('returns undefined when the SDK throws (e.g. permission denied)', async () => {
        createFireflyProject.mockRejectedValue(new Error('403 Forbidden'));
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toBeUndefined();
    });

    it('returns undefined on a 409 Conflict (name already taken)', async () => {
        createFireflyProject.mockRejectedValue(new Error('409 Conflict'));
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toBeUndefined();
    });

    it('returns undefined when the response has no project body', async () => {
        createFireflyProject.mockResolvedValue({ body: undefined });
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toBeUndefined();
    });
});
