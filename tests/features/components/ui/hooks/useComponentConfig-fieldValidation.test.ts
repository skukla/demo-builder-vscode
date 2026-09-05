/**
 * useComponentConfig — the errors it reports, and the loads it abandons.
 *
 * The sibling `-validation` suite covers ONE question: does a required field with
 * a falsy-but-present value read as present. This one covers the rest of the
 * validation effect — URL format, regex patterns, the message a pattern falls
 * back to — plus the two paths a mounted-then-unmounted hook takes when its
 * registry request lands after it is gone.
 *
 * The real `Validator` is used. Its verdicts ARE the behaviour under test; a stub
 * would only assert that the hook forwards whatever it is handed.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { mockRequest } from './useComponentConfig.testUtils';

jest.mock('@/core/ui/utils/webviewLogger', () => ({
    // The canonical builder, read lazily: this factory is hoisted above any
    // module-scope const, so an eager require would run before the import graph
    // is ready.
    webviewLogger: () => {
        return require('../../../../helpers/loggerFake').createMockLogger();
    },
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
    SITE_URL: { key: 'SITE_URL', label: 'Site URL', type: 'url', group: 'other' },
    STORE_CODE: {
        key: 'STORE_CODE',
        label: 'Store code',
        type: 'text',
        group: 'other',
        validation: { pattern: '^[a-z_]+$', message: 'lowercase and underscores only' },
    },
    TICKET: {
        key: 'TICKET',
        label: 'Ticket',
        type: 'text',
        group: 'other',
        // No message: the hook supplies its own fallback.
        validation: { pattern: '^[0-9]+$' },
    },
    COUNT: { key: 'COUNT', label: 'Count', type: 'text', default: 7, group: 'other' },
    BLANK_DEFAULT: { key: 'BLANK_DEFAULT', label: 'Blank', type: 'text', default: '', group: 'other' },
    // EnvVarDefinition allows a boolean default, and ConfigFieldRenderer has a
    // live `case 'boolean'`. Stringifying one would render the text "true".
    FLAG: { key: 'FLAG', label: 'Flag', type: 'boolean', default: true, group: 'other' },
};

const COMPONENT = {
    id: 'commerce',
    data: {
        id: 'commerce',
        name: 'Commerce',
        configuration: {
            requiredEnvVars: [],
            optionalEnvVars: [
                'SITE_URL',
                'STORE_CODE',
                'TICKET',
                'COUNT',
                'BLANK_DEFAULT',
                'FLAG',
            ],
        },
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
    mockCollect.mockReturnValue([COMPONENT]);
    mockRequest.mockResolvedValue({
        success: true,
        type: 'components-data',
        data: { frontends: [], backends: [], envVars: ENV_VARS },
    });
});

/** Mount with stored values on the one component, and report validity + errors. */
async function mountWith(stored: Record<string, unknown>) {
    const onValidationChange = jest.fn();
    const view = renderHook(() =>
        useComponentConfig({
            selectedStack: 'stack',
            componentConfigs: { commerce: stored },
            onConfigsChange: jest.fn(),
            onValidationChange,
        }),
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    await waitFor(() => expect(onValidationChange).toHaveBeenCalled());
    const lastValid = () =>
        onValidationChange.mock.calls[onValidationChange.mock.calls.length - 1][0];
    return { ...view, lastValid };
}

function fieldNamed(result: any, key: string) {
    for (const group of result.current.serviceGroups) {
        const found = group.fields.find((f: { key: string }) => f.key === key);
        if (found) return found;
    }
    throw new Error(`no field ${key}`);
}

describe('URL validation', () => {
    it('rejects a value that is not a URL and blocks Continue', async () => {
        const { result, lastValid } = await mountWith({ SITE_URL: 'not a url' });

        expect(result.current.validationErrors.SITE_URL).toBeDefined();
        expect(lastValid()).toBe(false);
    });

    it('accepts a well-formed URL', async () => {
        const { result, lastValid } = await mountWith({ SITE_URL: 'https://example.com' });

        expect(result.current.validationErrors.SITE_URL).toBeUndefined();
        expect(lastValid()).toBe(true);
    });

    it('does not URL-check a NON-string value', async () => {
        // ConfigFieldRenderer's boolean case writes real booleans. A boolean has
        // no URL to fail, and running the string validator on one would report an
        // error the user cannot clear.
        const { result, lastValid } = await mountWith({ SITE_URL: true });

        expect(result.current.validationErrors.SITE_URL).toBeUndefined();
        expect(lastValid()).toBe(true);
    });

    it('does not URL-check a field of another type', async () => {
        // Passes STORE_CODE's own pattern, so any error here would be the URL
        // validator running on a field that is not a URL.
        const { result } = await mountWith({ STORE_CODE: 'not_a_url' });

        expect(result.current.validationErrors.STORE_CODE).toBeUndefined();
    });
});

describe('pattern validation', () => {
    it("reports the field's own message when the value does not match", async () => {
        const { result, lastValid } = await mountWith({ STORE_CODE: 'HasCapitals' });

        expect(result.current.validationErrors.STORE_CODE).toBe(
            'lowercase and underscores only',
        );
        expect(lastValid()).toBe(false);
    });

    it('falls back to a generic message when the field declares none', async () => {
        const { result } = await mountWith({ TICKET: 'abc' });

        expect(result.current.validationErrors.TICKET).toBe('Invalid format');
    });

    it('accepts a matching value', async () => {
        const { result, lastValid } = await mountWith({ STORE_CODE: 'base_store' });

        expect(result.current.validationErrors.STORE_CODE).toBeUndefined();
        expect(lastValid()).toBe(true);
    });

    it('leaves a field with no pattern alone', async () => {
        const { result } = await mountWith({ COUNT: 'anything at all' });

        expect(result.current.validationErrors.COUNT).toBeUndefined();
    });

    it('clears the error once the value is corrected', async () => {
        const { result } = await mountWith({ STORE_CODE: 'HasCapitals' });

        await act(async () => {
            result.current.updateField(fieldNamed(result, 'STORE_CODE'), 'base_store');
        });

        expect(result.current.validationErrors.STORE_CODE).toBeUndefined();
    });
});

describe('defaults on read', () => {
    it('stringifies a NUMERIC registry default', async () => {
        const { result } = await mountWith({});

        expect(result.current.getFieldValue(fieldNamed(result, 'COUNT'))).toBe('7');
    });

    it('treats an EMPTY-STRING default as no default at all', async () => {
        const { result } = await mountWith({});

        expect(result.current.getFieldValue(fieldNamed(result, 'BLANK_DEFAULT'))).toBe('');
    });

    it('does not write an empty-string default into the configs', async () => {
        // applyFieldDefaults skips undefined and '' — a blank default that got
        // written would mark the field as answered when nobody answered it.
        const { result } = await mountWith({});

        expect(result.current.componentConfigs.commerce?.BLANK_DEFAULT).toBeUndefined();
    });

    it('writes a non-blank default into the configs', async () => {
        const { result } = await mountWith({});

        expect(result.current.componentConfigs.commerce.COUNT).toBe(7);
    });

    it('does not overwrite a stored value with the default', async () => {
        const { result } = await mountWith({ COUNT: 3 });

        expect(result.current.componentConfigs.commerce.COUNT).toBe(3);
    });
});

describe('reading a field DURING the render that first has fields', () => {
    /**
     * ConfigFieldRenderer calls `getFieldValue` while rendering, and on the render
     * where `serviceGroups` first becomes non-empty the defaults effect has not
     * committed yet — so nothing is stored and the default branch is the one that
     * runs. Reading only after the effect settles never reaches it, which is why
     * these three lines had no coverage while the hook's defaults visibly worked.
     */
    async function valuesDuringFirstRender(key: string): Promise<unknown[]> {
        const seen: unknown[] = [];
        const { result } = renderHook(() => {
            const hook = useComponentConfig({
                selectedStack: 'stack',
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            });
            const field = hook.serviceGroups
                .flatMap((g: { fields: { key: string }[] }) => g.fields)
                .find((f: { key: string }) => f.key === key);
            if (field) seen.push(hook.getFieldValue(field));
            return hook;
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        return seen;
    }

    it('shows a NUMERIC default as a string before anything is stored', async () => {
        const seen = await valuesDuringFirstRender('COUNT');

        expect(seen[0]).toBe('7');
    });

    it('shows empty for a blank default before anything is stored', async () => {
        const seen = await valuesDuringFirstRender('BLANK_DEFAULT');

        expect(seen[0]).toBe('');
    });

    it('shows a BOOLEAN default as a boolean, not as the text "true"', async () => {
        const seen = await valuesDuringFirstRender('FLAG');

        expect(seen[0]).toBe(true);
    });

    it('shows empty for a field with no default at all', async () => {
        const seen = await valuesDuringFirstRender('SITE_URL');

        expect(seen[0]).toBe('');
    });
});

describe('a stored value that is not a string', () => {
    it('returns a boolean AS a boolean — a checkbox is not the text "false"', async () => {
        const { result } = await mountWith({ SITE_URL: false });

        expect(result.current.getFieldValue(fieldNamed(result, 'SITE_URL'))).toBe(false);
    });
});

describe('fields with no default are not written at all', () => {
    it('leaves a field with neither a default nor a package default out of the configs', async () => {
        const { result } = await mountWith({});

        // Writing `{ SITE_URL: undefined }` would put the key in the object, which
        // reads to every later consumer as "this field has been dealt with".
        expect(Object.keys(result.current.componentConfigs.commerce ?? {})).not.toContain(
            'SITE_URL',
        );
    });

    it('does not re-apply a default over a stored FALSE', async () => {
        // An unticked checkbox is an answer. Re-applying the default over it
        // re-ticks the box on every mount and the user cannot make it stick.
        const { result } = await mountWith({ FLAG: false });

        expect(result.current.componentConfigs.commerce.FLAG).toBe(false);
    });

    it('does not re-apply a default over a stored ZERO', async () => {
        const { result } = await mountWith({ COUNT: 0 });

        expect(result.current.componentConfigs.commerce.COUNT).toBe(0);
    });

    it('still fills a field holding an EMPTY STRING (the control)', async () => {
        const { result } = await mountWith({ COUNT: '' });

        expect(result.current.componentConfigs.commerce.COUNT).toBe(7);
    });

    it('does not rewrite configs when every default is already stored', async () => {
        // Every field carrying a default already has a value, so the pass has
        // nothing to write.
        const stored = { COUNT: 7, FLAG: false };
        const { result } = await mountWith(stored);

        // Same object back: the defaults pass found nothing to do, so no render
        // cascade and no spurious onConfigsChange with a fresh reference.
        expect(result.current.componentConfigs.commerce).toBe(stored);
    });
});

describe('normalizeUrlField on a non-string value', () => {
    it('does nothing when the stored value is not a string', async () => {
        const { result } = await mountWith({ SITE_URL: true });
        const before = result.current.componentConfigs;

        await act(async () => {
            result.current.normalizeUrlField(fieldNamed(result, 'SITE_URL'));
        });

        expect(result.current.componentConfigs).toBe(before);
    });

    it('normalizes against the CURRENT value, not the one it was built with', async () => {
        // The callback closes over componentConfigs. A stale closure would read the
        // value from mount time and decide there is nothing to normalize.
        const { result } = await mountWith({});

        await act(async () => {
            result.current.updateField(fieldNamed(result, 'SITE_URL'), 'https://example.com/');
        });
        await act(async () => {
            result.current.normalizeUrlField(fieldNamed(result, 'SITE_URL'));
        });

        expect(result.current.componentConfigs.commerce.SITE_URL).toBe('https://example.com');
    });
});

describe('a load that lands after the hook is gone', () => {
    it('does not set state when the registry response arrives post-unmount', async () => {
        // Setting state on an unmounted hook is the React warning the console gate
        // fails on, so this test asserting silence is also asserting the guard.
        let resolveRequest: (v: unknown) => void = () => {};
        mockRequest.mockReturnValue(
            new Promise((resolve) => {
                resolveRequest = resolve;
            }),
        );

        const { unmount } = renderHook(() =>
            useComponentConfig({
                selectedStack: 'stack',
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            }),
        );
        unmount();

        await act(async () => {
            resolveRequest({
                success: true,
                type: 'components-data',
                data: { frontends: [], backends: [], envVars: ENV_VARS },
            });
        });

        // The response still reaches the module cache — it is the dead hook's
        // STATE that must not be written. A later mount proves both halves: it
        // renders loaded without asking again.
        const { result } = renderHook(() =>
            useComponentConfig({
                selectedStack: 'stack',
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            }),
        );
        expect(result.current.isLoading).toBe(false);
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('does not set the error state when a FAILED response arrives post-unmount', async () => {
        let rejectRequest: (e: unknown) => void = () => {};
        mockRequest.mockReturnValue(
            new Promise((_resolve, reject) => {
                rejectRequest = reject;
            }),
        );

        const { unmount } = renderHook(() =>
            useComponentConfig({
                selectedStack: 'stack',
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            }),
        );
        unmount();

        await act(async () => {
            rejectRequest(new Error('channel closed'));
            await Promise.resolve();
        });

        // The shared promise is cleared even though the hook that owned it is
        // gone, so the next mount is free to retry rather than inheriting the
        // failure.
        mockRequest.mockResolvedValue({
            success: true,
            type: 'components-data',
            data: { frontends: [], backends: [], envVars: ENV_VARS },
        });
        const { result } = renderHook(() =>
            useComponentConfig({
                selectedStack: 'stack',
                componentConfigs: {},
                onConfigsChange: jest.fn(),
                onValidationChange: jest.fn(),
            }),
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.loadError).toBeNull();
    });
});
