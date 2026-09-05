/**
 * useComponentConfig — assembling the form, and failing to.
 *
 * Which fields appear on the Connection screen, in which group, in which order,
 * is decided entirely inside this hook's `serviceGroups` memo, and nothing tested
 * it. Nor did anything test what happens when the registry request fails, which
 * is the path that emptied two whole screens on 2026-09-02.
 *
 * `collectStackComponents` is stubbed per-describe so the INPUT to the memo is
 * exactly what each case is about; everything the memo then does — the
 * MESH_ENDPOINT filter, the dedupe, the backend-specific service walk, the group
 * bucketing and the order — is real.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { mockRequest } from './useComponentConfig.testUtils';

/**
 * The hook logs the registry failure through webviewLogger, whose `error` writes
 * to console regardless of NODE_ENV — and the console gate fails any suite that
 * prints. The three failure tests below EXPECT that log, so absorb it here rather
 * than widen the allowlist ledger.
 */
jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: () => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

const mockCollect = jest.fn();
jest.mock('@/features/components/services/stackComponentCollector', () => ({
    collectStackComponents: (...args: unknown[]) => mockCollect(...args),
}));

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getStackById: (id: string) =>
        id === 'stack' ? { id: 'stack', backend: 'commerce' } : undefined,
}));

const ENV_VARS = {
    ADOBE_COMMERCE_URL: { key: 'ADOBE_COMMERCE_URL', label: 'URL', type: 'text', group: 'adobe-commerce' },
    MESH_ENDPOINT: { key: 'MESH_ENDPOINT', label: 'Mesh', type: 'text', group: 'mesh' },
    ACCS_STORE_CODE: { key: 'ACCS_STORE_CODE', label: 'Store', type: 'text', group: 'accs' },
    CATALOG_API_KEY: { key: 'CATALOG_API_KEY', label: 'Key', type: 'text', group: 'catalog-service' },
    UNGROUPED: { key: 'UNGROUPED', label: 'Ungrouped', type: 'text' },
    SAAS_ONLY: { key: 'SAAS_ONLY', label: 'SaaS only', type: 'text', group: 'accs' },
    SHARED_SERVICE_VAR: { key: 'SHARED_SERVICE_VAR', label: 'Shared', type: 'text', group: 'accs' },
};

const SERVICES = {
    catalog: {
        id: 'catalog',
        backendSpecific: true,
        requiredEnvVarsByBackend: { commerce: ['SAAS_ONLY'], other: ['UNGROUPED'] },
    },
    plain: { id: 'plain', requiredEnvVars: ['SHARED_SERVICE_VAR'] },
    empty: { id: 'empty' },
};

let useComponentConfig: any;
let resetComponentRegistryCache: () => void;

beforeAll(async () => {
    const mod = await import('@/features/components/ui/hooks/useComponentConfig');
    useComponentConfig = mod.useComponentConfig;
    resetComponentRegistryCache = mod.resetComponentRegistryCache;
});

beforeEach(() => {
    resetComponentRegistryCache();
    jest.clearAllMocks();
    mockCollect.mockReturnValue([]);
    mockRequest.mockResolvedValue({
        success: true,
        type: 'components-data',
        data: { frontends: [], backends: [], envVars: ENV_VARS, services: SERVICES },
    });
});

/** One component declaring the given configuration. */
function component(id: string, configuration: Record<string, unknown>) {
    return { id, data: { id, name: id, configuration } };
}

