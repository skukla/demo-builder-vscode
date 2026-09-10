/**
 * get_component_requirements against a catalog that is NOT well formed.
 *
 * The sibling suite drives the real `components.json` on purpose, and that is
 * exactly why it cannot reach this half: the shipped catalog has every section,
 * every list is a list, and every env-var key is registered. The tolerant paths
 * — a missing section, a null one, a scalar where an array belongs, an env-var
 * key with no definition — are the ones that decide whether one bad edit to the
 * catalog takes the whole tool down or degrades to a partial answer.
 *
 * The catalog is handed in through the tool's own parameter, not mocked: a
 * `jest.mock` of a bundled config leaf is what the injection seam exists to
 * replace (docs/development/sop/testing-guide.md → Dependency Mocking).
 */

import { serve } from './componentRequirementsTool.testUtils';
import type { ComponentCatalog } from '@/features/ai/server/componentRequirementsTool';

const MALFORMED: ComponentCatalog = {
    frontends: {
        'bad-lists': {
            name: 'Bad Lists',
            description: 'A catalog entry whose configuration lists are malformed',
            configuration: {
                requiredEnvVars: ['GOOD_KEY', 5, null],
                optionalEnvVars: ['UNREGISTERED_KEY'],
                // A scalar where the tool expects a list — one missing pair of
                // brackets in the catalog.
                requiredServices: 'commerce',
            },
        },
    },
    // A section edited down to null rather than removed.
    backends: null,
    // `mesh` is absent entirely, and `integrations` was replaced by a scalar —
    // truthy, so the null/undefined half of the guard does not catch it.
    integrations: 'components/integrations.json',
    addons: { 'lonely-addon': { name: 'Lonely' } },
    envVars: {
        GOOD_KEY: { label: 'Good key', type: 'url', description: 'What goes in it' },
    },
};

describe('get_component_requirements — a malformed catalog', () => {
    it('reports only the string entries of an env-var list', async () => {
        // A number or a null reaching the agent as an env-var key is worse than
        // terse: it names a variable that cannot be set.
        const out = await serve(MALFORMED).call('bad-lists');

        expect(out.requiredEnvVars).toStrictEqual([
            {
                key: 'GOOD_KEY',
                label: 'Good key',
                type: 'url',
                description: 'What goes in it',
            },
        ]);
    });

    it('reads a scalar where a list belongs as no entries, not as its characters', async () => {
        const out = await serve(MALFORMED).call('bad-lists');

        expect(out.requiredServices).toStrictEqual([]);
    });

    it('keeps an env-var key the registry does not define, as a bare key', async () => {
        // Dropping it would under-report what the component needs; inventing a
        // label for it would be worse.
        const out = await serve(MALFORMED).call('bad-lists');

        expect(out.optionalEnvVars).toStrictEqual([{ key: 'UNREGISTERED_KEY' }]);
    });

    it('walks past a section that is missing, null or not a section at all', async () => {
        // `mesh` is absent, `backends` is null and `integrations` is a string.
        // Any one of them reaching Object.entries takes every answer down,
        // including the ones the intact sections could still give.
        const out = await serve(MALFORMED).call('no-such-component');

        expect(out.error).toBe('No component "no-such-component".');
        expect(out.known).toStrictEqual(['bad-lists', 'lonely-addon']);
    });
});
