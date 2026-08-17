/**
 * RESTORING sample data — remove the pack, then import the same pack again.
 *
 * Reset means "put it back" everywhere else in the product: it re-copies DA.live
 * content from source and republishes rather than wiping it. The data half only
 * ever deleted, so one button meant "put it back" for content and "take it away"
 * for the catalog, and an SC who reset mid-demo was left with an empty instance
 * and a storefront rendering nothing.
 *
 * **The reinstall is gated on a CLEAN removal, and that gate is the design.**
 * Reinstalling on top of data that could not be cleared is not a restore — the
 * result is unverifiable from here (duplicated rows, or an import that fails on
 * records the delete left behind) and it would be reported as success.
 *
 * The expensive failure is deleting and then failing to reinstall, because the
 * instance ends up EMPTY — worse than where the user started. It gets its own
 * reason rather than a generic refusal.
 *
 * A separate file from `sampleDataInstall.test.ts`, which is at 379 lines
 * against a 500-line cap.
 */

import { restoreSampleData } from '@/features/data-installer/services/sampleDataInstall';

const ACCS = 'adobe-commerce-accs';

function project(over: Record<string, unknown> = {}) {
    return {
        name: 'demo-1',
        datapack: { name: 'bodea', version: 'main' },
        componentSelections: { backend: ACCS },
        componentConfigs: {
            [ACCS]: {
                // Must match the real ACCS endpoint SHAPE — the tenant id is parsed
                // out of it, and an unrecognised host derives no instance, which
                // skips the job entirely. TENANT123 is a fake id on the real host.
                ACCS_GRAPHQL_ENDPOINT:
                    'https://na1-sandbox.api.commerce.adobe.com/TENANT123/graphql',
                ACCS_WEBSITE_CODE: 'base',
                ACCS_STORE_VIEW_CODE: 'default',
            },
        },
        ...over,
    } as never;
}

/**
 * Deps whose watch answers differently per PHASE.
 *
 * `startDelete` and `startImport` are separate calls, so which phase is running
 * is knowable — that is what lets a test make the removal succeed and the
 * reinstall fail, which is the case this feature exists to report.
 */
function deps(over: Record<string, unknown> = {}) {
    const phases: string[] = [];
    return {
        phases,
        startDelete: jest.fn().mockImplementation(async () => {
            phases.push('remove');
            return { activationId: 'act-del' };
        }),
        startImport: jest.fn().mockImplementation(async () => {
            phases.push('install');
            return { activationId: 'act-imp' };
        }),
        watch: jest.fn().mockResolvedValue({
            outcome: 'success',
            perType: { categories: 'success', products: 'success' },
        }),
        inventory: jest.fn().mockResolvedValue(['categories', 'products']),
        credentials: jest.fn().mockResolvedValue({
            ok: true,
            credentials: { kind: 'accs', clientId: 'cid', clientSecret: 'fake-test-pw-not-a-secret' },
        }),
        onProgress: jest.fn(),
        ...over,
    };
}

describe('restoreSampleData — the happy path', () => {
    it('removes first, then imports the same pack', async () => {
        const d = deps();

        const result = await restoreSampleData(project(), d as never);

        expect(d.phases).toEqual(['remove', 'install']);
        expect(result.ran).toBe(true);
        expect(result.outcome).toBe('success');
    });

    /** Both phases target the same pack and the same scope. */
    it('imports the pack it just removed, into the same scope', async () => {
        const d = deps();

        await restoreSampleData(project(), d as never);

        const removed = d.startDelete.mock.calls[0][0];
        const installed = d.startImport.mock.calls[0][0];
        expect(installed.id).toEqual(removed.id);
        expect(installed.target).toEqual(removed.target);
    });
});

describe('restoreSampleData — the reinstall gate', () => {
    /**
     * A PARTIAL removal must not be refilled. Leftover records make the import's
     * result unverifiable, and reporting that as a restore would be a lie about
     * a live Commerce instance.
     */
    it('does not reinstall when the removal only partly succeeded', async () => {
        const d = deps({
            watch: jest.fn().mockResolvedValue({
                outcome: 'partial',
                perType: { categories: 'success', products: 'error' },
            }),
        });

        const result = await restoreSampleData(project(), d as never);

        expect(d.startImport).not.toHaveBeenCalled();
        expect(result.reason).toMatch(/not fully removed/i);
    });

    it('does not reinstall when the removal failed outright', async () => {
        const d = deps({
            watch: jest.fn().mockResolvedValue({ outcome: 'error', perType: {} }),
        });

        const result = await restoreSampleData(project(), d as never);

        expect(d.startImport).not.toHaveBeenCalled();
        expect(result.reason).toMatch(/not fully removed/i);
    });

    /**
     * Nothing to remove is a fine place to install from — a project whose pack
     * was never imported, or already cleared, still wants the pack put in.
     */
    it('still installs when there was nothing to remove', async () => {
        const d = deps({ inventory: jest.fn().mockResolvedValue([]) });

        const result = await restoreSampleData(project(), d as never);

        // Skipped for want of stored types, so neither phase starts — and the
        // caller is told why rather than being told it worked.
        expect(result.ran).toBe(false);
        expect(result.skipped).toBe(true);
    });

    /** CONTROL — the gate is about the REMOVAL's outcome, not about it running. */
    it('CONTROL — a clean removal does reinstall', async () => {
        const d = deps();

        await restoreSampleData(project(), d as never);

        expect(d.startImport).toHaveBeenCalled();
    });
});

describe('restoreSampleData — deleted but not reinstalled', () => {
    /**
     * THE outcome this feature must name precisely. The catalog is now EMPTY,
     * which is worse than the state the user started in, and it is the one case
     * where they have to go and do something.
     */
    it('says the data was removed and NOT put back', async () => {
        let call = 0;
        const d = deps({
            watch: jest.fn().mockImplementation(async () => {
                call += 1;
                return call === 1
                    ? { outcome: 'success', perType: { categories: 'success' } }
                    : { outcome: 'error', perType: { categories: 'error' } };
            }),
        });

        const result = await restoreSampleData(project(), d as never);

        expect(result.reason).toMatch(/removed but could not be reinstalled/i);
        expect(result.reason).toMatch(/no longer holds this pack/i);
    });

    /**
     * `ran` stays true: something DID happen to the instance. Reporting it as
     * "did not run" would read as "nothing changed", which is the opposite of
     * the truth and the reason this is not just a generic failure.
     */
    it('reports that it ran, because the instance did change', async () => {
        let call = 0;
        const d = deps({
            watch: jest.fn().mockImplementation(async () => {
                call += 1;
                return call === 1
                    ? { outcome: 'success', perType: { categories: 'success' } }
                    : { outcome: 'error', perType: { categories: 'error' } };
            }),
        });

        const result = await restoreSampleData(project(), d as never);

        expect(result.ran).toBe(true);
    });
});
