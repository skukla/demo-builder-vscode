/**
 * erpStorePreparation — "Prepare this store" run as part of adding the ERP integration (owner,
 * 2026-10-22). Commerce is the boundary: the signed client and the check reader are fakes, and
 * the real engine and the real settings fix run over them, so what is asserted is what Commerce
 * was SENT and what the project RECORDS — the record Undo and the removal's teardown read.
 */

const mockOpenCommerce = jest.fn();
jest.mock('@/features/project-creation/services/erpAssignProducts', () => ({
    openCommerce: (...a: unknown[]) => mockOpenCommerce(...a),
}));
const mockReader = jest.fn();
jest.mock('@/features/dashboard/services/setupCheckReader', () => ({
    ...jest.requireActual('@/features/dashboard/services/setupCheckReader'),
    setupCheckReaderFor: (...a: unknown[]) => mockReader(...a),
}));
const mockRunCheck = jest.fn();
jest.mock('@/features/app-builder/services/setupChecks', () => ({
    runSetupCheck: (...a: unknown[]) => mockRunCheck(...a),
}));

import { preparesStoreOnAdd } from '@/features/app-builder/services/storePreparation/fixReach';
import { prepareStoreOnAdd, previewStoreForAdd } from '@/features/project-creation/services/erpStorePreparation';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { AppBuilderComponentCatalogEntry, SetupStep } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const PRICE_SCOPE: SetupStep = {
    id: 'price-scope',
    title: 'Prices per website',
    label: 'Price scope',
    why: 'A price the ERP grants for one website shows on that website only.',
    where: 'Stores > Configuration > Catalog > Price',
    check: 'price-scope-website',
    fix: { kind: 'config', items: [{ path: 'catalog/price/scope', value: '1', scope: 'default' }] },
};
const BY_HAND: SetupStep = { id: 'associate', title: 'Associate the app', label: 'Associate', why: 'w', where: 'Apps' };

const ENTRY = {
    id: 'erp-integration',
    name: 'ERP Integration',
    kind: 'integration',
    fillsSystem: true,
    setupSteps: [PRICE_SCOPE, BY_HAND],
} as AppBuilderComponentCatalogEntry;

const ctx = { authManager: {} as AuthenticationService, credentials: undefined };

function project(): Project {
    return createMockProject({
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                name: 'ERP Integration',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
            },
        },
    });
}

/** Commerce with price scope stored at 0, and a PUT that answers `putAnswer`. */
function commerce(putAnswer: unknown = { errors: [] }) {
    return {
        get: jest.fn(async (path: string) =>
            path.includes('scope=default') ? { items: [{ path: 'catalog/price/scope', value: '0' }] } : { items: [] },
        ),
        send: jest.fn(async () => putAnswer),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockReader.mockResolvedValue({ read: jest.fn(), scope: { websiteCode: 'justrite' } });
    mockRunCheck.mockResolvedValue({ done: false, note: 'Prices are global' });
});

describe('preparesStoreOnAdd', () => {
    it('is the entry that fills a system and has a step Demo Builder can apply', () => {
        expect(preparesStoreOnAdd(ENTRY)).toBe(true);
        expect(preparesStoreOnAdd({ ...ENTRY, fillsSystem: false })).toBe(false);
        expect(preparesStoreOnAdd({ ...ENTRY, setupSteps: [BY_HAND] })).toBe(false);
    });
});

describe('previewStoreForAdd', () => {
    it('says what each step would change, writes nothing, and names the steps that reach every website', async () => {
        const store = commerce();
        mockOpenCommerce.mockResolvedValue(store);

        const preview = await previewStoreForAdd(project(), ENTRY, ctx);

        expect(store.send).not.toHaveBeenCalled();
        expect(preview).toStrictEqual({
            steps: [
                expect.objectContaining({ id: 'price-scope', state: 'applicable', changes: ['catalog/price/scope at the default scope: 0 → 1'] }),
                expect.objectContaining({ id: 'associate', state: 'manual' }),
            ],
            everyWebsite: ['Price scope'],
        });
    });

    it('answers the refusal when Commerce cannot be opened', async () => {
        mockOpenCommerce.mockResolvedValue({ refusal: 'Sign in to Adobe first.' });

        await expect(previewStoreForAdd(project(), ENTRY, ctx)).resolves.toStrictEqual({ refusal: 'Sign in to Adobe first.' });
    });
});

describe('prepareStoreOnAdd', () => {
    it('applies the steps, records what it changed on the integration as Prepare does, and saves the project', async () => {
        const store = commerce();
        mockOpenCommerce.mockResolvedValue(store);
        const saveProject = jest.fn(async () => undefined);
        const target = project();
        const onStep = jest.fn();

        const outcome = await prepareStoreOnAdd(target, ENTRY, { ...ctx, saveProject }, onStep);

        expect(outcome).toStrictEqual({ status: 'prepared' });
        expect(store.send).toHaveBeenCalledWith('PUT', 'system/config', {
            items: [{ path: 'catalog/price/scope', value: '1', scope: 'default' }],
        });
        const state = target.appBuilderComponents?.['erp-integration'];
        expect(state?.storePreparation?.steps['price-scope']).toStrictEqual({
            kind: 'config',
            previous: [{ path: 'catalog/price/scope', scope: 'default', stored: '0', effective: '0' }],
        });
        expect(state?.setupSteps?.['price-scope']).toMatchObject({ lastCheck: 'failed' });
        expect(saveProject).toHaveBeenCalledWith(target);
        expect(onStep).toHaveBeenCalledWith('Price scope: Applying');
    });

    it('says what Commerce refused, by step, and keeps what it took', async () => {
        mockOpenCommerce.mockResolvedValue(
            commerce({ errors: [{ path: 'catalog/price/scope', scope: 'default', message: 'not allowed' }] }),
        );

        const outcome = await prepareStoreOnAdd(project(), ENTRY, { ...ctx, saveProject: jest.fn() }, jest.fn());

        expect(outcome).toStrictEqual({
            status: 'prepared',
            warning: 'Commerce refused part of the store preparation: Price scope: catalog/price/scope at the default scope: 0 → 1: not allowed.',
        });
    });

    it('is failed, with the reason, when Commerce cannot be opened', async () => {
        mockOpenCommerce.mockResolvedValue({ refusal: 'Sign in to Adobe first.' });

        await expect(prepareStoreOnAdd(project(), ENTRY, { ...ctx, saveProject: jest.fn() }, jest.fn())).resolves.toStrictEqual({
            status: 'failed',
            detail: 'Sign in to Adobe first.',
        });
    });
});
