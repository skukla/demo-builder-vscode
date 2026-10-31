/**
 * Demo Builder's engine with an ACO pack (PL-60 P4): a pack whose kinds are all ACO's goes to the
 * project's ACO instance through the ACO client, needs no Commerce website or store view, is
 * removed from the instance its record names, and says plainly that ACO cannot be read back.
 * A pack mixing ACO and Commerce kinds is refused before anything is written.
 */

import { AcoApiError } from '@/features/data-installer/services/aco/acoClient';
import { NO_ACO, NO_READ_BACK } from '@/features/data-installer/services/aco/acoJobs';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import type { ImportRequest } from '@/features/data-installer/services/dataInstallerWriteClient';
import { demoBuilderEngine, type DemoBuilderEngineDeps } from '@/features/data-installer/services/demoBuilderEngine/engine';
import { openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { AcoInstance } from '@/types/aco';
import type { AcoProductRow } from '@/types/acoPack';
import { ACO_INSTANCE, ACO_SETTINGS, fakeAco } from '../aco/acoFakes.testUtils';
import { PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';

const product = (sku: string, locale = 'en-US'): AcoProductRow => ({ sku, source: { locale }, name: sku, slug: sku.toLowerCase(), status: 'ENABLED', description: null });
const ITEMS = { aco_products: [product('TENT-1')], aco_price_books: [{ priceBookId: 'main', name: 'Main', currency: 'USD' }] };

function request(overrides: Partial<ImportRequest> = {}): ImportRequest {
    return { id: PACK, commerceInstance: 'ignored', dataTypes: ['aco_products', 'aco_price_books'], ...overrides };
}

function engineWith(overrides: Partial<DemoBuilderEngineDeps> = {}, aco = fakeAco()) {
    const files = memoryFiles();
    const clientsFor: AcoInstance[] = [];
    const commerce = jest.fn(async () => ({ refusal: 'Commerce is not touched by an ACO pack' }));
    const engine = demoBuilderEngine({
        commerce,
        readPack: async () => ITEMS,
        projectPath: PROJECT,
        log: () => undefined,
        files,
        now: () => new Date('2026-10-31T12:00:00.000Z'),
        aco: async () => ({
            settings: ACO_SETTINGS,
            clientFor: (instance) => {
                clientsFor.push(instance);
                return aco;
            },
        }),
        ...overrides,
    });
    return { engine, files, aco, clientsFor, commerce };
}

async function settle(engine: DatapackEngine, activationId: string) {
    for (let i = 0; i < 100; i += 1) {
        const status = await engine.getJobStatus(activationId);
        if (status.processingTimeMs !== undefined) return status;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the job never finished');
}

describe('demoBuilderEngine with an ACO pack', () => {
    it('loads it into the project\'s ACO instance with no website or store view, and never opens Commerce', async () => {
        const { engine, files, aco, commerce } = engineWith();
        const { activationId } = await engine.startImport(request());
        const status = await settle(engine, activationId);

        expect(status.perType).toEqual({ aco_products: 'success', aco_price_books: 'success' });
        expect(aco.calls.map((c) => c.path)).toEqual(['/v1/catalog/products', '/v1/catalog/price-books']);
        expect(commerce).not.toHaveBeenCalled();
        const record = await readInstallRecord(files, PROJECT, PACK);
        expect(record?.aco).toEqual(ACO_INSTANCE);
        expect(status.note).toContain(NO_READ_BACK);
    });

    it('says when the pack\'s locale is not the one the storefront reads', async () => {
        const { engine } = engineWith({ readPack: async () => ({ aco_products: [product('A', 'default')] }) });
        const status = await settle(engine, (await engine.startImport(request({ dataTypes: ['aco_products'] }))).activationId);
        expect(status.note).toMatch(/storefront reads the locale en-US.*for default/u);
    });

    it('refuses a pack with a row ACO could not take, before anything is sent', async () => {
        const { engine, aco } = engineWith({ readPack: async () => ({ aco_products: [{ sku: 'X', source: { locale: 'en-US' } }] }) });
        const { activationId } = await engine.startImport(request({ dataTypes: ['aco_products'] }));
        await settle(engine, activationId);
        expect((await engine.getJobFailureReason(activationId))?.error).toMatch(/^Nothing was installed: aco_products row 1:/u);
        expect(aco.calls).toEqual([]);
    });

    it('refuses a pack that mixes ACO and Commerce kinds, writing nothing', async () => {
        const { engine, aco } = engineWith();
        const mixed = request({ dataTypes: ['categories', 'aco_products'], target: { websiteCode: 'base', storeCode: 'default' } });
        await expect(engine.validateImport(mixed)).resolves.toEqual({ valid: false, reason: expect.stringMatching(/ACO kinds \(aco_products\) and Commerce kinds \(categories\)/u) });
        const { activationId } = await engine.startImport(mixed);
        await settle(engine, activationId);
        expect((await engine.getJobFailureReason(activationId))?.error).toMatch(/nothing was installed/u);
        expect(aco.calls).toEqual([]);
    });

    it('refuses an ACO pack when the project has no ACO', async () => {
        const { engine } = engineWith({ aco: undefined });
        await expect(engine.validateImport(request())).resolves.toEqual({ valid: false, reason: NO_ACO });
        await expect(engine.checkCredentials(request())).resolves.toEqual({ usable: false, reason: NO_ACO });
    });

    it('passes on the refusal the project\'s ACO access gives', async () => {
        const { engine } = engineWith({ aco: async () => ({ refusal: 'Set up the ACO credential first.' }) });
        await expect(engine.validateImport(request())).resolves.toEqual({ valid: false, reason: 'Set up the ACO credential first.' });
    });

    it('checks the credential by minting a token, writing nothing', async () => {
        const { engine, aco } = engineWith();
        await expect(engine.checkCredentials(request())).resolves.toEqual({ usable: true });
        expect(aco.authenticated).toBe(1);
        expect(aco.calls).toEqual([]);
    });

    it('dry-runs an ACO pack without a website or store view', async () => {
        const { engine } = engineWith();
        await expect(engine.validateImport(request())).resolves.toEqual({ valid: true });
    });

    it('refuses a kind it does not load into ACO', async () => {
        const { engine } = engineWith();
        await expect(engine.validateImport(request({ dataTypes: ['aco_catalog_views'] }))).resolves.toEqual({
            valid: false,
            reason: 'Demo Builder does not load aco_catalog_views into ACO yet.',
        });
    });

    it('refuses to load a pack whose record is in another ACO instance', async () => {
        const { engine, files } = engineWith();
        await openInstallRecord(files, PROJECT, PACK, () => 'then', { aco: { ...ACO_INSTANCE, tenantId: 'OtherTenant' } }).then((r) => r.record({ kind: 'aco_products', id: '{}' }));
        await expect(engine.validateImport(request())).resolves.toEqual({ valid: false, reason: expect.stringMatching(/loaded in the ACO instance OtherTenant/u) });
    });

    it('removes it from the instance its record names, by the pack\'s own keys', async () => {
        const { engine, files, aco, clientsFor } = engineWith();
        await settle(engine, (await engine.startImport(request())).activationId);
        aco.calls.length = 0;
        const { activationId } = await engine.startDelete(request());
        const status = await settle(engine, activationId);
        expect(status.perType).toEqual({ aco_products: 'success', aco_price_books: 'success' });
        expect(aco.calls.map((c) => c.path)).toEqual(['/v1/catalog/price-books/delete', '/v1/catalog/products/delete']);
        expect(clientsFor.at(-1)).toEqual(ACO_INSTANCE);
        expect(await readInstallRecord(files, PROJECT, PACK)).toBeUndefined();
        expect(status.note).toBe('Deleted 2 ACO rows by the pack\'s own keys.');
    });

    it('ends every kind failed, with ACO\'s reason, when ACO stops the load', async () => {
        const { engine } = engineWith({}, fakeAco(() => new AcoApiError('ACO answered 403 for POST /v1/catalog/products: forbidden', 'ingestion', 403)));
        const { activationId } = await engine.startImport(request());
        const status = await settle(engine, activationId);
        expect(status.perType).toEqual({ aco_products: 'error', aco_price_books: 'error' });
        expect((await engine.getJobFailureReason(activationId))?.error).toMatch(/403/u);
    });
});
