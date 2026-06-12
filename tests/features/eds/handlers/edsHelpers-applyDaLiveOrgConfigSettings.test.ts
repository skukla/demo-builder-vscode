/**
 * edsHelpers — applyDaLiveOrgConfigSettings routing tests
 *
 * applyDaLiveOrgConfigSettings reads two VS Code settings and routes each to a
 * config scope on DA.live. Both are now SITE-scoped (applySiteConfig):
 *   - aem.repositoryId (from demoBuilder.daLive.aemAuthorUrl) → SITE config —
 *     da.live's Library reads the AEM Assets binding from the per-site config.
 *   - editor.path (built from demoBuilder.daLive.IMSOrgId) → SITE config. This
 *     is the LOAD-BEARING per-project isolation change: flipping one project's
 *     authoring experience must never clobber sibling sites sharing the same DA
 *     org, so editor.path is keyed on the per-site `/<org>/<site>` row and
 *     written via applySiteConfig — NOT applyOrgConfig.
 *
 * editor.path also branches on the resolved authoring experience:
 *   - Universal Editor: row value punches out to experience.adobe.com.
 *   - Experience Workspace: row value is the da.live-native canvas. The branch
 *     comes from the demoBuilder.daLive.ewCanvasBranch setting (default '' →
 *     the param-less production canvas `https://da.live/canvas#`). The
 *     getConfiguration mock returns the supplied default for unknown keys, so
 *     get('ewCanvasBranch','') yields '' here without extra wiring.
 *
 * Both keys land in the same per-site config, so they are written in a SINGLE
 * merged applySiteConfig call when both are present (one round-trip, no window
 * for a concurrent writer to slip between two writes). Either alone still writes
 * once; neither setting → no calls at all (skip silently).
 */

/* eslint-disable no-var */
var mockAemAuthorUrl: string | undefined;
var mockImsOrgId: string | undefined;
/* eslint-enable no-var */