async function groupsFor(components: unknown[], selectedStack = 'stack') {
    mockCollect.mockReturnValue(components);
    const { result } = renderHook(() =>
        useComponentConfig({
            selectedStack,
            componentConfigs: {},
            onConfigsChange: jest.fn(),
            onValidationChange: jest.fn(),
        }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    return result;
}

describe('which fields reach the form', () => {
    it('drops MESH_ENDPOINT — it is auto-configured after mesh deployment', async () => {
        const result = await groupsFor([
            component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL', 'MESH_ENDPOINT'] }),
        ]);

        const keys = result.current.serviceGroups.flatMap((g: { fields: { key: string }[] }) =>
            g.fields.map((f) => f.key),
        );
        expect(keys).toEqual(['ADOBE_COMMERCE_URL']);
    });

    it('drops an env var the registry does not define', async () => {
        const result = await groupsFor([
            component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL', 'NOT_IN_REGISTRY'] }),
        ]);

        const keys = result.current.serviceGroups.flatMap((g: { fields: { key: string }[] }) =>
            g.fields.map((f) => f.key),
        );
        expect(keys).toEqual(['ADOBE_COMMERCE_URL']);
    });

    it('takes optional env vars as well as required ones', async () => {
        const result = await groupsFor([
            component('a', {
                requiredEnvVars: ['ADOBE_COMMERCE_URL'],
                optionalEnvVars: ['UNGROUPED'],
            }),
        ]);

        const keys = result.current.serviceGroups.flatMap((g: { fields: { key: string }[] }) =>
            g.fields.map((f) => f.key),
        );
        expect(keys).toEqual(expect.arrayContaining(['ADOBE_COMMERCE_URL', 'UNGROUPED']));
    });

    it('lists one field ONCE, naming every component that declares it', async () => {
        // The field is rendered once and its value fans out to all of them, so a
        // duplicate row would let the user set the same fact twice.
        const result = await groupsFor([
            component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] }),
            component('b', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] }),
        ]);

        const fields = result.current.serviceGroups.flatMap(
            (g: { fields: { key: string; componentIds: string[] }[] }) => g.fields,
        );
        expect(fields).toHaveLength(1);
        expect(fields[0].componentIds).toEqual(['a', 'b']);
    });

    it('does not repeat a component that declares the field twice', async () => {
        const result = await groupsFor([
            component('a', {
                requiredEnvVars: ['ADOBE_COMMERCE_URL'],
                optionalEnvVars: ['ADOBE_COMMERCE_URL'],
            }),
        ]);

        const fields = result.current.serviceGroups.flatMap(
            (g: { fields: { componentIds: string[] }[] }) => g.fields,
        );
        expect(fields[0].componentIds).toEqual(['a']);
    });
});

describe('service-declared env vars', () => {
    it('takes the vars a backend-specific service declares FOR THIS BACKEND', async () => {
        const result = await groupsFor([
            component('a', { requiredServices: ['catalog'] }),
        ]);

        const keys = result.current.serviceGroups.flatMap((g: { fields: { key: string }[] }) =>
            g.fields.map((f) => f.key),
        );
        // 'commerce' is this stack's backend; the 'other' entry must not appear.
        expect(keys).toEqual(['SAAS_ONLY']);
    });

    it('takes nothing when a backend-specific service has no entry for this backend', async () => {
        mockRequest.mockResolvedValue({
            success: true,
            type: 'components-data',
            data: {
                frontends: [],
                backends: [],
                envVars: ENV_VARS,
                services: {
                    catalog: {
                        id: 'catalog',
                        backendSpecific: true,
                        requiredEnvVarsByBackend: { somethingElse: ['SAAS_ONLY'] },
                    },
                },
            },
        });

        const result = await groupsFor([component('a', { requiredServices: ['catalog'] })]);

        expect(result.current.serviceGroups).toEqual([]);
    });

    it('takes a plain service requiredEnvVars when it is not backend-specific', async () => {
        const result = await groupsFor([component('a', { requiredServices: ['plain'] })]);

        const keys = result.current.serviceGroups.flatMap((g: { fields: { key: string }[] }) =>
            g.fields.map((f) => f.key),
        );
        expect(keys).toEqual(['SHARED_SERVICE_VAR']);
    });

    it('survives a service that declares no env vars at all', async () => {
        const result = await groupsFor([component('a', { requiredServices: ['empty'] })]);

        expect(result.current.serviceGroups).toEqual([]);
    });

    it('survives a requiredServices entry the registry has no service for', async () => {
        const result = await groupsFor([component('a', { requiredServices: ['ghost'] })]);

        expect(result.current.serviceGroups).toEqual([]);
    });

    it('skips the service walk entirely when the stack names no backend', async () => {
        // getStackById returns undefined for an unknown stack, so stack?.backend is
        // absent and there is no backend to resolve service vars against.
        const result = await groupsFor([component('a', { requiredServices: ['plain'] })], 'unknown');

        expect(result.current.serviceGroups).toEqual([]);
    });
});

