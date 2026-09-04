/**
 * resetRepoToTemplate — what the bulk template reset is handed.
 *
 * Mutation testing (PL-22, batch MUT-07) found these unconstrained: the fstab
 * org/site, whether config.json rides the commit, the LKG pin and its fallback
 * to `main`, when canonical code patches are applied, when a skipped smart-404
 * install is surfaced through `report`, and the shape of the result. Every
 * assertion reads an argument handed to a collaborator or the returned value.
 */

import {
    RESET_RESULT,
    buildParams,
    installDefaults,
    mocks,
    runReset,
} from './edsResetRepoHelper.testUtils';
import type { CodePatchResult } from '@/features/eds/services/patches/codePatchRegistry';
import type { CodePatchSource } from '@/types/demoPackages';

const PATCH_SOURCE: CodePatchSource = {
    owner: 'adobe',
    repo: 'eds-demo-patches',
    path: 'families/isle5',
    lkgFile: 'families/isle5/last-known-good',
};
const LKG_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const PATCH_RESULT: CodePatchResult = { patchId: 'p1', target: 'head.html', applied: true };
const SMART_404_WARNING =
    '⚠️ Smart-404 handler not installed — product pages may not recover on first visit';

beforeEach(installDefaults);

describe('resetRepoToTemplate — the bulk template reset', () => {
    it('hands GitHub the template, the repo, fstab for the DA.live site and both config files', async () => {
        mocks.generateConfigJson.mockReturnValue({ success: true, content: '{"cfg":1}' });
        const params = buildParams();

        const { resetMock, overrides, report, context, githubFileOps } = await runReset(params);

        expect(mocks.generateFstabContent).toHaveBeenCalledWith({ daLiveOrg: 'acme', daLiveSite: 'shop' });
        expect(mocks.buildConfigGeneratorParams).toHaveBeenCalledWith(params.project);
        expect(mocks.generateConfigJson).toHaveBeenCalledWith(
            mocks.buildConfigGeneratorParams.mock.results[0].value,
            context.logger,
        );
        expect(resetMock).toHaveBeenCalledWith(
            'tpl-owner',
            'tpl-repo',
            'me',
            'shop',
            expect.any(Map),
            'main',
        );
        expect(overrides?.get('fstab.yaml')).toBe('mock-fstab');
        expect(overrides?.get('config.json')).toBe('{"cfg":1}');
        expect(overrides?.get('demo-config.json')).toBe('{"cfg":1}');
        expect(report).toHaveBeenCalledWith(1, 'Reset 20 files');
        expect(mocks.installQuickEdit).toHaveBeenCalledWith(githubFileOps, 'me', 'shop', context.logger);
    });

    it('leaves config.json out of the commit when generation fails, even if stale content is returned', async () => {
        mocks.generateConfigJson.mockReturnValue({
            success: false,
            content: '{"stale":1}',
            error: 'no backend',
        });

        const { overrides } = await runReset(buildParams());

        expect(overrides?.has('config.json')).toBe(false);
        expect(overrides?.has('demo-config.json')).toBe(false);
    });

    it('leaves config.json out when generation succeeds without content', async () => {
        mocks.generateConfigJson.mockReturnValue({ success: true });

        const { overrides } = await runReset(buildParams());

        expect(overrides?.has('config.json')).toBe(false);
    });

    it('pins a thin-layer storefront to the LKG sha read from the patches repo', async () => {
        mocks.readLkgSha.mockResolvedValue(LKG_SHA);

        const { resetMock, context } = await runReset(
            buildParams({ codePatchSource: PATCH_SOURCE }),
        );

        expect(mocks.readLkgSha).toHaveBeenCalledWith(
            { owner: 'adobe', repo: 'eds-demo-patches', lkgFile: PATCH_SOURCE.lkgFile },
            context.logger,
        );
        expect(resetMock.mock.calls[0][5]).toBe(LKG_SHA);
    });

    it('falls back to template main when the LKG is unreachable', async () => {
        mocks.readLkgSha.mockResolvedValue(undefined);

        const { resetMock } = await runReset(buildParams({ codePatchSource: PATCH_SOURCE }));

        expect(resetMock.mock.calls[0][5]).toBe('main');
    });

    it('never reads an LKG for a storefront without a code patch source', async () => {
        const { resetMock } = await runReset(buildParams());

        expect(mocks.readLkgSha).not.toHaveBeenCalled();
        expect(resetMock.mock.calls[0][5]).toBe('main');
    });

    it('applies canonical code patches into the override map before the bulk reset', async () => {
        mocks.applyCanonicalCodePatches.mockResolvedValue([PATCH_RESULT]);

        const { result, resetMock, context } = await runReset(
            buildParams({ codePatches: ['p1', 'p2'], codePatchSource: PATCH_SOURCE }),
        );

        expect(mocks.applyCanonicalCodePatches).toHaveBeenCalledWith(
            expect.any(Map),
            'tpl-owner',
            'tpl-repo',
            ['p1', 'p2'],
            PATCH_SOURCE,
            context.logger,
        );
        // The SAME map, so patched canonical files land in the one atomic commit.
        expect(mocks.applyCanonicalCodePatches.mock.calls[0][0]).toBe(resetMock.mock.calls[0][4]);
        expect(mocks.applyCanonicalCodePatches.mock.invocationCallOrder[0]).toBeLessThan(
            resetMock.mock.invocationCallOrder[0],
        );
        expect(result).toEqual({
            filesReset: RESET_RESULT.fileCount,
            blockCollectionIds: undefined,
            libraryContentSources: [],
            canonicalCodePatchResults: [PATCH_RESULT],
        });
    });

    it('applies nothing for an empty patch list, even with a source configured', async () => {
        const { result } = await runReset(
            buildParams({ codePatches: [], codePatchSource: PATCH_SOURCE }),
        );

        expect(mocks.applyCanonicalCodePatches).not.toHaveBeenCalled();
        expect(result.canonicalCodePatchResults).toBeUndefined();
    });

    it('applies nothing for patch ids without a source to read them from', async () => {
        const { result } = await runReset(buildParams({ codePatches: ['p1'] }));

        expect(mocks.applyCanonicalCodePatches).not.toHaveBeenCalled();
        expect(result.canonicalCodePatchResults).toBeUndefined();
    });

    it('surfaces a skipped smart-404 install through report when BYOM is on', async () => {
        mocks.installSmart404Handler.mockResolvedValue({
            installed: false,
            reason: 'scripts/delayed.js not found',
        });

        const { report, githubFileOps, context } = await runReset(
            buildParams({ byomOverlayUrl: 'https://overlay.example.test/render-pdp' }),
        );

        expect(mocks.installSmart404Handler).toHaveBeenCalledWith(
            githubFileOps,
            'me',
            'shop',
            'https://overlay.example.test/render-pdp',
            context.logger,
            'acme',
            'shop',
        );
        expect(report).toHaveBeenCalledWith(1, SMART_404_WARNING);
    });

    it('says nothing when the smart-404 handler installed', async () => {
        mocks.installSmart404Handler.mockResolvedValue({ installed: true });

        const { report } = await runReset(
            buildParams({ byomOverlayUrl: 'https://overlay.example.test/render-pdp' }),
        );

        expect(report).not.toHaveBeenCalledWith(1, SMART_404_WARNING);
    });

    it('says nothing about smart-404 when BYOM is off', async () => {
        mocks.installSmart404Handler.mockResolvedValue({ installed: false, reason: 'BYOM disabled' });

        const { report } = await runReset(buildParams());

        expect(report).not.toHaveBeenCalledWith(1, SMART_404_WARNING);
    });
});
