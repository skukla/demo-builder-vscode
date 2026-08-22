/**
 * daLiveSiteConfig — applyDaLiveOrgConfigSettings routing tests
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

// Service imports required by the daLiveSiteConfig module to load.
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

import { applyDaLiveOrgConfigSettings } from '@/features/eds/handlers/daLiveSiteConfig';
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
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
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
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
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
        // aemAuthorUrl is unset in this case, so the binding is cleared for the
        // same reason a valueless editor.path is — the two keys are symmetric now.
        expect(removeKeys).toEqual(['aem.repositoryId']);

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
        // aemAuthorUrl is unset in this case, so the binding is cleared for the
        // same reason a valueless editor.path is — the two keys are symmetric now.
        expect(removeKeys).toEqual(['aem.repositoryId']);

        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('never calls applyOrgConfig for editor.path (sibling-site isolation proof)', async () => {
        mockAemAuthorUrl = AEM_AUTHOR_URL;
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
        );

        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });

    it('writes BOTH site-scoped keys in a SINGLE merged applySiteConfig call', async () => {
        mockAemAuthorUrl = AEM_AUTHOR_URL;
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
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

    /**
     * Losing the Assets panel because a setting is unset is the same silent
     * failure as the four bugs this branch fixed — and it bit the author within
     * an hour of shipping the no-default change: a reset quietly stripped
     * `aem.repositoryId` from a working site and said so only at info level.
     *
     * The warning fires ONLY when a binding was actually removed. A project that
     * never had one has lost nothing, and warning there would train people to
     * ignore the message that matters.
     */
    describe('losing an existing AEM binding is a warning, not a log line', () => {
        it('warns and names the setting when the binding was actually removed', async () => {
            mockAemAuthorUrl = undefined;
            mockImsOrgId = IMS_ORG_ID;
            mockApplySiteConfig.mockResolvedValue({ success: true, removed: ['aem.repositoryId'] });

            await applyDaLiveOrgConfigSettings(
                mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
            );

            const warned = JSON.stringify((mockLogger.warn as jest.Mock).mock.calls);
            expect(warned).toContain('demoBuilder.daLive.aemAuthorUrl');
        });

        it('stays quiet when there was no binding to lose', async () => {
            mockAemAuthorUrl = undefined;
            mockImsOrgId = IMS_ORG_ID;
            mockApplySiteConfig.mockResolvedValue({ success: true, removed: [] });

            await applyDaLiveOrgConfigSettings(
                mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
            );

            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it('stays quiet when a binding was written', async () => {
            mockAemAuthorUrl = AEM_AUTHOR_URL;
            mockImsOrgId = IMS_ORG_ID;
            mockApplySiteConfig.mockResolvedValue({ success: true, removed: [] });

            await applyDaLiveOrgConfigSettings(
                mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
            );

            expect(mockLogger.warn).not.toHaveBeenCalled();
        });
    });

    /**
     * `demoBuilder.daLive.aemAuthorUrl` ships with NO default (2026-08-18). A
     * bundled one silently bound every user to one AEM environment and reported
     * success — and when the setting was renamed from `AEMRepositoryId` in
     * February, that fallback is what quietly replaced the author's own value on
     * every site created for six months.
     *
     * With no default, an unconfigured install writes no binding rather than
     * someone else's. This test is the guard on that: if a default is ever
     * reintroduced, `aemAuthorUrl` stops being empty here and this fails.
     */
    it('writes NO AEM binding when the setting is unconfigured', async () => {
        mockAemAuthorUrl = undefined;
        mockImsOrgId = IMS_ORG_ID;

        await applyDaLiveOrgConfigSettings(
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
        );

        const [, , updates, removeKeys] = mockApplySiteConfig.mock.calls[0];
        expect(updates['aem.repositoryId']).toBeUndefined();
        expect(removeKeys).toContain('aem.repositoryId');
    });

    /**
     * Leah's 2026-08-18 log said `Applied: aem.repositoryId, editor.path` and
     * nothing more — a binding existed, and there was no way to tell WHAT it
     * pointed at. `demoBuilder.daLive.aemAuthorUrl` ships with a default
     * (a shared demo-system AEM host), so "the key was written" says nothing
     * about whether the user can reach the repository it names. The value is a
     * hostname already published in `package.json`; logging it costs no secrecy
     * and is the difference between a diagnosable report and another round trip.
     */
    describe('the applied binding is diagnosable from the log alone', () => {
        it('logs the AEM host it bound, not just the key name', async () => {
            mockAemAuthorUrl = AEM_AUTHOR_URL;

            await applyDaLiveOrgConfigSettings(
                mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
            );

            const logged = JSON.stringify([
                ...(mockLogger.info as jest.Mock).mock.calls,
                ...(mockLogger.debug as jest.Mock).mock.calls,
            ]);
            expect(logged).toContain(AEM_AUTHOR_URL);
        });
    });

    /**
     * `editor.path` is cleared when it has no value to write; `aem.repositoryId`
     * was not, so clearing the setting left the old binding on the site forever
     * — the one state a user cannot reach from the extension. The module's own
     * docblock already argues for this symmetry; only one half was implemented.
     */
    describe('clearing the setting clears the binding', () => {
        it('removes aem.repositoryId when aemAuthorUrl is empty', async () => {
            mockAemAuthorUrl = '';
            mockImsOrgId = IMS_ORG_ID;

            await applyDaLiveOrgConfigSettings(
                mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
            );

            const [, , updates, removeKeys] = mockApplySiteConfig.mock.calls[0];
            expect(updates['aem.repositoryId']).toBeUndefined();
            expect(removeKeys).toContain('aem.repositoryId');
        });

        it('does not remove aem.repositoryId when the setting has a value', async () => {
            mockAemAuthorUrl = AEM_AUTHOR_URL;
            mockImsOrgId = IMS_ORG_ID;

            await applyDaLiveOrgConfigSettings(
                mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
            );

            const [, , , removeKeys] = mockApplySiteConfig.mock.calls[0];
            expect(removeKeys).not.toContain('aem.repositoryId');
        });

        it('clears BOTH keys when neither setting has a value', async () => {
            mockAemAuthorUrl = '';
            mockImsOrgId = '';

            await applyDaLiveOrgConfigSettings(
                mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
            );

            const [, , updates, removeKeys] = mockApplySiteConfig.mock.calls[0];
            expect(updates).toEqual({});
            expect([...removeKeys].sort()).toEqual(['aem.repositoryId', 'editor.path']);
        });
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
            mockContentOps, DA_LIVE_ORG, DA_LIVE_SITE, mockLogger, 'da-live-classic',
        );

        expect(mockApplySiteConfig).toHaveBeenCalledTimes(1);
        const [org, site, updates, removeKeys] = mockApplySiteConfig.mock.calls[0];
        expect(org).toBe(DA_LIVE_ORG);
        expect(site).toBe(DA_LIVE_SITE);
        expect(updates).toEqual({});
        // Neither setting has a value here, so BOTH rows are cleared.
        expect([...removeKeys].sort()).toEqual(['aem.repositoryId', 'editor.path']);
        expect(mockApplyOrgConfig).not.toHaveBeenCalled();
    });
});
