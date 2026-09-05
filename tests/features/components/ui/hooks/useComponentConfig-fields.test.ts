/**
 * useComponentConfig — reading and writing one field.
 *
 * `getFieldValue`, `updateField` and `normalizeUrlField` are what every config
 * input on the Connection screen is wired to, and none of them had a test. The
 * decisions here are small and consequential: which component a value is written
 * to, whether a user's deliberate clear survives a default, and whether typing a
 * PaaS URL still derives the GraphQL endpoint beside it.
 *
 * The write helpers (`writeToComponents`, `resolveWriteTargets`, `findFieldValue`)
 * are REAL. They are pure, and the thing worth asserting is the configs that come
 * out — a stub of them would let a write land on the wrong component unnoticed.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { mockRequest } from './useComponentConfig.testUtils';
import { settle } from '../../../../helpers/reactSettle';
import type { ComponentConfigs } from '@/types/webview';

jest.mock('@/features/components/services/envVarHelpers', () => ({
    deriveGraphqlEndpoint: (v: string) => `${v}/graphql`,
}));

/**
 * Two components declaring the same field, so a write's TARGET is observable.
 * `commerce` is the backend; `headless` is a frontend that declares it too.
 */
jest.mock('@/features/components/services/stackComponentCollector', () => ({
    collectStackComponents: () => [
        {
            id: 'commerce',
            data: {
                id: 'commerce',
                name: 'Commerce',
                configuration: {
                    requiredEnvVars: ['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_WEBSITE_CODE'],
                    optionalEnvVars: ['ADOBE_COMMERCE_GRAPHQL_ENDPOINT', 'NOTES'],
                },
            },
        },
        {
            id: 'headless',
            data: {
                id: 'headless',
                name: 'Headless',
                configuration: {
                    requiredEnvVars: ['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_WEBSITE_CODE'],
                    optionalEnvVars: [],
                },
            },
        },
    ],
}));

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getStackById: (id: string) => (id === 'stack' ? { id: 'stack', backend: 'commerce' } : undefined),
}));

const ENV_VARS = {
    ADOBE_COMMERCE_URL: {
        key: 'ADOBE_COMMERCE_URL',
        label: 'Commerce URL',
        type: 'url' as const,
        required: true,
        group: 'adobe-commerce',
    },
    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: {
        key: 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
        label: 'GraphQL Endpoint',
        type: 'text' as const,
        group: 'adobe-commerce',
    },
    // A backend-owned scope key: its write must land on the backend alone.
    ADOBE_COMMERCE_WEBSITE_CODE: {
        key: 'ADOBE_COMMERCE_WEBSITE_CODE',
        label: 'Website Code',
        type: 'text' as const,
        group: 'adobe-commerce',
    },
    NOTES: {
        key: 'NOTES',
        label: 'Notes',
        type: 'text' as const,
        default: 'from-the-registry',
        group: 'other',
    },
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
    mockRequest.mockResolvedValue({
        success: true,
        type: 'components-data',
        data: { frontends: [], backends: [], envVars: ENV_VARS },
    });
});

/** Mount the hook with the given stored configs and wait for the registry load. */
async function mount(componentConfigs: ComponentConfigs = {}) {
    const onConfigsChange = jest.fn();
    const view = renderHook(() =>
        useComponentConfig({
            selectedStack: 'stack',
            componentConfigs,
            onConfigsChange,
            onValidationChange: jest.fn(),
        }),
    );
    await waitFor(() => expect(view.result.current.serviceGroups.length).toBeGreaterThan(0));
    return { ...view, onConfigsChange };
}

/** The field descriptor the hook built for `key`, as the UI would hand it back. */
function fieldNamed(result: any, key: string) {
    for (const group of result.current.serviceGroups) {
        const found = group.fields.find((f: { key: string }) => f.key === key);
        if (found) return found;
    }
    throw new Error(`no field ${key} in ${JSON.stringify(
        result.current.serviceGroups.map((g: { id: string }) => g.id),
    )}`);
}

describe('getFieldValue', () => {
    it('returns a stored value from whichever declaring component holds one', async () => {
        const { result } = await mount({ headless: { ADOBE_COMMERCE_URL: 'https://b.example' } });

        expect(result.current.getFieldValue(fieldNamed(result, 'ADOBE_COMMERCE_URL'))).toBe(
            'https://b.example',
        );
    });

    it('prefers the first declaring component when two disagree', async () => {
        // Two copies disagreeing is a defect, not a feature — but the read must be
        // deterministic while one exists, or the form shows a different value per render.
        const { result } = await mount({
            commerce: { ADOBE_COMMERCE_URL: 'https://first.example' },
            headless: { ADOBE_COMMERCE_URL: 'https://second.example' },
        });

        expect(result.current.getFieldValue(fieldNamed(result, 'ADOBE_COMMERCE_URL'))).toBe(
            'https://first.example',
        );
    });

    it('skips an empty stored value and keeps looking', async () => {
        const { result } = await mount({
            commerce: { ADOBE_COMMERCE_URL: '' },
            headless: { ADOBE_COMMERCE_URL: 'https://second.example' },
        });

        expect(result.current.getFieldValue(fieldNamed(result, 'ADOBE_COMMERCE_URL'))).toBe(
            'https://second.example',
        );
    });

    it('stringifies a stored number, because an input reads strings', async () => {
        const { result } = await mount({ commerce: { NOTES: 42 } });

        expect(result.current.getFieldValue(fieldNamed(result, 'NOTES'))).toBe('42');
    });

    it("falls back to the registry default when nothing is stored", async () => {
        const { result } = await mount({});

        expect(result.current.getFieldValue(fieldNamed(result, 'NOTES'))).toBe('from-the-registry');
    });

    it('respects a deliberate clear over the default', async () => {
        // Touched and empty means the user removed it on purpose. Re-filling the
        // default here would make the field impossible to clear.
        const { result } = await mount({});
        const notes = fieldNamed(result, 'NOTES');

        await act(async () => {
            result.current.updateField(notes, '');
        });

        expect(result.current.getFieldValue(notes)).toBe('');
    });

    it('returns empty for an untouched field with no stored value and no default', async () => {
        const { result } = await mount({});

        expect(result.current.getFieldValue(fieldNamed(result, 'ADOBE_COMMERCE_URL'))).toBe('');
    });
});

