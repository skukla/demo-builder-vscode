/**
 * The mesh card carries the Commerce scope it was DEPLOYED against.
 *
 * "What is my mesh pointed at?" was unanswerable in the UI until something went
 * wrong — on 2026-08-10 answering it took a hand-read of the manifest, and the
 * answer was the whole incident (the mesh served `base` while the project meant
 * `citisignal`). It is an attribute of the deployment, not a difference, so it
 * comes off `meshEntry.envVars` — the same object the endpoint and last-deploy
 * already come from. Nothing new is computed, persisted or transported.
 */

import { deriveMeshCard, display, meshEntry } from './integrationCardModel.testUtils';
import type { CommerceStoreStructure } from '@/types/commerceStore';

const ACCS_SCOPE = {
    ACCS_WEBSITE_CODE: 'citisignal',
    ACCS_STORE_CODE: 'citisignal_store',
    ACCS_STORE_VIEW_CODE: 'citisignal_us',
};

const STRUCTURE: CommerceStoreStructure = {
    websites: [{ id: 2, code: 'citisignal', name: 'CitiSignal' }],
    storeGroups: [
        {
            id: 2,
            code: 'citisignal_store',
            name: 'CitiSignal Store',
            website_id: 2,
            root_category_id: 3,
        },
    ],
    storeViews: [
        {
            id: 3,
            code: 'citisignal_us',
            name: 'CitiSignal US',
            store_group_id: 2,
            website_id: 2,
            is_active: true,
        },
    ],
};

const PAAS_SCOPE = {
    ADOBE_COMMERCE_WEBSITE_CODE: 'base',
    ADOBE_COMMERCE_STORE_CODE: 'main_website_store',
    ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
};

function meshCardWith(
    envVars: Record<string, string> | undefined,
    structure?: CommerceStoreStructure
) {
    return deriveMeshCard(display(), 'deployed', meshEntry({ envVars }), false, undefined, structure);
}

describe('deriveMeshCard — deployed Commerce scope', () => {
    it('reads the three scope codes off the deployed snapshot', () => {
        const model = meshCardWith(ACCS_SCOPE);

        expect(model.commerceScope).toEqual([
            { label: 'Website', code: 'citisignal' },
            { label: 'Store', code: 'citisignal_store' },
            { label: 'Store view', code: 'citisignal_us' },
        ]);
    });

    it('labels a PaaS mesh identically to an ACCS one', () => {
        // The underlying keys differ by backend while the concept does not.
        // Registry labels would leak that ("Website Code" under PAAS_* vs ACCS_*)
        // and add a trailing "Code" that a "Commerce scope" key already implies.
        const model = meshCardWith(PAAS_SCOPE);

        expect(model.commerceScope).toEqual([
            { label: 'Website', code: 'base' },
            { label: 'Store', code: 'main_website_store' },
            { label: 'Store view', code: 'default' },
        ]);
    });

    it('omits the scope entirely when the snapshot carries no codes', () => {
        // A mesh deployed before this shipped, or one never deployed at all.
        expect(meshCardWith(undefined).commerceScope).toBeUndefined();
        expect(
            meshCardWith({ ACCS_GRAPHQL_ENDPOINT: 'https://x/graphql' }).commerceScope
        ).toBeUndefined();
    });

    it('keeps only the parts present in a partial snapshot', () => {
        const model = meshCardWith({ ACCS_WEBSITE_CODE: 'citisignal' });

        expect(model.commerceScope).toEqual([{ label: 'Website', code: 'citisignal' }]);
    });

    it('ignores a blank code rather than rendering an empty value', () => {
        const model = meshCardWith({ ...ACCS_SCOPE, ACCS_STORE_CODE: '' });

        expect(model.commerceScope).toEqual([
            { label: 'Website', code: 'citisignal' },
            { label: 'Store view', code: 'citisignal_us' },
        ]);
    });

    it('never carries a Customer Group', () => {
        // ACCS_CUSTOMER_GROUP is a Catalog Service PRICE modifier, not a
        // location. It is in BACKEND_OWNED_SCOPE_KEYS defensively; no component
        // declares it, so it reaches no .env and belongs in no scope row.
        const model = meshCardWith({ ...ACCS_SCOPE, ACCS_CUSTOMER_GROUP: 'abc123' });

        expect(model.commerceScope?.map((s) => s.code)).not.toContain('abc123');
        expect(model.commerceScope).toHaveLength(3);
    });

    it('is present on a STALE mesh too — it is an attribute, not a diff', () => {
        const model = deriveMeshCard(
            display({ color: 'orange', text: 'Update needed' }),
            'config-changed',
            meshEntry({ envVars: ACCS_SCOPE }),
            false
        );

        expect(model.status).toBe('stale');
        expect(model.commerceScope).toHaveLength(3);
    });
});


describe('deriveMeshCard — naming the codes from the store structure', () => {
    it('names each deployed code from the persisted hierarchy', () => {
        const model = meshCardWith(ACCS_SCOPE, STRUCTURE);

        expect(model.commerceScope).toEqual([
            { label: 'Website', code: 'citisignal', name: 'CitiSignal' },
            { label: 'Store', code: 'citisignal_store', name: 'CitiSignal Store' },
            { label: 'Store view', code: 'citisignal_us', name: 'CitiSignal US' },
        ]);
    });

    it('leaves a code the structure does not contain bare', () => {
        // The deployed website was renamed or removed in Commerce since. Its code
        // is still the truth about the deployment; only the label is unavailable.
        const model = meshCardWith({ ...ACCS_SCOPE, ACCS_WEBSITE_CODE: 'gone' }, STRUCTURE);

        expect(model.commerceScope?.[0]).toEqual({ label: 'Website', code: 'gone' });
    });

    it('shows bare codes when discovery has never run — every older project', () => {
        const model = meshCardWith(ACCS_SCOPE, undefined);

        expect(model.commerceScope?.every((part) => part.name === undefined)).toBe(true);
    });

    it('looks each part up in its OWN list, not across all three', () => {
        // A website and a store group can share a code. Looking up the store
        // code among websites would name it after an unrelated entity.
        const model = meshCardWith({ ACCS_STORE_CODE: 'citisignal' }, STRUCTURE);

        expect(model.commerceScope).toEqual([{ label: 'Store', code: 'citisignal' }]);
    });

    it('names a PaaS deployment from the same structure', () => {
        const model = meshCardWith({ ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us' }, STRUCTURE);

        expect(model.commerceScope).toEqual([
            { label: 'Store view', code: 'citisignal_us', name: 'CitiSignal US' },
        ]);
    });
});
