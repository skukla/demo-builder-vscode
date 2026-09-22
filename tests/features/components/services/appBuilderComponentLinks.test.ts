/**
 * appBuilderComponentLinks — which system an integration uses and which
 * integration a system belongs to, stored on the project (the linked cards
 * plan, step 1), with the catalog pairing standing in for projects saved
 * before links existed.
 */

import {
    integrationUsing,
    linkBroughtSystem,
    linkComponents,
    pairedInstanceId,
    systemsUsedBy,
} from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const CATALOG = [
    { id: 'demo-erp', kind: 'system' as const, boundTo: 'erp-integration' },
    { id: 'erp-integration', kind: 'integration' as const },
];

function component(kind: AppBuilderComponentState['kind'], extra: Partial<AppBuilderComponentState> = {}) {
    return { kind, status: 'deployed' as const, source: { owner: 'skukla', repo: 'x' }, ...extra };
}

function project(components: Record<string, AppBuilderComponentState>): Project {
    return createMockProject({ appBuilderComponents: components });
}

describe('stored links', () => {
    it('answer both ways from the records', () => {
        const p = project({
            integration: component('integration', { systems: ['erp-a', 'erp-b'] }),
            'erp-a': component('system', { usedBy: 'integration' }),
            'erp-b': component('system', { usedBy: 'integration' }),
        });

        expect(systemsUsedBy(p, 'integration', CATALOG)).toEqual(['erp-a', 'erp-b']);
        expect(integrationUsing(p, 'erp-b', CATALOG)).toBe('integration');
    });

    it('ignore the catalog once any record carries a link', () => {
        const p = project({
            'erp-integration': component('integration', { systems: [] }),
            'demo-erp': component('system'),
        });

        expect(systemsUsedBy(p, 'erp-integration', CATALOG)).toStrictEqual([]);
        expect(integrationUsing(p, 'demo-erp', CATALOG)).toBeUndefined();
    });

    it('leave out ids that are no longer in the project', () => {
        const p = project({
            integration: component('integration', { systems: ['gone', 'erp'] }),
            erp: component('system', { usedBy: 'integration' }),
            orphan: component('system', { usedBy: 'removed' }),
        });

        expect(systemsUsedBy(p, 'integration', CATALOG)).toEqual(['erp']);
        expect(integrationUsing(p, 'orphan', CATALOG)).toBeUndefined();
    });

    it('answer nothing for an unknown id, or a system asked as an integration', () => {
        const p = project({ erp: component('system', { usedBy: 'x' }) });

        expect(systemsUsedBy(p, 'nope', CATALOG)).toStrictEqual([]);
        expect(integrationUsing(p, 'nope', CATALOG)).toBeUndefined();
    });
});

describe('a project saved before links were stored', () => {
    it('reads the catalog pairing', () => {
        const p = project({
            'erp-integration': component('integration'),
            'demo-erp': component('system'),
        });

        expect(systemsUsedBy(p, 'erp-integration', CATALOG)).toEqual(['demo-erp']);
        expect(integrationUsing(p, 'demo-erp', CATALOG)).toBe('erp-integration');
    });

    it('pairs nothing when one half is missing', () => {
        const p = project({ 'demo-erp': component('system') });

        expect(integrationUsing(p, 'demo-erp', CATALOG)).toBeUndefined();
    });
});

describe('linkComponents', () => {
    it('writes both records, once', () => {
        const p = project({ integration: component('integration'), erp: component('system') });

        linkComponents(p, 'integration', 'erp', CATALOG);
        linkComponents(p, 'integration', 'erp', CATALOG);

        expect(p.appBuilderComponents?.integration?.systems).toEqual(['erp']);
        expect(p.appBuilderComponents?.erp?.usedBy).toBe('integration');
    });

    it('also stores the catalog pairs of a project saved before links, so the two never mix', () => {
        const p = project({
            'erp-integration': component('integration'),
            'demo-erp': component('system'),
            other: component('integration'),
            'other-erp': component('system'),
        });

        linkComponents(p, 'other', 'other-erp', CATALOG);

        expect(systemsUsedBy(p, 'erp-integration', CATALOG)).toEqual(['demo-erp']);
        expect(systemsUsedBy(p, 'other', CATALOG)).toEqual(['other-erp']);
    });

    it('does nothing when either record is missing', () => {
        const p = project({ integration: component('integration', { systems: [] }) });

        linkComponents(p, 'integration', 'missing', CATALOG);

        expect(p.appBuilderComponents?.integration?.systems).toStrictEqual([]);
    });
});

describe('linkBroughtSystem', () => {
    it('links the system the integration brings, when both are in the project', () => {
        const p = project({ 'erp-integration': component('integration'), 'demo-erp': component('system') });

        expect(linkBroughtSystem(p, 'erp-integration', CATALOG)).toBe(true);
        expect(p.appBuilderComponents?.['erp-integration']?.systems).toEqual(['demo-erp']);
    });

    it('writes nothing for an integration that brings no system, or whose system is missing', () => {
        const p = project({ other: component('integration'), 'erp-integration': component('integration') });

        expect(linkBroughtSystem(p, 'other', CATALOG)).toBe(false);
        expect(linkBroughtSystem(p, 'erp-integration', CATALOG)).toBe(false);
        expect(p.appBuilderComponents?.['erp-integration']).not.toHaveProperty('systems');
    });
});

// AB-23: a project may hold two ERP pairs. The second is numbered as a pair —
// `erp-integration-2` with `demo-erp-2` — so each half can name its partner before
// any link is stored (the ERP deploys first, before its integration exists).
describe('pairedInstanceId', () => {
    it("names the first of a kind's partner by the partner's catalog id", () => {
        expect(pairedInstanceId('erp-integration', undefined, 'demo-erp')).toBe('demo-erp');
    });

    it("carries a second copy's number over to its partner", () => {
        expect(pairedInstanceId('erp-integration-2', 'erp-integration', 'demo-erp')).toBe('demo-erp-2');
        expect(pairedInstanceId('demo-erp-3', 'demo-erp', 'erp-integration')).toBe('erp-integration-3');
    });
});

describe('linkBroughtSystem for a second pair', () => {
    it("links the second integration to the second ERP, not the first", () => {
        const p = project({
            'erp-integration': component('integration', { systems: ['demo-erp'] }),
            'demo-erp': component('system', { usedBy: 'erp-integration' }),
            'erp-integration-2': component('integration', { catalogId: 'erp-integration' }),
            'demo-erp-2': component('system', { catalogId: 'demo-erp' }),
        });

        expect(linkBroughtSystem(p, 'erp-integration-2', CATALOG)).toBe(true);

        expect(systemsUsedBy(p, 'erp-integration-2', CATALOG)).toEqual(['demo-erp-2']);
        expect(integrationUsing(p, 'demo-erp-2', CATALOG)).toBe('erp-integration-2');
        expect(systemsUsedBy(p, 'erp-integration', CATALOG)).toEqual(['demo-erp']);
    });
});
