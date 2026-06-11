/**
 * edsHelpers — applyDaLiveOrgConfigSettings routing tests
 *
 * applyDaLiveOrgConfigSettings reads two VS Code settings and routes each to a
 * different config scope on DA.live:
 *   - aem.repositoryId (from demoBuilder.daLive.aemAuthorUrl) → SITE config
 *     (applySiteConfig) — da.live's Library reads the AEM Assets binding from
 *     the per-site config, so it must be written site-scoped.
 *   - editor.path (built from demoBuilder.daLive.IMSOrgId) → ORG config
 *     (applyOrgConfig) — Universal Editor path mapping stays org-scoped.
 *
 * Each write is independent (either or both may run). Neither setting → no
 * calls at all (skip silently).
 */

/* eslint-disable no-var */
var mockAemAuthorUrl: string | undefined;
var mockImsOrgId: string | undefined;
var mockEditorPathPrefix: string | undefined;
/* eslint-enable no-var */

jest.mock('vscode', () => {
    return {
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn((key: string, defaultValue?: unknown) => {
                    if (key === 'aemAuthorUrl') return mockAemAuthorUrl;
                    if (key === 'IMSOrgId') return mockImsOrgId;
                    if (key === 'editorPathPrefix') {
                        return mockEditorPathPrefix === undefined ? defaultValue : mockEditorPathPrefix;
                    }
                    return defaultValue;
                }),
            }),
        },
    };
}, { virtual: true });

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

// Service imports required by the edsHelpers module to load.
jest.mock('@/features/eds/services/githubTokenService');
jest.mock('@/features/eds/services/githubRepoOperations');
jest.mock('@/features/eds/services/githubFileOperations');
jest.mock('@/features/eds/services/githubOAuthService');
jest.mock('@/features/eds/services/daLiveAuthService');
jest.mock('@/features/eds/services/daLiveOrgOperations', () => ({
    hasWriteAccess: jest.fn(),
}));
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(),
}));

import { applyDaLiveOrgConfigSettings } from '@/features/eds/handlers/edsHelpers';
import type { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

const AEM_AUTHOR_URL = 'author-p158081-e1683323.adobeaemcloud.com';
const IMS_ORG_ID = 'ABCDEF1234567890@AdobeOrg';
const DA_LIVE_ORG = 'leahrayard';
const DA_LIVE_SITE = 'leah-b2b-demo';

describe('applyDaLiveOrgConfigSettings — config scope routing', () => {
    let mockApplySiteConfig: jest.Mock;
    let mockApplyOrgConfig: jest.Mock;
    let mockContentOps: DaLiveContentOperations;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        mockAemAuthorUrl = undefined;
        mockImsOrgId = undefined;
        mockEditorPathPrefix = undefined;

        mockApplySiteConfig = jest.fn().mockResolvedValue({ success: true });
        mockApplyOrgConfig = jest.fn().mockResolvedValue({ success: true });
        mockContentOps = {
            applySiteConfig: mockApplySiteConfig,
            applyOrgConfig: mockApplyOrgConfig,
        } as unknown as DaLiveContentOperations;

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;
    });

    it('routes aem.repositoryId to applySiteConfig with the org and site', async () => {
        mockAemAuthorUrl = AEM_AUTHOR_URL;

        await applyDaLiveOrgConfigSettings(mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger);

        expect(mockApplySiteConfig).toHaveBeenCalledWith(DA_LIVE_ORG, DA_LIVE_SITE, {
            'aem.repositoryId': AEM_AUTHOR_URL,
        });
        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('routes editor.path to applyOrgConfig with the org only', async () => {
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger);

        expect(mockApplyOrgConfig).toHaveBeenCalledTimes(1);
        const [org, updates] = mockApplyOrgConfig.mock.calls[0];
        expect(org).toBe(DA_LIVE_ORG);
        expect(updates['editor.path']).toContain(IMS_ORG_ID);
        expect(updates['editor.path']).toContain(`main--${DA_LIVE_SITE}--${DA_LIVE_ORG}.ue.da.live`);
        expect(mockApplySiteConfig).not.toHaveBeenCalled();
    });

    it('calls BOTH writes when both settings are present (each is independent)', async () => {
        mockAemAuthorUrl = AEM_AUTHOR_URL;
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger);

        expect(mockApplySiteConfig).toHaveBeenCalledWith(DA_LIVE_ORG, DA_LIVE_SITE, {
            'aem.repositoryId': AEM_AUTHOR_URL,
        });
        expect(mockApplyOrgConfig).toHaveBeenCalledTimes(1);
        expect(mockApplyOrgConfig.mock.calls[0][0]).toBe(DA_LIVE_ORG);
    });

    it('skips silently when neither setting is configured (no calls)', async () => {
        await applyDaLiveOrgConfigSettings(mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger);

        expect(mockApplySiteConfig).not.toHaveBeenCalled();
        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });
});
