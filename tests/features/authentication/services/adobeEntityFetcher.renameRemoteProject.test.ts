/**
 * AdobeEntityFetcher.renameRemoteProject Unit Tests
 *
 * Remote Adobe I/O project title sync (backlog 2026-07-15 item 5). Mirrors the
 * createProject pattern: SDK-only, explicit org/project ids from the demo's
 * persisted adobe config, never throws — callers treat it as best-effort.
 *
 * editProject is a PATCH (aio-lib-console: patch_console_organizations__orgId__
 * projects__projectId_), so `{ title }` alone is the deliberate minimal payload
 * — the machine `name` and description are never touched by a rename.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { Logger } from '@/types/logger';
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging/debugLogger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

describe('AdobeEntityFetcher.renameRemoteProject()', () => {
    let fetcher: AdobeEntityFetcher;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let editProject: jest.Mock;

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());

        editProject = jest.fn().mockResolvedValue({ body: {} });
        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue({ editProject }),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        fetcher = new AdobeEntityFetcher(
            createMockCommandExecutor({ execute: jest.fn() }),
            mockSDKClient,
            {} as unknown as AuthCacheManager,
            createMockLogger() as unknown as jest.Mocked<Logger>,
            { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>,
            {}
        );
    });

    it('PATCHes only the title to the given org/project and reports success', async () => {
        const ok = await fetcher.renameRemoteProject('org-1', 'proj-1', 'New Title');

        expect(ok).toBe(true);
        expect(editProject).toHaveBeenCalledWith('org-1', 'proj-1', { title: 'New Title' });
    });

    it('reports false without calling the API when the SDK is unavailable', async () => {
        (mockSDKClient.isInitialized as jest.Mock).mockReturnValue(false);

        const ok = await fetcher.renameRemoteProject('org-1', 'proj-1', 'New Title');

        expect(ok).toBe(false);
        expect(editProject).not.toHaveBeenCalled();
    });

    it('never throws — an API refusal (e.g. wrong org, 403) reports false', async () => {
        editProject.mockRejectedValue(new Error('403 Forbidden'));

        const ok = await fetcher.renameRemoteProject('org-1', 'proj-1', 'New Title');

        expect(ok).toBe(false);
    });
});
