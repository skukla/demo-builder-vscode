/**
 * The dashboard pushes an App Builder component operation sends when it ends:
 * the full component map and the project status re-run. The single-channel
 * pushes (a row's status, the mesh card, the destination) are
 * `@/features/dashboard/services/projectPanelPushes`.
 *
 * Split from `appBuilderComponentHandlers.ts` (EDS-8, 2026-10-04), which still
 * re-exports every function here, so importers and the `jest.mock`s of that
 * path keep working.
 *
 * @module features/dashboard/handlers/appBuilderComponentPush
 */

import { handleRequestStatus } from './statusHandlers';
import { sendAppBuilderComponentsSnapshot } from '@/features/dashboard/services/projectPanelPushes';
import type { HandlerContext } from '@/types/handlers';

/**
 * Re-run the project status after the component SET changed.
 *
 * The status is derived from the set, so adding, deploying or removing a
 * component makes it stale. Same shape as rename / re-authenticate / forced org
 * switch, which already re-run `handleRequestStatus` after their mutations.
 *
 * REGRESSION (2026-08-04, live): removing a mesh left its card on the grid
 * reading "MESH DEPLOYED". The keyed entry was cleared and a fresh snapshot was
 * sent, but nothing refreshed `meshStatus`, so the derived mesh card outlived the
 * component it described.
 *
 * NOT called from `postComponentsSnapshot`, even though every one of these sites
 * pairs the two: RENAME also posts a snapshot, and rename is a local metadata
 * write that deliberately runs no Adobe guards so it works offline. This helper
 * reaches `ensureAdobeIOAuth` through `handleRequestStatus`, so folding it into
 * the snapshot would have put a guard on the offline path — a pinned property,
 * and the test that pins it is what caught the attempt. Rename does not need it
 * anyway: it changes a display name, not the set.
 */
export async function refreshProjectStatus(context: HandlerContext): Promise<void> {
    await handleRequestStatus(context);
}

/**
 * Post the FULL fresh persisted `appBuilderComponents` map over the
 * `appBuilderComponentsSnapshot` channel. The webview's map is seeded once at
 * init, so per-row status pushes alone drop ADDED entries (no row to flip) and
 * leave REMOVED entries lingering. Sent after terminal ops: add (success AND
 * failure — the entry may have persisted), deploy/redeploy terminal, remove
 * success, rename success.
 */
export async function postComponentsSnapshot(context: HandlerContext): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return;
    }
    await sendAppBuilderComponentsSnapshot(project.appBuilderComponents ?? {});
}