jest.mock('vscode', () => {
    return {
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn((key: string, defaultValue?: unknown) => {
                    if (key === 'aemAuthorUrl') return mockAemAuthorUrl;
                    if (key === 'IMSOrgId') return mockImsOrgId;
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
const SITE_ROW_KEY = `/${DA_LIVE_ORG}/${DA_LIVE_SITE}`;

describe('applyDaLiveOrgConfigSettings — config scope routing', () => {
    let mockApplySiteConfig: jest.Mock;
    let mockApplyOrgConfig: jest.Mock;
    let mockContentOps: DaLiveContentOperations;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        mockAemAuthorUrl = undefined;
        mockImsOrgId = undefined;

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

    it('routes aem.repositoryId to applySiteConfig with the org and site (regression guard)', async () => {
        mockAemAuthorUrl = AEM_AUTHOR_URL;

        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'universal-editor',
        );

        // 4th arg is removeKeys. This case is UE (default experience) with no
        // IMSOrgId, so there is no editor.path row to write → the stale row is
        // cleared in the SAME call that writes aem.repositoryId. The no-op
        // optimization absorbs the case where no stale row actually exists.
        expect(mockApplySiteConfig).toHaveBeenCalledWith(DA_LIVE_ORG, DA_LIVE_SITE, {
            'aem.repositoryId': AEM_AUTHOR_URL,
        }, ['editor.path']);
        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('routes Universal Editor editor.path to applySiteConfig with a site-scoped row', async () => {
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'universal-editor',
        );

        expect(mockApplySiteConfig).toHaveBeenCalledTimes(1);
        const [org, site, updates, removeKeys] = mockApplySiteConfig.mock.calls[0];
        expect(org).toBe(DA_LIVE_ORG);
        expect(site).toBe(DA_LIVE_SITE);
        const editorRow = updates['editor.path'];
        expect(editorRow).toBe(
            `${SITE_ROW_KEY}=https://experience.adobe.com/#/@${IMS_ORG_ID}/aem/editor/canvas/main--${DA_LIVE_SITE}--${DA_LIVE_ORG}.ue.da.live`,
        );
        // Writing a row → nothing to clear.
        expect(removeKeys).toEqual([]);

        // LOAD-BEARING: editor.path must NOT go through the org-scoped write —
        // that is what isolates sibling sites in a shared DA org.
        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('routes Experience Workspace editor.path to applySiteConfig with the canvas row', async () => {
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'experience-workspace',
        );

        expect(mockApplySiteConfig).toHaveBeenCalledTimes(1);
        const [org, site, updates, removeKeys] = mockApplySiteConfig.mock.calls[0];
        expect(org).toBe(DA_LIVE_ORG);
        expect(site).toBe(DA_LIVE_SITE);
        expect(updates['editor.path']).toBe(`${SITE_ROW_KEY}=https://da.live/canvas#`);
        // EW always writes the canvas row → nothing to clear.
        expect(removeKeys).toEqual([]);

        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('never calls applyOrgConfig for editor.path (sibling-site isolation proof)', async () => {
        mockAemAuthorUrl = AEM_AUTHOR_URL;
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'universal-editor',
        );

        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('writes BOTH site-scoped keys in a SINGLE merged applySiteConfig call', async () => {
        mockAemAuthorUrl = AEM_AUTHOR_URL;
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'universal-editor',
        );

        // One round-trip carrying both keys — not two separate writes to the
        // same per-site config document.
        expect(mockApplySiteConfig).toHaveBeenCalledTimes(1);
        const [org, site, updates] = mockApplySiteConfig.mock.calls[0];
        expect(org).toBe(DA_LIVE_ORG);
        expect(site).toBe(DA_LIVE_SITE);
        expect(updates['aem.repositoryId']).toBe(AEM_AUTHOR_URL);
        expect(updates['editor.path']).toBe(
            `${SITE_ROW_KEY}=https://experience.adobe.com/#/@${IMS_ORG_ID}/aem/editor/canvas/main--${DA_LIVE_SITE}--${DA_LIVE_ORG}.ue.da.live`,
        );
        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('writes the EW editor.path even when no DA.live settings are configured', async () => {
        // EW's editor.path value (the da.live canvas) is a constant that needs
        // neither aemAuthorUrl nor IMSOrgId, so flipping to EW must take effect on
        // DA even in a minimally-configured environment.
        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'experience-workspace',
        );

        expect(mockApplySiteConfig).toHaveBeenCalledTimes(1);
        const [org, site, updates] = mockApplySiteConfig.mock.calls[0];
        expect(org).toBe(DA_LIVE_ORG);
        expect(site).toBe(DA_LIVE_SITE);
        expect(updates['editor.path']).toBe(`${SITE_ROW_KEY}=https://da.live/canvas#`);
        expect(updates['aem.repositoryId']).toBeUndefined();
        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('clears a stale editor.path for Universal Editor when no IMSOrgId is configured', async () => {
        // UE's editor.path embeds the IMS org id, so with no IMSOrgId there is
        // nothing to WRITE — but da.live may still hold a stale Experience
        // Workspace canvas row from a prior flip. The correct UE-without-IMSOrgId
        // state is NO editor.path row, so applySiteConfig must be CALLED with
        // empty updates and removeKeys: ['editor.path'] to clear it. (The
        // applySiteConfig no-op optimization absorbs the case where no stale row
        // exists, so this is cheap on a fresh UE project.)
        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'universal-editor',
        );

        expect(mockApplySiteConfig).toHaveBeenCalledTimes(1);
        const [org, site, updates, removeKeys] = mockApplySiteConfig.mock.calls[0];
        expect(org).toBe(DA_LIVE_ORG);
        expect(site).toBe(DA_LIVE_SITE);
        expect(updates).toEqual({});
        expect(removeKeys).toEqual(['editor.path']);
        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });
});
