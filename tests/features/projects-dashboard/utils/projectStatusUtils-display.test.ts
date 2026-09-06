/**
 * projectStatusUtils — the display decisions the card and the row both read.
 *
 * Split from the main suite, which is near the size ceiling. What sits here is
 * the part nothing else constrained: the transitional statuses of the two
 * status functions, the storefront pair, and `getProjectStatusDisplay`, which
 * was exercised by no test at all despite being the one derivation both
 * project surfaces share.
 */

import {
    getStatusText,
    getStatusVariant,
    getStorefrontStatusText,
    getStorefrontStatusVariant,
    getProjectStatusDisplay,
    getDeploymentSummary,
    getFrontendPort,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import { createProjectsDashboardProject, createMockComponentInstance } from '../testUtils';

/** A project whose stack id makes `isEdsProject` true. */
function edsProject(over: Parameters<typeof createProjectsDashboardProject>[0] = {}) {
    return createProjectsDashboardProject({ selectedStack: 'eds-accs', ...over });
}

describe('the transitional statuses each keep their own words', () => {
    it('says a non-EDS project is resetting', () => {
        expect(getStatusText('resetting')).toBe('Resetting...');
    });

    it('says a non-EDS project is republishing', () => {
        expect(getStatusText('republishing')).toBe('Republishing...');
    });

    it('warns while an EDS project is resetting, rather than calling it published', () => {
        expect(getStatusVariant('resetting', true)).toBe('warning');
        expect(getStatusText('resetting', undefined, true)).toBe('Resetting...');
    });

    it('warns while an EDS project is republishing', () => {
        expect(getStatusVariant('republishing', true)).toBe('warning');
        expect(getStatusText('republishing', undefined, true)).toBe('Republishing...');
    });
});

describe('the storefront pair reads the shared vocabulary', () => {
    it('names a drifted storefront and warns about it', () => {
        const project = edsProject({ edsStorefrontStatusSummary: 'stale' });

        expect(getStorefrontStatusText(project)).toBe('Republish needed');
        expect(getStorefrontStatusVariant(project)).toBe('warning');
    });

    it('reports a project that was never published as neutral, not as a warning', () => {
        const project = edsProject({ edsStorefrontStatusSummary: 'not-published' });

        expect(getStorefrontStatusText(project)).toBe('Not published');
        expect(getStorefrontStatusVariant(project)).toBe('neutral');
    });

    it('treats a storefront nothing recorded as published', () => {
        const project = edsProject({ edsStorefrontStatusSummary: undefined });

        expect(getStorefrontStatusText(project)).toBe('Published');
        expect(getStorefrontStatusVariant(project)).toBe('success');
    });
});

describe('getProjectStatusDisplay — the one derivation both surfaces share', () => {
    it('describes a running non-EDS project by its demo, port and all', () => {
        const project = createProjectsDashboardProject({
            status: 'running',
            componentInstances: {
                headless: createMockComponentInstance({ id: 'headless', port: 3000 }),
            },
        });

        expect(getProjectStatusDisplay(project)).toEqual({
            isEds: false,
            port: 3000,
            statusText: 'Running on port 3000',
            statusVariant: 'success',
        });
    });

    it('does not call a stopped non-EDS project published', () => {
        const project = createProjectsDashboardProject({ status: 'stopped' });

        expect(getProjectStatusDisplay(project)).toEqual({
            isEds: false,
            port: undefined,
            statusText: 'Stopped',
            statusVariant: 'neutral',
        });
    });

    it('describes an EDS project by its STOREFRONT, not by its demo status', () => {
        const project = edsProject({
            status: 'stopped',
            edsStorefrontStatusSummary: 'stale',
        });

        expect(getProjectStatusDisplay(project)).toEqual({
            isEds: true,
            port: undefined,
            statusText: 'Republish needed',
            statusVariant: 'warning',
        });
    });
});

describe('the deployment summary reports a storefront that was never published', () => {
    it('calls it not deployed rather than something needing attention', () => {
        const project = edsProject({ edsStorefrontStatusSummary: 'not-published' });

        expect(getDeploymentSummary(project)).toEqual({
            text: 'Not deployed',
            variant: 'neutral',
        });
    });

    it('returns null — not an empty line — when nothing is deployable', () => {
        const project = createProjectsDashboardProject({
            appBuilderComponents: {},
            edsStorefrontStatusSummary: undefined,
        });

        expect(getDeploymentSummary(project)).toBeNull();
    });
});

describe('getFrontendPort reads the port of a RUNNING project only', () => {
    it('ignores a port on a project that is not running', () => {
        const project = createProjectsDashboardProject({
            status: 'stopped',
            componentInstances: {
                headless: createMockComponentInstance({ id: 'headless', port: 3000 }),
            },
        });

        expect(getFrontendPort(project)).toBeUndefined();
    });

    it('skips instances that carry no port instead of taking the first one', () => {
        const project = createProjectsDashboardProject({
            status: 'running',
            componentInstances: {
                'api-mesh': createMockComponentInstance({ id: 'api-mesh', type: 'backend' }),
                headless: createMockComponentInstance({ id: 'headless', port: 4321 }),
            },
        });

        expect(getFrontendPort(project)).toBe(4321);
    });
});
