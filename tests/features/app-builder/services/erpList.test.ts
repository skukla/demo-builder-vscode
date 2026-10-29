/**
 * erpList — the ERP list as Demo Builder keeps it (AB-16): the next added ERP's id, whether a
 * name is free, the list the integration is sent, and one ERP's key map rows merged into the
 * whole map. The catalog entries are the REAL bundled ones, so a `listedAs` change shows here.
 *
 * The list shape is the integration's `erp/erps` PUT (`commerce-erp-integration`,
 * `actions/erp/erps/index.js`): `{ id, name, adapter, connection: { baseUrl }, settings? }`.
 */

import {
    erpListFor,
    erpsWithOwnCredential,
    mergeKeyMap,
    nextListedSystemId,
    takenSystemNames,
} from '@/features/app-builder/services/erpList';
import { erpNameProblem } from '@/features/app-builder/services/pairNames';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentState } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const catalog = getAppBuilderComponentCatalog();
const DEMO_ERP = catalog.find((entry) => entry.id === 'demo-erp')!;

const web = (pkg: string) => ({
    [`runtime/${pkg}/health`]: `https://ns.adobeioruntime.net/api/v1/web/${pkg}/health`,
});

function erp(extra: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return {
        kind: 'system',
        status: 'deployed',
        usedBy: 'erp-integration',
        deployedUrls: web('demo-erp'),
        source: { owner: 'skukla', repo: 'x' },
        ...extra,
    };
}

function project(components: Record<string, AppBuilderComponentState>) {
    return createMockProject({ appBuilderComponents: components });
}

const INTEGRATION: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    systems: ['demo-erp', 'demo-erp-2'],
    source: { owner: 'skukla', repo: 'x' },
};

describe('nextListedSystemId', () => {
    it('numbers from 2', () => {
        expect(nextListedSystemId(project({ 'demo-erp': erp() }), DEMO_ERP)).toBe('demo-erp-2');
    });

    it('skips a number an ERP already holds, and one a legacy numbered integration holds', () => {
        const components = {
            'demo-erp-2': erp(),
            // A legacy pair's integration: demo-erp-3 would read as its own ERP.
            'erp-integration-3': {
                kind: 'integration' as const,
                status: 'deployed' as const,
                source: { owner: 'skukla', repo: 'x' },
            },
        };
        expect(nextListedSystemId(project(components), DEMO_ERP)).toBe('demo-erp-4');
    });

    it('reuses the number of an ERP whose add failed, so adding again retries it', () => {
        expect(
            nextListedSystemId(project({ 'demo-erp-2': erp({ status: 'error' }) }), DEMO_ERP)
        ).toBe('demo-erp-2');
    });
});

// The project half of the check: which names are taken (takenSystemNames), handed to the
// one name check the dialog and the extension share (erpNameProblem).
describe('erpNameProblem over takenSystemNames', () => {
    const taken = project({ 'demo-erp': erp({ name: 'Acme ERP' }) });

    it('accepts a free name', () => {
        expect(erpNameProblem('Brand B ERP', takenSystemNames(taken))).toBeUndefined();
    });

    it('refuses a blank name, and one that is too long', () => {
        expect(erpNameProblem('  ', takenSystemNames(taken))).toBe('Name the ERP, e.g. "Brand B ERP".');
        expect(erpNameProblem('x'.repeat(41), takenSystemNames(taken))).toBe('An ERP name is at most 40 characters.');
    });

    it('refuses a name already in the project, without case', () => {
        expect(erpNameProblem('acme erp', takenSystemNames(taken))).toBe(
            'An ERP named "acme erp" is already in this project. Pick another name.'
        );
    });

    it("does not count the retried ERP's own name", () => {
        expect(erpNameProblem('Acme ERP', takenSystemNames(taken, 'demo-erp'))).toBeUndefined();
    });

    it("counts only systems' names", () => {
        const withIntegration = project({ 'erp-integration': { ...erp({ name: 'Acme ERP' }), kind: 'integration' } });
        expect(takenSystemNames(withIntegration)).toStrictEqual([]);
    });
});