describe('updateField', () => {
    it('writes an ordinary field to EVERY component that declares it', async () => {
        const { result } = await mount({});

        await act(async () => {
            result.current.updateField(
                fieldNamed(result, 'ADOBE_COMMERCE_URL'),
                'https://typed.example',
            );
        });

        expect(result.current.componentConfigs.commerce.ADOBE_COMMERCE_URL).toBe(
            'https://typed.example',
        );
        expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
            'https://typed.example',
        );
    });

    it('writes a backend-owned scope key to the BACKEND only', async () => {
        // Website/store scope is a project-level fact. A copy on the frontend is a
        // second source of truth that can disagree with the first.
        const { result } = await mount({});

        await act(async () => {
            result.current.updateField(fieldNamed(result, 'ADOBE_COMMERCE_WEBSITE_CODE'), 'base');
        });

        expect(result.current.componentConfigs.commerce.ADOBE_COMMERCE_WEBSITE_CODE).toBe('base');
        expect(
            result.current.componentConfigs.headless?.ADOBE_COMMERCE_WEBSITE_CODE,
        ).toBeUndefined();
    });

    it('derives the GraphQL endpoint alongside an untouched PaaS URL', async () => {
        const { result } = await mount({});

        await act(async () => {
            result.current.updateField(
                fieldNamed(result, 'ADOBE_COMMERCE_URL'),
                'https://typed.example',
            );
        });

        expect(result.current.componentConfigs.commerce.ADOBE_COMMERCE_GRAPHQL_ENDPOINT).toBe(
            'https://typed.example/graphql',
        );
    });

    it('leaves a GraphQL endpoint the user has already edited alone', async () => {
        const { result } = await mount({});

        await act(async () => {
            result.current.updateField(
                fieldNamed(result, 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT'),
                'https://hand-written.example/graphql',
            );
        });
        await act(async () => {
            result.current.updateField(
                fieldNamed(result, 'ADOBE_COMMERCE_URL'),
                'https://typed.example',
            );
        });

        expect(result.current.componentConfigs.commerce.ADOBE_COMMERCE_GRAPHQL_ENDPOINT).toBe(
            'https://hand-written.example/graphql',
        );
    });

    it('does not derive anything from a non-string value', async () => {
        const { result } = await mount({});

        await act(async () => {
            result.current.updateField(fieldNamed(result, 'ADOBE_COMMERCE_URL'), true);
        });

        expect(
            result.current.componentConfigs.commerce.ADOBE_COMMERCE_GRAPHQL_ENDPOINT,
        ).toBeUndefined();
    });

    it('marks the field touched', async () => {
        const { result } = await mount({});

        await act(async () => {
            result.current.updateField(fieldNamed(result, 'NOTES'), 'typed');
        });

        expect(result.current.touchedFields.has('NOTES')).toBe(true);
    });
});

describe('normalizeUrlField', () => {
    it('strips a trailing slash from a URL field on blur', async () => {
        const { result } = await mount({
            commerce: { ADOBE_COMMERCE_URL: 'https://example.com/' },
            headless: { ADOBE_COMMERCE_URL: 'https://example.com/' },
        });

        await act(async () => {
            result.current.normalizeUrlField(fieldNamed(result, 'ADOBE_COMMERCE_URL'));
        });

        expect(result.current.componentConfigs.commerce.ADOBE_COMMERCE_URL).toBe(
            'https://example.com',
        );
    });

    it('leaves an already-normal URL untouched', async () => {
        const configs = { commerce: { ADOBE_COMMERCE_URL: 'https://example.com' } };
        const { result } = await mount(configs);
        const before = result.current.componentConfigs;

        await act(async () => {
            result.current.normalizeUrlField(fieldNamed(result, 'ADOBE_COMMERCE_URL'));
        });

        // Same object: no write happened, so no render cascade either.
        expect(result.current.componentConfigs).toBe(before);
    });

    it('does nothing for a field that is not a URL', async () => {
        const { result } = await mount({ commerce: { NOTES: 'trailing/' } });

        await act(async () => {
            result.current.normalizeUrlField(fieldNamed(result, 'NOTES'));
        });

        expect(result.current.componentConfigs.commerce.NOTES).toBe('trailing/');
    });

    it('does nothing when the URL field is empty', async () => {
        const { result } = await mount({ commerce: { ADOBE_COMMERCE_URL: '' } });
        const before = result.current.componentConfigs;

        await act(async () => {
            result.current.normalizeUrlField(fieldNamed(result, 'ADOBE_COMMERCE_URL'));
        });

        expect(result.current.componentConfigs).toBe(before);
        await settle();
    });
});
