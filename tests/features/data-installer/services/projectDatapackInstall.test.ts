/**
 * Installing the wizard's chosen datapack as part of the build.
 *
 * Stage 4 shipped as a seam: the wizard RECORDED a pack and the dashboard
 * installed it later. The intent was always that the build runs it, with the
 * target picked in the wizard — so this is the phase that closes that loop.
 *
 * The reasoning that argued against installing during creation ("it needs a
 * reachable instance") does not survive contact with
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
    typesToInstall,
    installSampleData,
    removeSampleData,
} from '@/features/data-installer/services/projectDatapackInstall';
import { RESULT_LEFT_IN_STORE, WATCHED_LEFT_IN_STORE } from '../../../helpers/datapackRemovalFixtures';

const ACCS = 'adobe-commerce-accs';

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
    };
}

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
            onProgress: jest.fn(),
            ...over,
        };
    }

    it('imports the recorded pack into the recorded scope', async () => {
        const d = deps();

        await installSampleData(project(), d);

        // The client's real shape: target NESTED. An
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

    // The store travels with the pack (research project-export-datapacks, 2026-10-29): a
    // library pack asked of the service was read as missing, and the install failed.
    it('installs a library pack from the library, and reads its inventory there', async () => {
        const d = deps();
        const recorded = { name: 'acme-demo-1a2b3c', version: '20261029-1000', store: 'library' as const, origin: { name: 'bodea', version: 'main' } };

        await installSampleData(project({ datapack: recorded }), d);

        expect(d.inventory).toHaveBeenCalledWith({ name: 'acme-demo-1a2b3c', version: '20261029-1000', store: 'library' });
        expect(d.startImport).toHaveBeenCalledWith({
            id: { name: 'acme-demo-1a2b3c', version: '20261029-1000' },
            commerceInstance: 'TENANT123',
            dataTypes: ['categories', 'products'],
            target: { websiteCode: 'base', storeCode: 'default' },
            source: 'library',
        });
    });

    it('reads a pack recorded with no store from the Data Installer, as before', async () => {
        const d = deps();

        await installSampleData(project(), d);

        expect(d.inventory).toHaveBeenCalledWith({ name: 'bodea', version: 'main' });
        expect(d.startImport.mock.calls[0][0]).not.toHaveProperty('source');
    });

    /** Shared with the modal's derivation, so both resolve the same instance. */
    it('skips a project that names no Commerce instance', async () => {
        const d = deps();
        const noInstance = project({
            componentConfigs: {
                [ACCS]: { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_VIEW_CODE: 'default' },
            },
        });

        const result = await installSampleData(noInstance, d);

            // `ran: false` is the field the build reports on. A skip that claimed
            // to have run would put a phantom import in the creation summary.
            expect(result).toMatchObject({ ran: false, skipped: true });
        expect(d.startImport).not.toHaveBeenCalled();
    });

    it('reports the outcome it watched', async () => {
        const result = await installSampleData(project(), deps());

        expect(result).toMatchObject({ ran: true, outcome: 'success' });
    });

    /** Rule 1, and the reason this returns rather than throws. */
    it('never throws when the service refuses', async () => {
        const d = deps({ startImport: jest.fn().mockRejectedValue(new Error('service down')) });

        const result = await installSampleData(project(), d);

        expect(result).toMatchObject({ ran: false });
        expect(result.reason).toMatch(/service down/i);
    });

    it('never throws when the watch itself fails', async () => {
        const d = deps({ watch: jest.fn().mockRejectedValue(new Error('poll exploded')) });

        await expect(installSampleData(project(), d)).resolves.toMatchObject({
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

        const result = await installSampleData(project(), d);

        expect(result).toMatchObject({ ran: true, outcome: 'partial' });
    });

    // The run's reason is what a failed creation install records (step-04 S7, P4-Q11).
    it('carries the run\'s reason with a partial import', async () => {
        const d = deps({
            watch: jest.fn().mockResolvedValue({ outcome: 'partial', perType: { products: 'error' }, reason: 'Products refused.' }),
        });

        const result = await installSampleData(project(), d);

        expect(result).toStrictEqual({ ran: true, outcome: 'partial', perType: { products: 'error' }, reason: 'Products refused.' });
    });

    describe('the cases where it does nothing at all', () => {
        it('skips a project that chose no pack', async () => {
            const d = deps();

            const result = await installSampleData(project({ datapack: undefined }), d);

            expect(result).toMatchObject({ ran: false, skipped: true });
            expect(d.startImport).not.toHaveBeenCalled();
        });

        it('skips when the Business Structure scope was never recorded', async () => {
            const d = deps();

            // The instance IS derivable here — only the website/store pair is
            // missing — so nothing downstream can stand in for the target check.
            const result = await installSampleData(
                project({
                    componentConfigs: {
                        [ACCS]: {
                            ACCS_GRAPHQL_ENDPOINT:
                                'https://na1-sandbox.api.commerce.adobe.com/TENANT123/graphql',
                        },
                    },
                }),
                d,
            );

            expect(result).toMatchObject({ ran: false, skipped: true });
            expect(d.startImport).not.toHaveBeenCalled();
        });

        /** Nothing stored means nothing to ask for — a request would 400. */
        it('skips when the service holds no item for the pack', async () => {
            const d = deps({ inventory: jest.fn().mockResolvedValue([]) });

            const result = await installSampleData(project(), d);

            expect(result).toMatchObject({ ran: false, skipped: true });
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

        await installSampleData(project(), d);

        expect(d.onProgress).toHaveBeenCalled();
    });

    it('never puts the credential pair in its result', async () => {
        const result = await installSampleData(project(), deps());

        expect(JSON.stringify(result)).not.toContain('fake-test-secret-not-a-secret');
    });

    /**
     * The label the poller logs is chosen per PHASE. Pinning it to either verb
     * mislabels the other, which is exactly what happened for a few hours the day
     * a fix for "a removal logged as an import" hardcoded 'reset'.
     */
    it('tells the poller it is watching an import', async () => {
        const d = deps();

        await installSampleData(project(), d);

        expect(d.watch).toHaveBeenCalledWith(
            expect.objectContaining({ operation: 'import' }),
        );
    });
});

/**
 * Removing a pack, for the Reset workflow.
 *
 * The same job as installing with a different verb — same target, same instance,
 * same inventory-derived type list — so it runs through the same runner rather
 * than a near-copy that would drift the moment one side gained a guard.
 *
 * The rules that DIFFER are the ones worth pinning: this deletes data from a
 * live Commerce instance, so it starts a delete rather than an import, and the
 * caller must have confirmed. Everything else about it is install's contract.
 */
describe('removeSampleData', () => {
    function deps(over: Record<string, unknown> = {}) {
        return {
            startImport: jest.fn().mockResolvedValue({ activationId: 'act-import' }),
            startDelete: jest.fn().mockResolvedValue({ activationId: 'act-delete' }),
            watch: jest.fn().mockResolvedValue({
                outcome: 'success',
                perType: { categories: 'success' },
            }),
            inventory: jest.fn().mockResolvedValue(['categories', 'products']),
            onProgress: jest.fn(),
            ...over,
        };
    }

    it('starts a DELETE, never an import', async () => {
        const d = deps();

        await removeSampleData(project(), d);

        expect(d.startDelete).toHaveBeenCalled();
        expect(d.startImport).not.toHaveBeenCalled();
    });

    it('removes from the same scope the pack was installed into', async () => {
        const d = deps();

        await removeSampleData(project(), d);

        expect(d.startDelete).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: 'bodea', version: 'main' },
                commerceInstance: 'TENANT123',
                target: { websiteCode: 'base', storeCode: 'default' },
            }),
        );
    });

    // Step-06 C3 re-review: Clear's removal names the products its wipe deletes next.
    it('hands the delete the products a clearing deletes next, and nothing of the kind otherwise', async () => {
        const told = deps();
        const plain = deps();

        await removeSampleData(project(), told, { alsoLeaving: ['SC-OWN-1'] });
        await removeSampleData(project(), plain);

        expect(told.startDelete).toHaveBeenCalledWith(expect.objectContaining({ alsoLeaving: ['SC-OWN-1'] }));
        expect(plain.startDelete.mock.calls[0][0]).not.toHaveProperty('alsoLeaving');
    });

    it('watches the delete it started, not some other job', async () => {
        const d = deps();

        await removeSampleData(project(), d);

        expect(d.watch).toHaveBeenCalledWith(
            expect.objectContaining({ activationId: 'act-delete' }),
        );
    });

    it('reports the outcome', async () => {
        const result = await removeSampleData(project(), deps());

        expect(result).toMatchObject({ ran: true, outcome: 'success' });
    });

    // What a reset reads to decide whether the project still names the pack (step-05 R1).
    it('says when the removal left part of the pack in the store', async () => {
        const watch = jest.fn().mockResolvedValue({ outcome: 'success', perType: { categories: 'success' }, leftInStore: true });

        const result = await removeSampleData(project(), deps({ watch }));

        expect(result).toStrictEqual({ ran: true, outcome: 'success', perType: { categories: 'success' }, leftInStore: true });
    });

    // The owner's rule is "no target was EVER recorded" (review, 2026-11-14): today's codes are not
    // it. A pack whose install record says where it went is removed there, whatever Configure says now.
    it('removes at the install record\'s target when the project names no website and store view now', async () => {
        const installRecordOf = jest.fn().mockResolvedValue({ target: { websiteCode: 'acme', storeCode: 'acme_en' } });
        const d = deps({ installRecordOf });

        const result = await removeSampleData(project({ componentConfigs: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/TENANT123/graphql' } } }), d);

        expect(installRecordOf).toHaveBeenCalledWith({ name: 'bodea', version: 'main' });
        expect(d.startDelete.mock.calls[0][0]).toMatchObject({ target: { websiteCode: 'acme', storeCode: 'acme_en' } });
        expect(result).toMatchObject({ ran: true, outcome: 'success' });
        expect(result).not.toHaveProperty('noTarget');
    });

    it('keeps the data, saying why, when the record names no target and the project names none now', async () => {
        const d = deps({ installRecordOf: jest.fn().mockResolvedValue({}) });

        const result = await removeSampleData(project({ componentConfigs: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/TENANT123/graphql' } } }), d);

        expect(d.startDelete).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ ran: false, skipped: true, reason: 'No website and store view are set for this project, and its install record names none, so its datapack cannot be uninstalled.' });
    });

    // Nothing can have been installed with no record and no target: nothing to remove (owner, 2026-11-14).
    it('marks a removal with no install record and no website and store view as nothing to remove', async () => {
        const d = deps({ installRecordOf: jest.fn().mockResolvedValue(undefined) });

        const result = await removeSampleData(project({ componentConfigs: {} }), d);

        expect(result).toMatchObject({ ran: false, skipped: true, noTarget: true });
        expect(d.startDelete).not.toHaveBeenCalled();
    });

    // step-07 D6: the record is where the data is, so it wins over a website changed since.
    it("removes at the record's target even when the project names other codes now", async () => {
        const d = deps({ installRecordOf: jest.fn().mockResolvedValue({ target: { websiteCode: 'old', storeCode: 'old_en' } }) });

        await removeSampleData(project(), d);

        expect(d.startDelete.mock.calls[0][0].target).toEqual({ websiteCode: 'old', storeCode: 'old_en' });
    });

    it("CONTROL: an install goes where the project says now, whatever a record says", async () => {
        const installRecordOf = jest.fn().mockResolvedValue({ target: { websiteCode: 'old', storeCode: 'old_en' } });
        const d = deps({ installRecordOf });

        await installSampleData(project(), d);

        expect(installRecordOf).not.toHaveBeenCalled();
        expect(d.startImport.mock.calls[0][0].target).not.toEqual({ websiteCode: 'old', storeCode: 'old_en' });
    });

    // step-07 D1: a delete names what was left, so the engine's note travels with the flag.
    it("carries the engine's note on what it left in the store", async () => {
        const watch = jest.fn().mockResolvedValue(WATCHED_LEFT_IN_STORE);

        const result = await removeSampleData(project(), deps({ watch }));

        expect(result).toStrictEqual(RESULT_LEFT_IN_STORE);
    });

    it('CONTROL: says nothing of it when the removal took everything', async () => {
        const result = await removeSampleData(project(), deps());

        expect(result).not.toHaveProperty('leftInStore');
    });

    /** A reset must not be failed by the optional half of it. */
    it('never throws when the delete refuses', async () => {
        const d = deps({ startDelete: jest.fn().mockRejectedValue(new Error('service down')) });

        await expect(removeSampleData(project(), d)).resolves.toMatchObject({
            ran: false,
        });
    });

    it('skips a project that recorded no pack', async () => {
        const d = deps();

        const result = await removeSampleData(project({ datapack: undefined }), d);

        expect(result).toMatchObject({ ran: false, skipped: true });
        expect(d.startDelete).not.toHaveBeenCalled();
    });

    it('never puts the credential pair in its result', async () => {
        const result = await removeSampleData(project(), deps());

        expect(JSON.stringify(result)).not.toContain('fake-test-secret-not-a-secret');
    });

    it('tells the poller it is watching a reset', async () => {
        const d = deps();

        await removeSampleData(project(), d);

        expect(d.watch).toHaveBeenCalledWith(
            expect.objectContaining({ operation: 'reset' }),
        );
    });

    /**
     * `startDelete` is optional on the deps, so a caller wired only for install
     * can reach here. It must refuse rather than fall through to `startImport`
     * and IMPORT the pack it was asked to remove.
     */
    it('refuses, and imports nothing, when the caller cannot delete', async () => {
        const d = deps({ startDelete: undefined });

        const result = await removeSampleData(project(), d);

        // It refuses BEFORE the call, and says so. Falling through would hand
        // `undefined` to `start(...)` and report the TypeError as the reason —
        // still ran:false, but no longer telling anyone what is actually wrong.
        expect(result).toMatchObject({
            ran: false,
            reason: 'This caller cannot uninstall a datapack.',
        });
        expect(d.startImport).not.toHaveBeenCalled();
        expect(d.watch).not.toHaveBeenCalled();
    });
});