describe('erpListFor', () => {
    it("lists each ERP by the id its name derives, with each address", () => {
        const p = project({
            'erp-integration': INTEGRATION,
            'demo-erp': erp({ name: 'Acme ERP' }),
            'demo-erp-2': erp({
                name: 'Brand B ERP',
                catalogId: 'demo-erp',
                deployedUrls: web('demo-erp-2'),
            }),
        });

        expect(erpListFor(p, 'erp-integration', catalog, [])).toEqual([
            {
                id: 'acme',
                name: 'Acme ERP',
                adapter: 'demo-erp',
                connection: { baseUrl: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp' },
            },
            {
                id: 'brand-b',
                name: 'Brand B ERP',
                adapter: 'demo-erp',
                connection: { baseUrl: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp-2' },
            },
        ]);
    });

    it('keeps the settings each ERP holds in the list now, since a PUT replaces it whole', () => {
        const p = project({
            'erp-integration': INTEGRATION,
            'demo-erp': erp({ name: 'Acme ERP' }),
        });
        const settings = { defaults: { salesOrg: '1000' } };
        const current = [
            {
                id: 'acme',
                name: 'Acme ERP',
                adapter: 'demo-erp',
                connection: { baseUrl: null },
                settings,
            },
        ];

        expect(erpListFor(p, 'erp-integration', catalog, current)[0].settings).toBe(settings);
    });

    it('leaves out the ERP being removed, and one not deployed', () => {
        const p = project({
            'erp-integration': {
                ...INTEGRATION,
                systems: ['demo-erp', 'demo-erp-2', 'demo-erp-3'],
            },
            'demo-erp': erp({ name: 'Acme ERP' }),
            'demo-erp-2': erp({ name: 'Brand B ERP', catalogId: 'demo-erp' }),
            'demo-erp-3': erp({ name: 'Brand C ERP', catalogId: 'demo-erp', status: 'error' }),
        });

        expect(
            erpListFor(p, 'erp-integration', catalog, [], 'demo-erp-2').map((entry) => entry.id)
        ).toEqual(['acme']);
    });
});

// AB-16a: an ERP in a workspace of its own answers only its own workspace's credential, so
// the integration is handed it with the list. The first ERP shares the integration's.
describe('the ERP credentials the list carries', () => {
    const CONTOSO_WS = { id: 'ws-contoso', name: 'ContosoERP' };
    const AUTH = {
        clientId: 'fake-client',
        clientSecret: 'fake-test-pw-not-a-secret',
        orgId: 'FAKE@AdobeOrg',
        scopes: ['AdobeID'],
    };
    const p = project({
        'erp-integration': INTEGRATION,
        'demo-erp': erp({ name: 'Acme ERP' }),
        'demo-erp-2': erp({
            name: 'Contoso ERP',
            catalogId: 'demo-erp',
            deployedUrls: web('demo-erp-2'),
            workspace: CONTOSO_WS,
        }),
    });

    it('names each added ERP that needs its own credential, with its workspace, and not the first', () => {
        expect(erpsWithOwnCredential(p, 'erp-integration', catalog)).toStrictEqual([
            { componentId: 'demo-erp-2', name: 'Contoso ERP', workspace: CONTOSO_WS },
        ]);
    });

    it('names none for an ERP being removed', () => {
        expect(erpsWithOwnCredential(p, 'erp-integration', catalog, 'demo-erp-2')).toStrictEqual(
            []
        );
    });

    it("puts the credential on the added ERP's connection and never on the first ERP's", () => {
        const auths = { 'demo-erp-2': AUTH, 'demo-erp': AUTH };

        const [first, added] = erpListFor(p, 'erp-integration', catalog, [], undefined, auths);

        expect(first.connection).toStrictEqual({
            baseUrl: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp',
        });
        expect(added.connection).toStrictEqual({
            baseUrl: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp-2',
            auth: AUTH,
        });
    });

    it('sends no auth key for an added ERP whose credential was not read, so the integration keeps its own', () => {
        const [, added] = erpListFor(p, 'erp-integration', catalog, []);

        expect(added.connection).not.toHaveProperty('auth');
    });
});

describe('mergeKeyMap', () => {
    const FIRST = { kind: 'customer' as const, commerce: '1', erp: 'C1' };
    const SECOND = { kind: 'customer' as const, commerce: '1', erp: 'B1', erpId: 'demo-erp-2' };

    it("replaces only the filled ERP's rows, and keeps a row that names no ERP", () => {
        // A row naming no ERP belongs to no listed ERP (every fill names one, AB-51): it
        // is neither replaced nor claimed.
        const merged = mergeKeyMap([FIRST, SECOND], 'demo-erp-2', [
            { kind: 'customer', commerce: '2', erp: 'B2' },
        ]);

        expect(merged).toEqual([
            FIRST,
            { kind: 'customer', commerce: '2', erp: 'B2', erpId: 'demo-erp-2' },
        ]);
    });

    it("replaces another ERP's rows by its id, and stamps the new rows with it", () => {
        const merged = mergeKeyMap([FIRST, SECOND], 'northwind', [
            { kind: 'customer', commerce: '3', erp: 'C3' },
        ]);

        expect(merged).toEqual([
            FIRST,
            SECOND,
            { kind: 'customer', commerce: '3', erp: 'C3', erpId: 'northwind' },
        ]);
    });
});
