/**
 * ApiAccessPicker — the matching rules
 *
 * The sibling suite covers the picker's SHAPE (list, chips, search, selection).
 * This one covers the rules that decide what matches what, each of which is a
 * pattern or a comparison that reads as obviously right and is not:
 *
 *   - the curated pill patterns, which tolerate the spacing Adobe's names use
 *     ("App Builder" and "AppBuilderSDK" are the same product);
 *   - the excluded-cloud pattern, which must match the WHOLE family name, so a
 *     family that merely contains "Document Cloud" keeps its pill;
 *   - which sdk codes are worth showing as secondary text;
 *   - which locked rows earn a reason line and which must stay silent;
 *   - the search normalisation and the empty state.
 */

import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ApiAccessOption } from '@/core/ui/components/selection/ApiAccessPicker';
import {
    checkboxFor,
    chipLabels,
    codeTexts,
    listNames,
    renderPicker,
    type ApiOption,
} from './ApiAccessPicker.testUtils';

/** A single API plus one inert neighbour, so the list is never empty. */
function withOne(api: ApiOption): ApiOption[] {
    return [api, { code: 'LooseSDK', name: 'Ungrouped Thing', locked: false }];
}

/** Does the App Builder pill appear for this one API? */
function hasAppBuilderPill(name: string, code: string): boolean {
    const { container } = renderPicker({ apis: withOne({ code, name, locked: false }) });
    return chipLabels(container).includes('App Builder');
}

describe('ApiAccessPicker — curated pill patterns', () => {
    // Adobe writes the same product both ways — "App Builder" in a display name,
    // "AppBuilderSDK" in a code — and the pattern has to cover both, which is
    // exactly what `\s*` is doing and what nothing was checking.
    it.each([
        ['a spaced display name', 'App Builder', 'ZzzSDK'],
        ['an unspaced code', 'Some Service', 'AppBuilderSDK'],
        ['a spaced I/O name', 'Adobe I/O Events', 'ZzzSDK'],
        ['an unspaced, slashless I/O code', 'Some Service', 'AdobeIoManagement'],
        ['a spaced mesh name', 'API Mesh', 'ZzzSDK'],
        ['an unspaced mesh code', 'Some Service', 'APIMeshSDK'],
        ['a spaced GraphQL service name', 'GraphQL Service', 'ZzzSDK'],
        ['an unspaced GraphQL code', 'Some Service', 'GraphQLServiceSDK'],
    ])('claims %s for the App Builder pill', (_label, name, code) => {
        expect(hasAppBuilderPill(name, code)).toBe(true);
    });

    it('claims a Commerce API for the Commerce pill', () => {
        const { container } = renderPicker({
            apis: withOne({ code: 'commerceeventing', name: 'I/O Events for Adobe Commerce', locked: false }),
        });

        expect(chipLabels(container)).toContain('Adobe Commerce');
    });

    it('claims nothing for an unrelated service', () => {
        expect(hasAppBuilderPill('Adobe Target', 'TargetSDK')).toBe(false);
    });
});

describe('ApiAccessPicker — the excluded cloud families', () => {
    const listWith = (group: { code: string; name: string }) =>
        withOne({ code: 'SignSDK', name: 'Adobe Sign', locked: false, group });

    it('drops the pill for an exact Document Cloud family', () => {
        const { container } = renderPicker({
            apis: listWith({ code: 'document_cloud', name: 'Document Cloud' }),
        });

        expect(chipLabels(container)).toEqual([]);
    });

    // The pattern is anchored at BOTH ends on purpose: only the two families
    // themselves are noise, and a family that merely contains those words is a
    // different bucket that must keep its pill.
    it('keeps the pill for a family whose name only ENDS with Document Cloud', () => {
        const { container } = renderPicker({
            apis: listWith({ code: 'adc', name: 'Adobe Document Cloud' }),
        });

        expect(chipLabels(container)).toContain('Adobe Document Cloud');
    });

    it('keeps the pill for a family whose name only STARTS with Creative Cloud', () => {
        const { container } = renderPicker({
            apis: listWith({ code: 'ccs', name: 'Creative Cloud Services' }),
        });

        expect(chipLabels(container)).toContain('Creative Cloud Services');
    });

    it('drops the pill however the family name is spaced', () => {
        // The name arrives verbatim from Adobe's catalog; nothing normalises its
        // whitespace on the way in.
        const { container } = renderPicker({
            apis: listWith({ code: 'document_cloud', name: 'Document  Cloud' }),
        });

        expect(chipLabels(container)).toEqual([]);
    });
});

