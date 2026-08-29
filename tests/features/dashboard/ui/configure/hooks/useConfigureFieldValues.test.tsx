/**
 * useConfigureFieldValues Tests
 *
 * The Configure screen's field values, lifted so an edit survives switching sections.
 *
 * The mutation cases are the point of this file. `updateField` and `normalizeUrlField`
 * used to copy `componentConfigs` one level deep and then write INTO the per-component
 * object they were handed — so editing a field rewrote the caller's `existingEnvValues`
 * in place. It surfaced on 2026-08-10 as a Configure test that passed alone and failed in
 * sequence, because the shared fixture arrived at the second test already carrying the
 * first test's typing.
 */

import { renderHook, act } from '@testing-library/react';
import { useConfigureFieldValues } from '@/features/dashboard/ui/configure/hooks/useConfigureFieldValues';
import type { UniqueField } from '@/features/dashboard/ui/configure/configureTypes';
import type { Project } from '@/types/base';

const project = { name: 'demo', path: '/tmp/demo' } as unknown as Project;

const urlField: UniqueField = {
    key: 'ADOBE_COMMERCE_URL',
    label: 'Commerce URL',
    type: 'url',
    required: true,
    componentIds: ['headless'],
};

/** A field declared by TWO components — the shared-env-var case. */
const sharedField: UniqueField = { ...urlField, componentIds: ['headless', 'backend'] };

function render(existingEnvValues?: Record<string, Record<string, string>>) {
    return renderHook(() => useConfigureFieldValues({ project, existingEnvValues }));
}

describe('useConfigureFieldValues', () => {
    describe('does not mutate the values it was handed', () => {
        it('leaves existingEnvValues untouched when a field is edited', () => {
            const existing = { headless: { ADOBE_COMMERCE_URL: 'https://original.test' } };
            const { result } = render(existing);

            act(() => result.current.updateField(urlField, 'https://edited.test'));

            expect(existing.headless.ADOBE_COMMERCE_URL).toBe('https://original.test');
            expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
                'https://edited.test'
            );
        });

        it('leaves it untouched across every component the field belongs to', () => {
            const existing = {
                headless: { ADOBE_COMMERCE_URL: 'https://original.test' },
                backend: { ADOBE_COMMERCE_URL: 'https://original.test' },
            };
            const { result } = render(existing);

            act(() => result.current.updateField(sharedField, 'https://edited.test'));

            expect(existing.headless.ADOBE_COMMERCE_URL).toBe('https://original.test');
            expect(existing.backend.ADOBE_COMMERCE_URL).toBe('https://original.test');
        });

        it('leaves it untouched when a URL is normalized on blur', () => {
            const existing = { headless: { ADOBE_COMMERCE_URL: 'https://original.test/' } };
            const { result } = render(existing);

            act(() => result.current.normalizeUrlField(urlField));

            expect(existing.headless.ADOBE_COMMERCE_URL).toBe('https://original.test/');
            expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
                'https://original.test'
            );
        });

        it('leaves it untouched when an App Builder value is staged', () => {
            const existing = { 'erp-integration': { ERP_HOST: 'original.test' } };
            const { result } = render(existing);

            act(() =>
                result.current.stageAppBuilderComponentValue(
                    'erp-integration',
                    'ERP_HOST',
                    'edited.test'
                )
            );

            expect(existing['erp-integration'].ERP_HOST).toBe('original.test');
        });

        it('replaces the per-component object rather than editing it (the mechanism)', () => {
            const existing = { headless: { ADOBE_COMMERCE_URL: 'https://original.test' } };
            const { result } = render(existing);
            const before = result.current.componentConfigs.headless;

            act(() => result.current.updateField(urlField, 'https://edited.test'));

            expect(result.current.componentConfigs.headless).not.toBe(before);
        });
    });

    describe('the edits themselves still work', () => {
        it('writes the value to every component that declares the field', () => {
            const { result } = render();

            act(() => result.current.updateField(sharedField, 'https://edited.test'));

            expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
                'https://edited.test'
            );
            expect(result.current.componentConfigs.backend.ADOBE_COMMERCE_URL).toBe(
                'https://edited.test'
            );
        });

        it('marks an edited field touched', () => {
            const { result } = render();

            act(() => result.current.updateField(urlField, 'https://edited.test'));

            expect(result.current.touchedFields.has('ADOBE_COMMERCE_URL')).toBe(true);
        });

        it('leaves a URL without a trailing slash alone', () => {
            const existing = { headless: { ADOBE_COMMERCE_URL: 'https://original.test' } };
            const { result } = render(existing);
            const before = result.current.componentConfigs;

            act(() => result.current.normalizeUrlField(urlField));

            // Nothing to change — and therefore no new state object either.
            expect(result.current.componentConfigs).toBe(before);
        });
    });
});
