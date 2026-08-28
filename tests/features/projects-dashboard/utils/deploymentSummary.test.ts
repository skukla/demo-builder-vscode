/**
 * One deployment line per project card, not three.
 *
 * The card reported the mesh BY NAME ("Mesh · Update needed") and summarised
 * integrations beside it, while the storefront — which drifts in exactly the same
 * way — was reported nowhere. `getStorefrontStatusText` existed and was tested,
 * and no component ever called it.
 *
 * Naming the mesh on the project card is a leftover from when the mesh WAS the
 * integration story. It is now the first peer card in a dedicated integrations
 * dashboard one click away, so the card should answer one question about the
 * whole project: is what is deployed current?
 *
 * The runtime line (Running / Stopped) stays separate. It is a different axis —
 * the local dev server, not cloud state — and collapsing the two would make a
 * stopped-but-healthy project read the same as a running-but-drifted one.
 */

import {
    getDeploymentSummary,
    getRuntimeSummary,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import type { Project } from '@/types/base';
import { createProjectsDashboardProject } from '../testUtils';

/** A project with one mesh entry and N integration entries. */
function withDeployables(
    over: Partial<Project> & {
        mesh?: string;
        integrations?: string[];
    } = {}
): Project {
    const { mesh, integrations = [], ...rest } = over;
    const appBuilderComponents: Record<string, unknown> = {};
    if (mesh) {
        appBuilderComponents['eds-accs-mesh'] = {
            kind: 'mesh',
            status: mesh,
            source: { owner: '', repo: '' },
        };
    }
    integrations.forEach((status, i) => {
        appBuilderComponents[`integration-${i}`] = {
            kind: 'integration',
            status,
            source: { owner: 'o', repo: 'r' },
        };
    });
    return createProjectsDashboardProject({
        appBuilderComponents: appBuilderComponents as Project['appBuilderComponents'],
        ...rest,
    });
}

describe('getDeploymentSummary — one line for the whole project', () => {
    it('says Deployed when mesh, storefront and integrations are all current', () => {
        const summary = getDeploymentSummary(
            withDeployables({
                mesh: 'deployed',
                integrations: ['deployed', 'deployed'],
                edsStorefrontStatusSummary: 'published',
            })
        );

        expect(summary?.text).toBe('Deployed');
        expect(summary?.variant).toBe('success');
    });

    it('says Attention needed when the MESH has drifted', () => {
        const summary = getDeploymentSummary(
            withDeployables({ mesh: 'stale', integrations: ['deployed'] })
        );

        expect(summary?.text).toBe('Attention needed');
    });

    it('says Attention needed when the STOREFRONT has drifted', () => {
        // The case the card could not report at all. Same drift, same words.
        const summary = getDeploymentSummary(
            withDeployables({ mesh: 'deployed', edsStorefrontStatusSummary: 'stale' })
        );

        expect(summary?.text).toBe('Attention needed');
    });

    it('says Attention needed when an INTEGRATION has drifted', () => {
        const summary = getDeploymentSummary(
            withDeployables({ mesh: 'deployed', integrations: ['deployed', 'stale'] })
        );

        expect(summary?.text).toBe('Attention needed');
    });

    it('treats a declined update as still needing attention', () => {
        // "Later" postpones the prompt, not the drift.
        const summary = getDeploymentSummary(
            withDeployables({ mesh: 'deployed', edsStorefrontStatusSummary: 'update-declined' })
        );

        expect(summary?.text).toBe('Attention needed');
    });

    it('carries the ERROR variant when something failed, while keeping one wording', () => {
        // The dot conveys severity; the text stays consolidated. A failed deploy
        // and a stale one both need you, and the detail is one click away.
        const summary = getDeploymentSummary(withDeployables({ mesh: 'error' }));

        expect(summary?.text).toBe('Attention needed');
        expect(summary?.variant).toBe('error');
    });

    it('reports Deploying while anything is in flight', () => {
        const summary = getDeploymentSummary(
            withDeployables({ mesh: 'deployed', integrations: ['deploying'] })
        );

        expect(summary?.text).toBe('Deploying…');
    });

    it('lets attention win over an in-flight deploy', () => {
        // Deploying is transient; a failure is not.
        const summary = getDeploymentSummary(
            withDeployables({ mesh: 'error', integrations: ['deploying'] })
        );

        expect(summary?.text).toBe('Attention needed');
    });

    it('says Not deployed for a project that has not shipped anything yet', () => {
        // Normal for a fresh project — not a problem, so not "attention".
        const summary = getDeploymentSummary(withDeployables({ mesh: 'not-deployed' }));

        expect(summary?.text).toBe('Not deployed');
        expect(summary?.variant).not.toBe('error');
    });

    it('returns null when the project has nothing deployable', () => {
        // No mesh, no integrations, no storefront — the card renders no line at
        // all rather than an empty or misleading one.
        expect(getDeploymentSummary(createProjectsDashboardProject())).toBeNull();
    });
});

/**
 * The runtime line is the LOCAL axis, and EDS projects do not have one.
 *
 * EDS projects have no running state — the kebab offers no Start/Stop, and
 * `getStatusText` returns "Published" for them regardless of `status`. That is
 * why their primary line carried STOREFRONT status: it was the only cloud signal
 * the card had.
 *
 * The deployment summary now reports the storefront, so leaving the old line in
 * place makes an EDS card say the same thing twice — "Republish needed" directly
 * above "Attention needed", two warning dots for one problem.
 *
 * An in-flight operation is different. "Republishing…" is a local, transient fact
 * the summary does not express, so it keeps its line while it lasts.
 */
const eds = (over: Partial<Project> = {}) =>
    createProjectsDashboardProject({ selectedStack: 'eds-dalive', ...over });

describe('getRuntimeSummary — the local axis only', () => {
    it('gives an EDS project NO runtime line when nothing is in flight', () => {
        expect(getRuntimeSummary(eds({ edsStorefrontStatusSummary: 'stale' }))).toBeNull();
    });

    it('keeps the line while an EDS operation IS in flight', () => {
        const summary = getRuntimeSummary(eds({ status: 'republishing' }));

        expect(summary?.text).toBe('Republishing...');
        expect(summary?.variant).toBe('warning');
    });

    it('keeps a reset visible too', () => {
        expect(getRuntimeSummary(eds({ status: 'resetting' }))?.text).toBe('Resetting...');
    });

    it('leaves a NON-EDS project reporting Running/Stopped — control', () => {
        const stopped = getRuntimeSummary(createProjectsDashboardProject({ status: 'stopped' }));

        expect(stopped?.text).toBe('Stopped');
        expect(stopped?.variant).toBe('neutral');
    });

    it('reports the port for a running non-EDS project', () => {
        const project = createProjectsDashboardProject({
            status: 'running',
            componentInstances: { frontend: { port: 3000 } } as never,
        });

        expect(getRuntimeSummary(project)?.text).toBe('Running on port 3000');
    });
});