describe('ApiAccessPicker — which chips exist at all', () => {
    it('shows the row for a curated family alone, with no cloud grouping anywhere', () => {
        const { container } = renderPicker({
            apis: withOne({ code: 'commerceeventing', name: 'I/O Events for Adobe Commerce', locked: false }),
        });

        expect(chipLabels(container)).toEqual(['All', 'Adobe Commerce']);
    });

    it('shows the row for a cloud family alone, with nothing curated', () => {
        const { container } = renderPicker({
            apis: withOne({
                code: 'TargetSDK',
                name: 'Adobe Target',
                locked: false,
                group: { code: 'marketing_cloud', name: 'Experience Cloud' },
            }),
        });

        expect(chipLabels(container)).toEqual(['All', 'Experience Cloud']);
    });

    it('builds the pills from PICKABLE rows only — a locked row earns no pill', () => {
        // A locked API is already covered; offering a filter that resolves to one
        // uncheckable row is a chip that cannot help.
        const { container } = renderPicker({
            apis: withOne({
                code: 'TargetSDK',
                name: 'Adobe Target',
                locked: true,
                group: { code: 'marketing_cloud', name: 'Experience Cloud' },
            }),
        });

        expect(chipLabels(container)).toEqual([]);
    });

    it('marks only the active chip', () => {
        renderPicker({
            apis: withOne({
                code: 'commerceeventing',
                name: 'I/O Events for Adobe Commerce',
                locked: false,
            }),
        });
        const chip = screen.getByRole('button', { name: 'Adobe Commerce' });
        expect(chip).not.toHaveAttribute('data-active');

        fireEvent.click(chip);

        expect(chip).toHaveAttribute('data-active', '');
        expect(screen.getByRole('button', { name: 'All' })).not.toHaveAttribute('data-active');
    });
});

describe('ApiAccessPicker — the secondary code text', () => {
    const shownFor = (name: string, code: string): (string | null)[] => {
        const { container } = renderPicker({ apis: [{ code, name, locked: false }] });
        return codeTexts(container);
    };

    it('shows a compact sdk code', () => {
        expect(shownFor('API Mesh', 'GraphQLServiceSDK')).toEqual(['GraphQLServiceSDK']);
    });

    it('hides a code that repeats the display name exactly', () => {
        expect(shownFor('AEMAssets', 'AEMAssets')).toEqual([]);
    });

    it('hides an empty code', () => {
        expect(shownFor('Adobe Target', '')).toEqual([]);
    });

    it('hides a code that is really a sentence', () => {
        expect(shownFor('AEM Assets', 'AEM Assets Author API')).toEqual([]);
    });

    it('hides a code carrying a GUID', () => {
        expect(shownFor('Edge Delivery', 'nogw-4011f358-2edb-4b01-acb8-3c84e0cbb299')).toEqual([]);
    });

    it('shows a code that only LOOKS like a GUID', () => {
        // Too few hex digits in the first group and the last — a real GUID is
        // 8-4-4-4-12, and anything shorter is just a code with dashes.
        expect(shownFor('Short Ids', 'a-bcde-f123-4567-89abcdef0123')).toEqual([
            'a-bcde-f123-4567-89abcdef0123',
        ]);
        expect(shownFor('Truncated', '4011f358-2edb-4b01-acb8-3')).toEqual([
            '4011f358-2edb-4b01-acb8-3',
        ]);
    });
});

describe('ApiAccessPicker — the locked reason line', () => {
    const reasonFor = (over: Partial<ApiAccessOption>): string | null | undefined => {
        const { container } = renderPicker({
            apis: [{ code: 'MeshSDK', name: 'API Mesh', locked: true, ...over }],
        });
        return container.querySelector('.intflow-api-reason')?.textContent ?? null;
    };

    it('lists three holders as A, B and C', () => {
        expect(
            reasonFor({ ownership: 'other-required', requiredBy: ['ERP Sync', 'Firefly App', 'PIM'] })
        ).toBe('Required by ERP Sync, Firefly App and PIM');
    });

    it('says nothing when requiredBy was never sent', () => {
        // A handler that omits the field entirely must read as "nobody named",
        // not as a reason with a hole in it.
        expect(reasonFor({ ownership: 'other-required' })).toBeNull();
    });

    it('says nothing for a row this integration owns, even with holders listed', () => {
        expect(reasonFor({ ownership: 'mine-optional', requiredBy: ['ERP Sync'] })).toBeNull();
    });

    it('says nothing for baseline, even with holders listed', () => {
        expect(reasonFor({ ownership: 'baseline', requiredBy: ['ERP Sync'] })).toBeNull();
    });
});

describe('ApiAccessPicker — search and the empty state', () => {
    const search = (value: string) =>
        fireEvent.change(screen.getByTestId('spectrum-searchfield'), { target: { value } });

    it('ignores case and surrounding whitespace in the query', () => {
        const { container } = renderPicker();

        search('  AUDIENCE  ');

        expect(listNames(container)).toEqual(['Audience Manager']);
    });

    it('says so when nothing matches, and renders no rows', () => {
        const { container } = renderPicker();

        search('zzzz');

        expect(screen.getByText('No APIs match “zzzz”.')).toBeInTheDocument();
        expect(listNames(container)).toEqual([]);
    });

    it('never toggles a locked row', () => {
        const { onToggle } = renderPicker();

        fireEvent.click(checkboxFor('API Mesh'));

        expect(onToggle).not.toHaveBeenCalled();
    });
});
