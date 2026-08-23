/**
 * stripOrphanedComponentConfigs — the load-side half of the fan-out fix
 * (2026-08-23 audit of project-level facts stored per-component).
 *
 * Configure's fan-out writes a shared field only to SELECTED declaring
 * components, while envFileGenerator's fallback loop and configGenerator's
 * merge sweep EVERY entry in `componentConfigs` — configGenerator with
 * mesh-overrides-non-mesh priority. A component removed from the project
 * used to leave its config entry behind forever, so its stale copy could
 * outvote the live backend's fresh value. Removal now deletes the entry;
 * this migration sweeps the orphans that already shipped.
 *
 * Liveness = selections (frontend/backend/dependencies/integrations/
 * appBuilder) ∪ selectedAddons ∪ componentInstances ∪ appBuilderComponents.
 */

import { stripOrphanedComponentConfigs } from '@/core/state/projectFileLoader';
import type { Project } from '@/types/base';

function project(overrides: Partial<Project>): Project {
    return {
        name: 'demo',
        path: '/p',
        componentSelections: {
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-paas',
            dependencies: [],
            integrations: [],
            appBuilder: [],
        },
        ...overrides,
    } as unknown as Project;
}

describe('stripOrphanedComponentConfigs', () => {
    it('strips the entry of a component no longer part of the project', () => {
        const p = project({
            componentConfigs: {
                'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://fresh.example' },
                'eds-commerce-mesh': { ADOBE_COMMERCE_URL: 'https://stale.example' },
            },
        });

        const changed = stripOrphanedComponentConfigs(p);

        expect(changed).toBe(true);
        expect(p.componentConfigs).toEqual({
            'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://fresh.example' },
        });
    });

    it('preserves entries for every kind of live holder', () => {
        const p = project({
            componentSelections: {
                frontend: 'eds-storefront',
                backend: 'adobe-commerce-paas',
                dependencies: ['eds-commerce-mesh'],
                integrations: ['experience-platform'],
                appBuilder: ['custom-app'],
            },
            selectedAddons: ['adobe-commerce-aco'],
            componentInstances: {
                'instance-only': { id: 'instance-only' },
            },
            appBuilderComponents: {
                'keyed-only': { kind: 'integration', status: 'deployed' },
            },
            componentConfigs: {
                'eds-storefront': { A: '1' },
                'adobe-commerce-paas': { B: '2' },
                'eds-commerce-mesh': { C: '3' },
                'experience-platform': { D: '4' },
                'custom-app': { E: '5' },
                'adobe-commerce-aco': { F: '6' },
                'instance-only': { G: '7' },
                'keyed-only': { H: '8' },
            },
        } as never);

        const changed = stripOrphanedComponentConfigs(p);

        expect(changed).toBe(false);
        expect(Object.keys(p.componentConfigs ?? {})).toHaveLength(8);
    });

    it('is a no-op when componentConfigs is absent', () => {
        const p = project({});
        expect(stripOrphanedComponentConfigs(p)).toBe(false);
    });
});
