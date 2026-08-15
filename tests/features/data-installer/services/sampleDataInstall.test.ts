/**
 * Installing the wizard's chosen datapack as part of the build.
 *
 * Stage 4 shipped as a seam: the wizard RECORDED a pack and the dashboard
 * installed it later. The intent was always that the build runs it, with the
 * target picked in the wizard — so this is the phase that closes that loop.
 *
 * The reasoning that argued against installing during creation ("it needs a
 * reachable instance with working credentials") does not survive contact with
 * the wizard's own order: the Commerce **Connection** sub-step validates exactly
 * that, several steps earlier. By the time this phase runs, reachability is a
 * measured fact rather than a hope.
 *
 * Three rules carry the weight here:
 *
 * 1. **It can never fail the build.** The project is complete and usable without
 *    sample data; the instance is already partly populated by the time anything
 *    goes wrong, and the wizard has no rollback for that. So every failure is
 *    reported and swallowed.
 * 2. **`products` drags `customer_groups` in.** Measured 2026-08-14: Bodea's
 *    tier prices name a group, the service resolves that name at import time,
 *    and with no groups imported the lookup failed and took the ENTIRE products
 *    type down — 56 products, zero landed. The modal WARNS a human about this.
 *    A build phase has nobody to warn, so it fixes it silently.
 * 3. **Types come from the INVENTORY, not the declaration.** A pack can declare
 *    a type the service stores no item for; asking for it imports nothing and
 *    reports a failure that is not one.
 *
 * Strict TDD: written BEFORE the module exists.
 */

import {
    resolveInstallTarget,
    typesToInstall,
    installSampleData,
} from '@/features/data-installer/services/sampleDataInstall';

const ACCS = 'adobe-commerce-accs';
const PAAS = 'adobe-commerce-paas';

function project(over: Record<string, unknown> = {}) {
    return {
        name: 'demo-1',
        datapack: { name: 'bodea', version: 'main' },
        componentSelections: { backend: ACCS },
        componentConfigs: {
            [ACCS]: {
                ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/TENANT123/graphql',
                ACCS_WEBSITE_CODE: 'base',
                ACCS_STORE_VIEW_CODE: 'default',
            },
        },
        ...over,
    } as never;
}

describe('resolveInstallTarget', () => {
    it('reads the ACCS scope the Business Structure sub-step recorded', () => {
        expect(resolveInstallTarget(project())).toMatchObject({
            websiteCode: 'base',
            storeCode: 'default',
        });
    });

    /** The two backends spell the same two facts differently. */
    it('reads the PaaS keys for a PaaS project', () => {
        const paas = project({
            componentSelections: { backend: PAAS },
            componentConfigs: {
                [PAAS]: {
                    ADOBE_COMMERCE_URL: 'https://shop.example.com',
                    ADOBE_COMMERCE_WEBSITE_CODE: 'main_website',
                    ADOBE_COMMERCE_STORE_VIEW_CODE: 'en',
                },
            },
        });

        expect(resolveInstallTarget(paas)).toMatchObject({
            websiteCode: 'main_website',
            storeCode: 'en',
        });
    });

    /**
     * Both codes or neither. The service validates them as a PAIR and defaults
     * to `base` when they are absent, so half a target is worse than none — it
     * would write into a scope nobody chose.
     */
    it('reports no target when only one of the pair was recorded', () => {
        const half = project({
            componentConfigs: {
                [ACCS]: { ACCS_WEBSITE_CODE: 'base' },
            },
        });

        expect(resolveInstallTarget(half)).toBeNull();
    });

    it('reports no target for a project with no Commerce backend', () => {
        expect(resolveInstallTarget(project({ componentSelections: {} }))).toBeNull();
    });
});

describe('typesToInstall', () => {
    it('installs what the service HOLDS, not what the pack declares', () => {
        expect(typesToInstall(['categories', 'products'], ['categories', 'products', 'giftcards']))
            .toEqual(['categories', 'products']);
    });

    /** Rule 2: the dependency the modal only warns about. */
    it('adds customer_groups when products is going in without it', () => {
        const types = typesToInstall(
            ['categories', 'products', 'customer_groups'],
            ['categories', 'products'],
        );

        expect(types).toContain('customer_groups');
    });

    /** Only when the pack actually has groups to add — otherwise it is a 400. */
    it('does not invent customer_groups the pack does not hold', () => {
        const types = typesToInstall(['categories', 'products'], ['categories', 'products']);

        expect(types).not.toContain('customer_groups');
    });

    it('leaves a products-free selection alone', () => {
        expect(typesToInstall(['categories', 'customer_groups'], ['categories'])).toEqual([
            'categories',
        ]);
    });
});

