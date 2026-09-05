/**
 * storefrontStalenessDetector — detectStorefrontChanges
 *
 * Regression: the default Commerce demos (CitiSignal + every demo-packages
 * entry) are ACCS projects and store the Website/Store/Store-View codes under
 * the ACCS_* env keys. The staleness detector originally compared only the
 * PaaS_* keys, so editing the ACCS store codes in Configure was never detected
 * as a storefront change — no stale flag, no "Republish?" prompt, config.json
 * never regenerated, so the live storefront kept querying the wrong Commerce
 * website (the user's symptom: "I saved the codes and nothing updated").
 */

import {
    detectStorefrontChanges,
    getCurrentStorefrontState,
    getStorefrontEnvVars,
    updateStorefrontState,
} from '@/features/eds/services/storefront/storefrontStalenessDetector';
import {
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_CUSTOMER_GROUP,
    ACCS_GRAPHQL_ENDPOINT,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

/** An EDS/ACCS project with a published storefront state to diff against. */
function makeAccsProject(publishedEnvVars: Record<string, string>): Project {
    return createMockProject({
        name: 'test-project',
        path: '/projects/test',
        selectedStack: 'eds-accs',
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready', metadata: {} },
        },
        edsStorefrontState: {
            envVars: publishedEnvVars,
            lastPublished: new Date('2026-01-01').toISOString(),
        },
    });
}

const CITISIGNAL = {
    [ACCS_WEBSITE_CODE]: 'citisignal',
    [ACCS_STORE_CODE]: 'citisignal_store',
    [ACCS_STORE_VIEW_CODE]: 'citisignal_us',
};

describe('detectStorefrontChanges — ACCS store-config keys', () => {
    it('flags a changed ACCS website code as a storefront change', () => {
        const project = makeAccsProject(CITISIGNAL);

        const result = detectStorefrontChanges(project, {
            accs: { ...CITISIGNAL, [ACCS_WEBSITE_CODE]: 'bodea' },
        });

        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toContain(ACCS_WEBSITE_CODE);
    });

    it('flags all three changed ACCS codes (website/store/store-view)', () => {
        const project = makeAccsProject(CITISIGNAL);

        const result = detectStorefrontChanges(project, {
            accs: {
                [ACCS_WEBSITE_CODE]: 'bodea',
                [ACCS_STORE_CODE]: 'bodea_store',
                [ACCS_STORE_VIEW_CODE]: 'bodea_us',
            },
        });

        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toEqual(
            expect.arrayContaining([ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE]),
        );
    });

    it('flags a changed ACCS customer group and GraphQL endpoint (both drive config.json)', () => {
        const project = makeAccsProject({
            ...CITISIGNAL,
            [ACCS_CUSTOMER_GROUP]: '0',
            [ACCS_GRAPHQL_ENDPOINT]: 'https://old.example/graphql',
        });

        const result = detectStorefrontChanges(project, {
            accs: {
                ...CITISIGNAL,
                [ACCS_CUSTOMER_GROUP]: '1',
                [ACCS_GRAPHQL_ENDPOINT]: 'https://new.example/graphql',
            },
        });

        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toEqual(
            expect.arrayContaining([ACCS_CUSTOMER_GROUP, ACCS_GRAPHQL_ENDPOINT]),
        );
    });

    it('reports no change when the ACCS codes are unchanged (regression guard)', () => {
        const bodea = {
            [ACCS_WEBSITE_CODE]: 'bodea',
            [ACCS_STORE_CODE]: 'bodea_store',
            [ACCS_STORE_VIEW_CODE]: 'bodea_us',
        };
        const project = makeAccsProject(bodea);

        const result = detectStorefrontChanges(project, { accs: { ...bodea } });

        expect(result.hasChanges).toBe(false);
        expect(result.changedEnvVars).toEqual([]);
    });

    it('still flags PaaS code changes (no regression to existing behavior)', () => {
        const project = makeAccsProject({ [PAAS_WEBSITE_CODE]: 'base' });

        const result = detectStorefrontChanges(project, {
            'adobe-commerce-paas': { [PAAS_WEBSITE_CODE]: 'main_website' },
        });

        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toContain(PAAS_WEBSITE_CODE);
    });
});

/**
 * The recorded "published" state must be what was PUBLISHED, not what the
 * project says at the moment of recording.
 *
 * This state is the sole baseline `detectStorefrontChanges` compares against.
 * Record the project's current values instead of the published ones and the
 * detector compares a value to itself forever: no change detected, no prompt,
 * no republish, no stale badge. Silent and permanent.
 *
 * Live failure 2026-08-10: republish generated config.json from the project's
 * configs, spent ~4s pushing to GitHub and the CDN, then re-read
 * `project.componentConfigs` to record state — and a concurrent Configure save
 * had swapped that object in the meantime. The old Commerce scope reached the
 * CDN; the new one was recorded as published. The storefront queried a website
 * with no products and every PDP rendered an empty block, undetectably.
 */