describe('components with no configuration block', () => {
    it('survives a component that declares no configuration at all', async () => {
        const result = await groupsFor([
            { id: 'bare', data: { id: 'bare', name: 'bare' } },
            component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] }),
        ]);

        const keys = result.current.serviceGroups.flatMap((g: { fields: { key: string }[] }) =>
            g.fields.map((f) => f.key),
        );
        expect(keys).toEqual(['ADOBE_COMMERCE_URL']);
    });

    it('survives a configuration that lists neither required nor optional env vars', async () => {
        const result = await groupsFor([
            component('bare', {}),
            component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] }),
        ]);

        const keys = result.current.serviceGroups.flatMap((g: { fields: { key: string }[] }) =>
            g.fields.map((f) => f.key),
        );
        expect(keys).toEqual(['ADOBE_COMMERCE_URL']);
    });
});

describe('recomputing when the stack changes', () => {
    it('rebuilds the groups for the newly selected stack', async () => {
        mockCollect.mockReturnValue([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);
        const { result, rerender } = renderHook(
            ({ stack }) =>
                useComponentConfig({
                    selectedStack: stack,
                    componentConfigs: {},
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            { initialProps: { stack: 'stack' } },
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.serviceGroups.map((g: { id: string }) => g.id)).toEqual([
            'adobe-commerce',
        ]);

        mockCollect.mockReturnValue([component('b', { requiredEnvVars: ['ACCS_STORE_CODE'] })]);
        rerender({ stack: 'other-stack' });

        await waitFor(() =>
            expect(result.current.serviceGroups.map((g: { id: string }) => g.id)).toEqual(['accs']),
        );
    });
});

describe('grouping and order', () => {
    it('files a field with no declared group under Additional Settings', async () => {
        const result = await groupsFor([component('a', { requiredEnvVars: ['UNGROUPED'] })]);

        expect(result.current.serviceGroups.map((g: { id: string }) => g.id)).toEqual(['other']);
    });

    it('drops a group that ended up with no fields', async () => {
        const result = await groupsFor([component('a', { requiredEnvVars: ['ACCS_STORE_CODE'] })]);

        // Eight groups are defined; only the one holding a field is returned.
        expect(result.current.serviceGroups.map((g: { id: string }) => g.id)).toEqual(['accs']);
    });

    it('orders the groups by their declared order, not by discovery', async () => {
        // Declared in reverse: 'other' (99) is found first, 'accs' (1) last.
        const result = await groupsFor([
            component('a', {
                requiredEnvVars: ['UNGROUPED', 'CATALOG_API_KEY', 'ADOBE_COMMERCE_URL', 'ACCS_STORE_CODE'],
            }),
        ]);

        expect(result.current.serviceGroups.map((g: { id: string }) => g.id)).toEqual([
            'accs',
            'adobe-commerce',
            'catalog-service',
            'other',
        ]);
    });
});

describe('loading the registry', () => {
    it('reports an error instead of an empty form when the request fails', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'handler exploded' });

        const result = await groupsFor([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);

        // A failed response carries no `data`. Storing that undefined is what
        // emptied the Connection view on 2026-09-02.
        expect(result.current.loadError).toBe(
            'Failed to load component configuration. Please try again.',
        );
        expect(result.current.isLoading).toBe(false);
    });

    it('reports an error when the request itself rejects', async () => {
        mockRequest.mockRejectedValue(new Error('channel closed'));

        const result = await groupsFor([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);

        expect(result.current.loadError).toBe(
            'Failed to load component configuration. Please try again.',
        );
    });

    it('lets a later mount retry after a failure — one failure does not poison the cache', async () => {
        mockRequest.mockRejectedValueOnce(new Error('channel closed'));
        await groupsFor([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);

        const second = await groupsFor([
            component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] }),
        ]);

        expect(second.current.loadError).toBeNull();
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('fetches ONCE across two mounts, and the second never shows a loader', async () => {
        await groupsFor([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);

        mockCollect.mockReturnValue([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);
        const { result } = renderHook(() =>
            useComponentConfig({
                selectedStack: 'stack',
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            }),
        );

        // Seeded from the module cache: no loading flash on a remount, which is
        // what stepping between Commerce sub-steps does on every change.
        expect(result.current.isLoading).toBe(false);
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });
});

describe('configs arriving from props after the first render', () => {
    it('adopts them, and keeps an edit made before they landed', async () => {
        mockCollect.mockReturnValue([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);
        const { result, rerender } = renderHook(
            ({ configs }) =>
                useComponentConfig({
                    selectedStack: 'stack',
                    componentConfigs: configs,
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            // Empty to start: the sync effect only fires for a NON-empty prop, so
            // this is the state in which a user can edit before configs arrive.
            { initialProps: { configs: {} as Record<string, unknown> } },
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const field = result.current.serviceGroups[0].fields[0];
        await act(async () => {
            result.current.updateField(field, 'https://typed-before-import');
        });

        rerender({ configs: { imported: { ADOBE_COMMERCE_URL: 'https://from-props' } } });

        await waitFor(() =>
            expect(result.current.componentConfigs.imported).toEqual({
                ADOBE_COMMERCE_URL: 'https://from-props',
            }),
        );
        // The edit made before the import survives the merge. (The linked GraphQL
        // endpoint rides along, which is updateField's business, not the merge's.)
        expect(result.current.componentConfigs.a).toMatchObject({
            ADOBE_COMMERCE_URL: 'https://typed-before-import',
        });
    });

    it('lets the INCOMING value win on a key both sides hold', async () => {
        mockCollect.mockReturnValue([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);
        const { result, rerender } = renderHook(
            ({ configs }) =>
                useComponentConfig({
                    selectedStack: 'stack',
                    componentConfigs: configs,
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            { initialProps: { configs: {} as Record<string, unknown> } },
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const field = result.current.serviceGroups[0].fields[0];
        await act(async () => {
            result.current.updateField(field, 'https://local-edit');
        });

        // Same component id on both sides. The merge keeps keys prev holds ALONE;
        // where they collide the import is the newer fact and must win.
        rerender({ configs: { a: { ADOBE_COMMERCE_URL: 'https://from-props' } } });

        await waitFor(() =>
            expect(result.current.componentConfigs.a.ADOBE_COMMERCE_URL).toBe(
                'https://from-props',
            ),
        );
    });

    it('adopts props only ONCE, so a later prop change cannot stomp an edit', async () => {
        mockCollect.mockReturnValue([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);
        const { result, rerender } = renderHook(
            ({ configs }) =>
                useComponentConfig({
                    selectedStack: 'stack',
                    componentConfigs: configs,
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            { initialProps: { configs: { first: { A: '1' } } as Record<string, unknown> } },
        );
        await waitFor(() => expect(result.current.componentConfigs.first).toBeDefined());

        rerender({ configs: { second: { B: '2' } } });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.componentConfigs.second).toBeUndefined();
    });

    it('ignores an EMPTY configs prop rather than treating it as initialised', async () => {
        mockCollect.mockReturnValue([component('a', { requiredEnvVars: ['ADOBE_COMMERCE_URL'] })]);
        const { result, rerender } = renderHook(
            ({ configs }) =>
                useComponentConfig({
                    selectedStack: 'stack',
                    componentConfigs: configs,
                    onConfigsChange: jest.fn(),
                    onValidationChange: jest.fn(),
                }),
            { initialProps: { configs: {} as Record<string, unknown> } },
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // Configs that arrive LATE are the whole reason this effect exists.
        rerender({ configs: { late: { A: '1' } } });

        await waitFor(() => expect(result.current.componentConfigs.late).toEqual({ A: '1' }));
    });
});
