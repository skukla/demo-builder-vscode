/**
 * A sub-step's "done" verdict must cover ITS OWN fields, not the whole form.
 *
 * THE DEADLOCK (PaaS, traced 2026-08-10):
 *   `useComponentConfig` computes one `allValid` over every field in every service
 *   group. That single boolean became `state.commerceConnectValid`, which
 *   `commerceSections` uses to mark Connection done and to UNLOCK Catalog.
 *
 *   `ADOBE_CATALOG_API_KEY` and `ADOBE_COMMERCE_ENVIRONMENT_ID` are required on
 *   PaaS, have no default, and are seeded by no demo package. They live in the
 *   `catalog-service` group, which renders ONLY in the Catalog sub-step.
 *
 *   So: those two are empty → allValid false → Connection never done → Catalog
 *   locked → the only place to fill them is unreachable. A locked rail tab is
 *   non-clickable (StepRail) and Continue gates on the same boolean, so a PaaS
 *   project cannot be completed.
 *
 * Scoping the CONNECTION gate alone would swap a deadlock for silent data loss —
 * `isCommerceStepComplete` returns `true` unconditionally for `catalog`, so the
 * user could walk past required-but-empty fields. Hence per-section verdicts:
 * Connection reports on connection fields, Catalog reports on catalog fields.
 *
 * Uses the error map `useComponentConfig` already produces, so no validation rule
 * is reimplemented here — only sliced.
 */

import { computeCommerceSectionValidity } from '@/features/project-creation/ui/components/commerceSectionValidity';
import type { ServiceGroup } from '@/features/components/ui/hooks/useComponentConfig';

const PAAS_URL = 'ADOBE_COMMERCE_URL';
const PAAS_USER = 'ADOBE_COMMERCE_ADMIN_USERNAME';
const PAAS_WEBSITE = 'ADOBE_COMMERCE_WEBSITE_CODE';
const CATALOG_KEY = 'ADOBE_CATALOG_API_KEY';

function field(key: string) {
    return { key, label: key, type: 'text', required: true, componentIds: ['x'] };
}

/** The PaaS shape: connection + store codes in one group, catalog in another. */
const GROUPS = [
    {
        id: 'adobe-commerce',
        label: 'Adobe Commerce',
        fields: [field(PAAS_URL), field(PAAS_USER), field(PAAS_WEBSITE)],
    },
    {
        id: 'catalog-service',
        label: 'Catalog Service',
        fields: [field(CATALOG_KEY)],
    },
] as unknown as ServiceGroup[];

describe('computeCommerceSectionValidity', () => {
    it('reports Connection VALID while a catalog field is still missing', () => {
        // The deadlock, stated directly. Connection's own fields are fine; the
        // only error is in a section Connection does not own.
        const validity = computeCommerceSectionValidity(GROUPS, {
            [CATALOG_KEY]: 'Catalog API Key is required',
        });

        expect(validity.connection).toBe(true);
    });

    it('reports Catalog INVALID for that same state — the gate moves, it does not vanish', () => {
        // Without this, unblocking Connection would let a user walk past required
        // catalog fields and generate a .env with blanks.
        const validity = computeCommerceSectionValidity(GROUPS, {
            [CATALOG_KEY]: 'Catalog API Key is required',
        });

        expect(validity.catalog).toBe(false);
    });

    it('reports Connection invalid when a CONNECTION field is bad', () => {
        const validity = computeCommerceSectionValidity(GROUPS, {
            [PAAS_URL]: 'Must be a valid URL',
        });

        expect(validity.connection).toBe(false);
        expect(validity.catalog).toBe(true);
    });

    it('puts store-code errors under Business Structure, not Connection', () => {
        const validity = computeCommerceSectionValidity(GROUPS, {
            [PAAS_WEBSITE]: 'Website Code is required',
        });

        expect(validity.connection).toBe(true);
        expect(validity['business-structure']).toBe(false);
    });

    it('is all-valid when there are no errors — the control', () => {
        const validity = computeCommerceSectionValidity(GROUPS, {});

        // `credentials` joined the split when the OAuth pair got its own heading.
        // Every RENDERED section must appear here: an unlisted one gates nothing,
        // which is the inverse of the deadlock this function exists to prevent.
        expect(validity).toEqual({
            connection: true,
            credentials: true,
            'business-structure': true,
            catalog: true,
        });
    });

    it('treats a section with no fields as valid', () => {
        // ACCS projects have an empty catalog-service group; an absent section
        // must not read as unfinished.
        const validity = computeCommerceSectionValidity(
            [GROUPS[0]] as unknown as ServiceGroup[],
            {}
        );

        expect(validity.catalog).toBe(true);
    });
});
