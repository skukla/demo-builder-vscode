/**
 * Dashboard Status Service
 *
 * Business logic for dashboard status operations.
 * Extracted from meshStatusHelpers.ts for proper service layer separation.
 *
 * Responsibilities:
 * - Building status payloads for UI updates
 * - Checking mesh deployment records
 * - Extracting mesh endpoint from configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import { COMPONENT_IDS } from '@/core/constants';
import { hasMeshDeploymentRecord } from '@/core/state/appBuilderComponentState';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { finishSetupStatus } from '@/features/dashboard/services/finishSetup';
import { readBlocksNeedingExamplesRecord } from '@/features/eds/services/blockLibrary/examplesNeededRecord';
import { storefrontNeedsReset } from '@/features/eds/services/storefront/storefrontChanges';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import { Project } from '@/types/base';
import {
    getProjectFrontendPort,
    getMeshComponentInstance,
} from '@/types/typeGuards';
import type {
    DashboardStatusUpdatePayload,
    MeshStatus,
    MeshStatusInfo,
} from '@/types/webviewPayloads';

/**
 * How many recorded blocks still need an example: those the storefront checkout still has a
 * `blocks/<id>/` folder for, the same rule `list_blocks_needing_examples` lists by (a block whose
 * code is gone is nothing an example can fix). When the checkout's `blocks/` folder cannot be
 * seen, the record answers as it is. Undefined when the project has no record.
 */
function blocksStillNeedingExamples(project: Project): number | undefined {
    const ids = readBlocksNeedingExamplesRecord(project);
    if (ids === undefined) return undefined;
    const storefrontPath = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
    const blocksDir = storefrontPath ? path.join(storefrontPath, 'blocks') : undefined;
    if (!blocksDir || !fs.existsSync(blocksDir)) return ids.length;
    return ids.filter((id) => fs.existsSync(path.join(blocksDir, id))).length;
}

/**
 * Build the standard status payload for dashboard updates
 *
 * @param project - The project to build status for
 * @param frontendConfigChanged - Whether frontend config has changed
 * @param mesh - Optional mesh status info
 * @param finishSetup - the steps a run left (`projectFinishSetup`), read by the dashboard's
 *   callers; absent, the payload carries none (the agent's status tool, until its slice)
 * @returns Status payload for UI
 *
 * Note: org-context mismatch is NOT part of this payload — it's delivered
 * separately via the on-open check orchestrator's `checkResult` message
 * (checkId `org-context`) so the org check never blocks the dashboard status.
 */
export function buildStatusPayload(
    project: Project,
    frontendConfigChanged: boolean,
    mesh?: MeshStatusInfo,
    finishSetup?: SetupChecklistItem[],
): DashboardStatusUpdatePayload {
    const steps = finishSetupStatus(finishSetup ?? []);
    const noExample = blocksStillNeedingExamples(project);
    return {
        // The dashboard heading AND its inline rename field read this. Both
        // want the title: the heading is what the user reads, and renaming
        // edits the title -- `renameProjectCore` re-derives the slug from it.
        name: getProjectDisplayName(project),
        path: project.path,
        status: project.status || 'ready',
        port: getProjectFrontendPort(project),
        adobeOrg: project.adobe?.organization,
        adobeProject: project.adobe?.projectName,
        frontendConfigChanged,
        mesh,
        edsStorefrontStatus: project.edsStorefrontStatusSummary,
        ...(storefrontNeedsReset(project) ? { storefrontNeedsReset: true as const } : {}),
        // The Draft Examples tile's dot (EDS-71 step 4c); 0 is "every block has one", absent
        // is "never checked" (a project made before the record).
        ...(noExample !== undefined ? { blocksNeedingExamples: noExample } : {}),
        ...(steps ? { finishSetup: steps } : {}),
    };
}

/**
 * Derive the mesh status shown for a project, from PERSISTED state only.
 *
 * Extracted from `handleRequestStatus` so the dashboard and the agent surface
 * cannot describe the same mesh differently — the bug the `status === 'error'`
 * branch below already documents, one layer up.
 *
 * Takes `authenticated` rather than checking, because the two callers must ask
 * the question differently and only one of them may prompt. The dashboard runs
 * `ensureAdobeIOAuth`, which can surface a sign-in warning; a tool has no UI to
 * show it in and must never stall an agent on a dialog, so it passes the result
 * of a silent `isAuthenticated()`. Deciding that inside would force one policy
 * on both.
 *
 * TWO DIFFERENT MESH OBJECTS are in play here and they are not interchangeable.
 * `getMeshComponentInstance` is the COMPONENT INSTANCE, whose `status` drives the
 * deploying/error branches; `hasMeshDeploymentRecord` reads the DEPLOY RECORD
 * (`getMeshAppBuilderComponent`), which is where an endpoint and a timestamp live.
 * The handler this came from uses both, on purpose. Swapping one for the other
 * looks like a simplification and reproduces the 2026-08-04 regression recorded on
 * `hasMeshDeploymentRecord` below — a deployed mesh reading "Not Deployed".
 *
 * @param project The project to describe.
 * @param authenticated Whether Adobe auth is currently usable.
 * @returns The status and whether a deployed mesh warrants background verification
 *          (the dashboard's mesh-verify check; tools ignore it), or `undefined`
 *          when the project has no mesh component at all — which callers pass
 *          through as an absent `mesh` field rather than a "not-deployed" one.
 */
export function deriveMeshStatus(
    project: Project,
    authenticated: boolean,
): { status: MeshStatus; shouldVerify: boolean } | undefined {
    const mesh = getMeshComponentInstance(project);
    if (!mesh) return undefined;

    if (mesh.status === 'deploying') return { status: 'deploying', shouldVerify: false };

    // A failed deploy is reported WITHOUT consulting meshStatusSummary and without
    // waiting on auth — see the note on the dashboard handler this came from.
    if (mesh.status === 'error') return { status: 'error', shouldVerify: false };

    if (!authenticated) return { status: 'needs-auth', shouldVerify: false };

    if (!hasMeshDeploymentRecord(project)) {
        return { status: 'not-deployed', shouldVerify: false };
    }

    const summary = project.meshStatusSummary;
    if (summary === 'stale') return { status: 'config-changed', shouldVerify: true };
    if (summary === 'unknown' || !summary) return { status: 'deployed', shouldVerify: true };
    return { status: summary, shouldVerify: true };
}