describe('installSampleData', () => {
    function deps(over: Record<string, unknown> = {}) {
        return {
            startImport: jest.fn().mockResolvedValue({ activationId: 'act-1' }),
            watch: jest.fn().mockResolvedValue({
                outcome: 'success',
                perType: { categories: 'success', products: 'success' },
            }),
            inventory: jest.fn().mockResolvedValue(['categories', 'products']),
            credentials: jest.fn().mockResolvedValue({
                ok: true,
                credentials: { kind: 'accs', clientId: 'cid', clientSecret: 'fake-test-secret-not-a-secret' },
            }),
            onProgress: jest.fn(),
            ...over,
        };
    }

    it('imports the recorded pack into the recorded scope', async () => {
        const d = deps();

        await installSampleData(project(), d as never);

        // The client's real shape: target NESTED, credentials alongside. An
        // earlier version of this test asserted a flat websiteCode/storeCode and
        // the implementation obligingly sent one — a shape the client rejects.
        expect(d.startImport).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: 'bodea', version: 'main' },
                commerceInstance: 'TENANT123',
                target: { websiteCode: 'base', storeCode: 'default' },
            }),
        );
    });

    /** Shared with the modal's derivation, so both resolve the same instance. */
    it('skips a project that names no Commerce instance', async () => {
        const d = deps();
        const noInstance = project({
            componentConfigs: {
                [ACCS]: { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_VIEW_CODE: 'default' },
            },
        });

        const result = await installSampleData(noInstance, d as never);

        expect(result).toMatchObject({ skipped: true });
        expect(d.startImport).not.toHaveBeenCalled();
    });

    it('reports the outcome it watched', async () => {
        const result = await installSampleData(project(), deps() as never);

        expect(result).toMatchObject({ ran: true, outcome: 'success' });
    });

    /** Rule 1, and the reason this returns rather than throws. */
    it('never throws when the service refuses', async () => {
        const d = deps({ startImport: jest.fn().mockRejectedValue(new Error('service down')) });

        const result = await installSampleData(project(), d as never);

        expect(result).toMatchObject({ ran: false });
        expect(result.reason).toMatch(/service down/i);
    });

    it('never throws when the watch itself fails', async () => {
        const d = deps({ watch: jest.fn().mockRejectedValue(new Error('poll exploded')) });

        await expect(installSampleData(project(), d as never)).resolves.toMatchObject({
            ran: false,
        });
    });

    it('reports a partial import as ran-but-not-clean', async () => {
        const d = deps({
            watch: jest.fn().mockResolvedValue({
                outcome: 'partial',
                perType: { categories: 'success', products: 'error' },
            }),
        });

        const result = await installSampleData(project(), d as never);

        expect(result).toMatchObject({ ran: true, outcome: 'partial' });
    });

    describe('the cases where it does nothing at all', () => {
        it('skips a project that chose no pack', async () => {
            const d = deps();

            const result = await installSampleData(project({ datapack: undefined }), d as never);

            expect(result).toMatchObject({ ran: false, skipped: true });
            expect(d.startImport).not.toHaveBeenCalled();
        });

        it('skips when the Business Structure scope was never recorded', async () => {
            const d = deps();

            const result = await installSampleData(
                project({ componentConfigs: { [ACCS]: {} } }),
                d as never,
            );

            expect(result).toMatchObject({ skipped: true });
            expect(d.startImport).not.toHaveBeenCalled();
        });

        it('skips when the project has no usable Commerce credentials', async () => {
            const d = deps({
                credentials: jest.fn().mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' }),
            });

            const result = await installSampleData(project(), d as never);

            expect(result).toMatchObject({ skipped: true });
            expect(d.startImport).not.toHaveBeenCalled();
        });

        /** Nothing stored means nothing to ask for — a request would 400. */
        it('skips when the service holds no item for the pack', async () => {
            const d = deps({ inventory: jest.fn().mockResolvedValue([]) });

            const result = await installSampleData(project(), d as never);

            expect(result).toMatchObject({ skipped: true });
            expect(d.startImport).not.toHaveBeenCalled();
        });
    });

    /** The build's progress line comes from the same per-type map the modal uses. */
    it('forwards progress while it runs', async () => {
        const d = deps({
            watch: jest.fn().mockImplementation(async (args: { onProgress?: (m: unknown) => void }) => {
                args.onProgress?.({ categories: 'processing' });
                return { outcome: 'success', perType: { categories: 'success' } };
            }),
        });

        await installSampleData(project(), d as never);

        expect(d.onProgress).toHaveBeenCalled();
    });

    it('never puts the credential pair in its result', async () => {
        const result = await installSampleData(project(), deps() as never);

        expect(JSON.stringify(result)).not.toContain('fake-test-secret-not-a-secret');
    });
});