describe('updateStorefrontState records the published values, not current ones', () => {
    const PUBLISHED = { accs: { [ACCS_WEBSITE_CODE]: 'base' } };
    const MUTATED_AFTER = { accs: { [ACCS_WEBSITE_CODE]: 'citisignal' } };

    it('records the snapshot it was given', () => {
        const project = makeAccsProject({});

        updateStorefrontState(project, PUBLISHED);

        expect(project.edsStorefrontState?.envVars?.[ACCS_WEBSITE_CODE]).toBe('base');
    });

    it('ignores a project mutated between generation and recording', () => {
        // THE regression. The push is in flight; a concurrent save reassigns
        // componentConfigs. Recording must reflect what went out, not what
        // arrived while it was going.
        const project = makeAccsProject({});
        (project as { componentConfigs?: unknown }).componentConfigs = MUTATED_AFTER;

        updateStorefrontState(project, PUBLISHED);

        expect(project.edsStorefrontState?.envVars?.[ACCS_WEBSITE_CODE]).toBe('base');
    });

    it('leaves the storefront detectably stale after such a publish', () => {
        // The consequence that matters: with `base` published and the project
        // now on `citisignal`, a later save MUST still see a change.
        const project = makeAccsProject({});
        updateStorefrontState(project, PUBLISHED);

        const changes = detectStorefrontChanges(project, MUTATED_AFTER);

        expect(changes.hasChanges).toBe(true);
        expect(changes.changedEnvVars).toContain(ACCS_WEBSITE_CODE);
    });

    it('reports no change when the published values match - the control', () => {
        // Without this, "always stale" would pass the case above.
        const project = makeAccsProject({});
        updateStorefrontState(project, PUBLISHED);

        expect(detectStorefrontChanges(project, PUBLISHED).hasChanges).toBe(false);
    });
});

// ==========================================================================
// getStorefrontEnvVars — which values reach the published snapshot
// ==========================================================================

describe('getStorefrontEnvVars', () => {
    it('collects only the watched keys, ignoring everything else in the config', () => {
        expect(
            getStorefrontEnvVars({
                [ACCS_WEBSITE_CODE]: 'citisignal',
                UNWATCHED_KEY: 'ignored',
            }),
        ).toEqual({ [ACCS_WEBSITE_CODE]: 'citisignal' });
    });

    it('omits a watched key the config does not carry at all', () => {
        // Every other watched key is absent here. Recording them as the string
        // "undefined" would make the very next detect() run report a change
        // against values that were never published.
        expect(getStorefrontEnvVars({ [ACCS_STORE_CODE]: 'citisignal_store' })).toEqual({
            [ACCS_STORE_CODE]: 'citisignal_store',
        });
    });

    it('omits a key whose value is explicitly undefined', () => {
        expect(
            getStorefrontEnvVars({
                [ACCS_WEBSITE_CODE]: undefined,
                [ACCS_STORE_CODE]: 'kept',
            }),
        ).toEqual({ [ACCS_STORE_CODE]: 'kept' });
    });

    it('omits a key whose value is explicitly null', () => {
        expect(
            getStorefrontEnvVars({
                [ACCS_WEBSITE_CODE]: null,
                [ACCS_STORE_CODE]: 'kept',
            }),
        ).toEqual({ [ACCS_STORE_CODE]: 'kept' });
    });

    it('keeps a falsy-but-real value, stringified', () => {
        // '' and false are real published settings; only undefined/null mean
        // "not set". AEM_ASSETS_ENABLED is the boolean one in the list.
        expect(
            getStorefrontEnvVars({ AEM_ASSETS_ENABLED: false, [ACCS_STORE_CODE]: '' }),
        ).toEqual({ AEM_ASSETS_ENABLED: 'false', [ACCS_STORE_CODE]: '' });
    });
});

// ==========================================================================
// getCurrentStorefrontState — the baseline detect() compares against
// ==========================================================================

describe('getCurrentStorefrontState', () => {
    it('returns null for a project that has never published', () => {
        const project = createMockProject({ name: 'p', path: '/p', selectedStack: 'eds-accs' });
        expect(getCurrentStorefrontState(project)).toBeNull();
    });

    it('parses the recorded publish time into a Date', () => {
        const project = makeAccsProject(CITISIGNAL);
        const state = getCurrentStorefrontState(project);
        expect(state?.envVars).toEqual(CITISIGNAL);
        expect(state?.lastPublished).toEqual(new Date('2026-01-01'));
    });

    it('reports an empty publish timestamp as unpublished, not as an invalid Date', () => {
        // `new Date('')` is an Invalid Date that formats as "Invalid Date" and
        // compares false against everything — null is the honest answer.
        const project = createMockProject({
            name: 'p',
            path: '/p',
            selectedStack: 'eds-accs',
            edsStorefrontState: { envVars: CITISIGNAL, lastPublished: '' },
        });
        expect(getCurrentStorefrontState(project)?.lastPublished).toBeNull();
    });
});

// ==========================================================================
// detectStorefrontChanges — the two "never report stale" guards
// ==========================================================================

describe('detectStorefrontChanges guards', () => {
    it('reports no change for a non-EDS project even when the watched values differ', () => {
        // The published state and the new configs disagree on every ACCS code.
        // A non-EDS project has no config.json to republish, so the answer must
        // still be "nothing to do" — and the guard, not an empty diff, is what
        // makes it so.
        const project = makeAccsProject(CITISIGNAL);
        project.selectedStack = 'headless';

        expect(
            detectStorefrontChanges(project, { accs: { [ACCS_WEBSITE_CODE]: 'bodea' } }),
        ).toEqual({ hasChanges: false, changedEnvVars: [] });
    });

    it('reports no change for an EDS project that has never published', () => {
        // No baseline exists, so there is nothing to be stale against. Without
        // the guard this would compare against undefined and read as changed.
        const project = createMockProject({ name: 'p', path: '/p', selectedStack: 'eds-accs' });

        expect(
            detectStorefrontChanges(project, { accs: { [ACCS_WEBSITE_CODE]: 'bodea' } }),
        ).toEqual({ hasChanges: false, changedEnvVars: [] });
    });
});
