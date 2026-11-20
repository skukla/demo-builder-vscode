/**
 * What finishing a kept clash needs from the rest of the extension, built from an update
 * context (ADR-015: a feature's `create...Deps` file). Each is the clean path's own piece:
 * the version the track would update to now is read the way the check reads it, and the
 * version is recorded the way the apply records it.
 *
 * @module features/updates/services/pendingClashFinishDeps
 */

import { resolveByomOverlayConfig } from '@/features/eds/handlers/byomOverlay';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { readLkgSha } from '@/features/eds/services/patches/lkgReader';
import { readShippedPatches } from '@/features/eds/services/patches/shippedPatchLedger';
import { readBoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { refreshBaseFromColleague } from '@/features/updates/services/boilerplateBaseRefresh';
import type { FinishDeps } from '@/features/updates/services/pendingClashFinish';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';
import { restoreDemoBuilderPieces } from '@/features/updates/services/thinLayerUpdate';
import { baseRefreshDeps } from '@/features/updates/services/updateApplyTemplate';
import type { UpdateContext } from '@/features/updates/services/updateCore';

export function createFinishDeps(ctx: UpdateContext): FinishDeps {
    const github = getGitHubServices(ctx.secrets);
    return {
        ctx,
        async latestTarget(project, clash) {
            if (clash.track === 'boilerplate') {
                const base = readBoilerplateBase(project);
                return base ? readLkgSha(base.lkgSource, ctx.logger) : undefined;
            }
            const found = await new TemplateUpdateChecker(ctx.secrets, ctx.logger).checkForUpdates(project);
            return found?.latestCommit;
        },
        async recordTemplateVersion(project, commit) {
            const svc = new TemplateSyncService(github, ctx.logger, ctx.commandManager, resolveByomOverlayConfig);
            await svc.updateLastSyncedCommit(project, commit, ctx.stateManager);
            // The colleague may have moved their own Adobe base; keep ours true (EDS-56 D4).
            await refreshBaseFromColleague(project, baseRefreshDeps(ctx));
        },
        restorePieces: (project) => restoreDemoBuilderPieces(project, github.fileOperations, ctx.logger, resolveByomOverlayConfig),
        livePatches: async () => (await readShippedPatches(ctx.logger)).live,
    };
}
