/**
 * ApiAccessPicker Tests (core, presentational)
 *
 * The SHARED grouped Adobe-API list used by the wizard's ApiPickerStage and the
 * dashboard's Manage APIs modal. Pure props — no fetching, no feature imports:
 *   - groups, in order: "Suggested" (codes ∈ suggested, hidden when none) → "All
 *     available" (the rest, alphabetical by display name); locked (already-covered)
 *     APIs collapse to a quiet footnote, not checkbox rows;
 *   - search across name + code (SearchHeader reuse, catalog threshold);
 *   - display names primary, codes secondary; optional helper copy line at top.
 *
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ApiAccessPicker } from '@/core/ui/components/selection/ApiAccessPicker';
import type { ApiAccessOption } from '@/core/ui/components/selection/ApiAccessPicker';

interface ApiOption {
    code: string;
    name: string;
    locked: boolean;
    requiresProfile?: boolean;
    requiresReview?: boolean;
    group?: { code: string; name: string };
}

/** Seven services (> the search threshold of 5), one locked, unsorted on purpose. */
const APIS: ApiOption[] = [
    { code: 'TargetSDK', name: 'Adobe Target', locked: false },
    { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: true },
    { code: 'CampaignSDK', name: 'Adobe Campaign', locked: false },
    { code: 'AssetsSDK', name: 'AEM Assets', locked: false },
    { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false },
    { code: 'AudienceManagerSDK', name: 'Audience Manager', locked: false },
    { code: 'CloudManagerSDK', name: 'Cloud Manager', locked: false },
];

type Props = React.ComponentProps<typeof ApiAccessPicker>;

function renderPicker(props: Partial<Props> = {}): {
    onToggle: jest.Mock;
    container: HTMLElement;
} {
    const onToggle = jest.fn();
    const { container } = render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiAccessPicker
                apis={props.apis ?? APIS}
                selected={props.selected ?? []}
                onToggle={onToggle}
                helperText={props.helperText}
            />
        </Provider>
    );
    return { onToggle, container };
}

/** Like renderPicker, but exposes a typed rerender for interaction tests. */
function renderPickerRerenderable(props: Partial<Props> = {}): {
    container: HTMLElement;
    rerender: (next: Partial<Props>) => void;
} {
    const onToggle = jest.fn();
    const ui = (p: Partial<Props>) => (
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiAccessPicker
                apis={p.apis ?? APIS}
                selected={p.selected ?? []}
                onToggle={onToggle}
                helperText={p.helperText}
            />
        </Provider>
    );
    const { container, rerender } = render(ui(props));
    return { container, rerender: (next) => rerender(ui({ ...props, ...next })) };
}

/** The checkbox input rendered for a given API display name. */
function checkboxFor(name: string): HTMLInputElement {
    const label = screen.getByText(name).closest('label');
    if (!label) throw new Error(`No checkbox label found for "${name}"`);
    return label.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

/** Row display names in DOM (render) order — the flat list, checked-first. */
function listNames(container: HTMLElement): (string | null)[] {
    return Array.from(container.querySelectorAll('.intflow-api-name')).map((el) => el.textContent);
}

describe('ApiAccessPicker', () => {
    describe('helper copy', () => {
        it('renders the helper line at the top when provided', () => {
            renderPicker({ helperText: 'Picks grant access to these Adobe APIs.' });
            expect(screen.getByText('Picks grant access to these Adobe APIs.')).toBeInTheDocument();
        });

        it('renders no helper element when absent', () => {
            const { container } = renderPicker();
            expect(container.querySelector('.intflow-api-helper')).toBeNull();
        });
    });

    describe('flat list', () => {
        it('renders one flat list with no category headers', () => {
            const { container } = renderPicker();
            expect(container.querySelectorAll('.intflow-api-group-title')).toHaveLength(0);
            expect(container.querySelector('[data-group]')).toBeNull();
            expect(container.querySelector('[data-testid="api-provided-footnote"]')).toBeNull();
            // Every API is a row (locked included).
            const names = listNames(container);
            expect(names).toContain('API Mesh'); // locked
            expect(names).toContain('Adobe Target'); // pickable
        });

        it('sorts checked rows (locked or picked) to the top, alphabetical within', () => {
            const { container } = renderPicker({ selected: ['AnalyticsSDK'] });
            const names = listNames(container);
            // Checked first (API Mesh is locked, Adobe Analytics is picked), alphabetical;
            // then the rest, alphabetical.
            expect(names.slice(0, 2)).toEqual(['Adobe Analytics', 'API Mesh']);
            expect(names.slice(2)).toEqual([
                'Adobe Campaign',
                'Adobe Target',
                'AEM Assets',
                'Audience Manager',
                'Cloud Manager',
            ]);
        });

        // REGRESSION (2026-07-31, user-reported): the checked-first rank read the
        // LIVE `selected`, so ticking a box sent that row to the top and every row
        // below it shifted — the next row the user was aiming at moved out from
        // under the cursor. Order is now frozen to the selection as it stood when
        // the list arrived; only the CHECKBOXES track the live selection.
        it('does NOT reorder rows as the selection changes', () => {
            const { container, rerender } = renderPickerRerenderable({ selected: [] });
            const before = listNames(container);

            // The user ticks a row near the bottom.
            rerender({ selected: ['CloudManagerSDK'] });

            expect(listNames(container)).toEqual(before);
        });

        it('still reflects the new selection in the checkbox, just not the order', () => {
            const { container, rerender } = renderPickerRerenderable({ selected: [] });
            rerender({ selected: ['CloudManagerSDK'] });

            expect(checkboxFor('Cloud Manager')).toBeChecked();
            // …and it has NOT jumped to the top.
            expect(listNames(container)[0]).not.toBe('Cloud Manager');
        });

        // The freeze must not outlive the list it was taken for.
        it('RE-seeds the order when the api list itself changes', () => {
            const { container, rerender } = renderPickerRerenderable({ selected: [] });

            rerender({ selected: ['CloudManagerSDK'], apis: [...APIS] });

            expect(listNames(container)[0]).toBe('API Mesh'); // locked still first
            expect(listNames(container).slice(0, 2)).toContain('Cloud Manager');
        });

        it('renders locked APIs checked + disabled at the top', () => {
            const { container } = renderPicker();
            expect(listNames(container)[0]).toBe('API Mesh'); // locked → checked → top
            const cb = checkboxFor('API Mesh');
            expect(cb).toBeChecked();
            expect(cb).toBeDisabled();
        });
    });

    describe('selection', () => {
        it('clicking an unlocked API calls onToggle with its code', () => {
            const { onToggle } = renderPicker();
            fireEvent.click(checkboxFor('Adobe Analytics'));
            expect(onToggle).toHaveBeenCalledWith('AnalyticsSDK');
        });

        it('renders selected codes checked and the rest unchecked', () => {
            renderPicker({ selected: ['AnalyticsSDK'] });
            expect(checkboxFor('Adobe Analytics')).toBeChecked();
            expect(checkboxFor('Adobe Target')).not.toBeChecked();
        });
    });

    describe('search', () => {
        it('filters across display names', () => {
            renderPicker();
            fireEvent.change(screen.getByTestId('spectrum-searchfield'), {
                target: { value: 'audience' },
            });
            expect(screen.getByText('Audience Manager')).toBeInTheDocument();
            expect(screen.queryByText('Adobe Target')).not.toBeInTheDocument();
        });

        it('filters across codes too', () => {
            renderPicker();
            fireEvent.change(screen.getByTestId('spectrum-searchfield'), {
                target: { value: 'assetssdk' },
            });
            expect(screen.getByText('AEM Assets')).toBeInTheDocument();
            expect(screen.queryByText('Adobe Campaign')).not.toBeInTheDocument();
        });

        it('hides the search field at or below the threshold (5 items)', () => {
            renderPicker({ apis: APIS.slice(0, 5) });
            expect(screen.queryByTestId('spectrum-searchfield')).not.toBeInTheDocument();
        });
    });

    describe('product-profile gating (hidden — not self-subscribable here)', () => {
        const WITH_PROFILE: ApiOption[] = [
            { code: 'TargetSDK', name: 'Adobe Target', locked: false },
            { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false, requiresProfile: true },
            { code: 'AssetsSDK', name: 'AEM Assets', locked: false },
            { code: 'CampaignSDK', name: 'Adobe Campaign', locked: false },
            { code: 'CloudManagerSDK', name: 'Cloud Manager', locked: false },
            { code: 'AudienceManagerSDK', name: 'Audience Manager', locked: false },
        ];

        it('never renders profile-bound APIs — no group, no row, no section header', () => {
            const { container } = renderPicker({ apis: WITH_PROFILE });
            expect(container.querySelector('[data-group="unavailable"]')).toBeNull();
            expect(screen.queryByText('Requires a product profile')).not.toBeInTheDocument();
            expect(screen.queryByText('Adobe Analytics')).not.toBeInTheDocument();
        });

        it('keeps profile-bound APIs out of the list', () => {
            const { container } = renderPicker({ apis: WITH_PROFILE });
            expect(listNames(container)).not.toContain('Adobe Analytics');
        });

        it('excludes hidden APIs from the "N APIs" count', () => {
            // APIS (7, none gated) + 1 profile-bound = 8 total; the count shows the 7 shown.
            const apis: ApiOption[] = [
                ...APIS,
                { code: 'X-SDK', name: 'Gated Thing', locked: false, requiresProfile: true },
            ];
            renderPicker({ apis });
            expect(screen.getByText('7 APIs')).toBeInTheDocument();
            expect(screen.queryByText('8 APIs')).not.toBeInTheDocument();
        });
    });

    describe('product filter chips', () => {
        const EC = { code: 'marketing_cloud', name: 'Experience Cloud' };
        const AEP = { code: 'experience_platform', name: 'Adobe Experience Platform' };
        const DC = { code: 'document_cloud', name: 'Document Cloud' };
        const CC = { code: 'creative_cloud', name: 'Creative Cloud' };

        // Two lenses over one list: Adobe's cloud families (from the catalog's
        // cloudGrouping) AND a curated Commerce / App Builder pair keyed off the
        // name+code. An API can sit in both.
        const REAL: ApiOption[] = [
            {
                code: 'commerceeventing',
                name: 'I/O Events for Adobe Commerce',
                locked: false,
                group: EC,
            },
            { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: false, group: AEP },
            { code: 'TargetSDK', name: 'Adobe Target', locked: false, group: EC },
            { code: 'SignSDK', name: 'Adobe Sign', locked: false, group: DC },
            { code: 'PhotoshopSDK', name: 'Photoshop', locked: false, group: CC },
            { code: 'LooseSDK', name: 'Ungrouped Thing', locked: false },
        ];

        function chipLabels(container: HTMLElement): (string | null)[] {
            return Array.from(container.querySelectorAll('.intflow-api-chip')).map(
                (el) => el.textContent
            );
        }

        it('renders All, the curated pills, then the remaining cloud families', () => {
            const { container } = renderPicker({ apis: REAL });
            expect(chipLabels(container)).toEqual([
                'All',
                'Adobe Commerce',
                'App Builder',
                'Adobe Experience Platform',
                'Experience Cloud',
            ]);
        });

        it('omits the Document Cloud and Creative Cloud pills', () => {
            const { container } = renderPicker({ apis: REAL });
            expect(chipLabels(container)).not.toContain('Document Cloud');
            expect(chipLabels(container)).not.toContain('Creative Cloud');
        });

        it('still lists the excluded families’ APIs under All', () => {
            // The PILLS go, not the services. This picker is the only surface that
            // can subscribe anything, so hiding them would put them out of reach.
            const { container } = renderPicker({ apis: REAL });
            const names = listNames(container);
            expect(names).toContain('Adobe Sign'); // Document Cloud
            expect(names).toContain('Photoshop'); // Creative Cloud
            expect(names).toContain('Ungrouped Thing'); // no cloudGrouping at all
        });

        it('puts an API in BOTH its curated pill and its cloud pill', () => {
            // The curated pills are a second lens, not a re-bucketing: clicking
            // "Experience Cloud" must still show everything Adobe groups there.
            const { container } = renderPicker({ apis: REAL });

            fireEvent.click(screen.getByRole('button', { name: 'Adobe Commerce' }));
            expect(listNames(container)).toEqual(['I/O Events for Adobe Commerce']);

            fireEvent.click(screen.getByRole('button', { name: 'Experience Cloud' }));
            expect(listNames(container)).toEqual([
                'Adobe Target',
                'I/O Events for Adobe Commerce',
            ]);
        });

        it('matches the curated pills on the display name OR the code', () => {
            const { container } = renderPicker({ apis: REAL });
            fireEvent.click(screen.getByRole('button', { name: 'App Builder' }));
            // API Mesh matches by name; GraphQLServiceSDK would match by code too.
            expect(listNames(container)).toEqual(['API Mesh']);
        });

        it('marks the active chip pressed', () => {
            renderPicker({ apis: REAL });
            const chip = screen.getByRole('button', { name: 'Adobe Commerce' });
            expect(chip).toHaveAttribute('aria-pressed', 'false');
            fireEvent.click(chip);
            expect(chip).toHaveAttribute('aria-pressed', 'true');
        });

        it('renders no chip row when nothing is groupable', () => {
            // Only ungrouped, non-curated APIs: every pill would filter to nothing.
            const { container } = renderPicker({
                apis: [{ code: 'LooseSDK', name: 'Ungrouped Thing', locked: false }],
            });
            expect(container.querySelector('.intflow-api-chips')).toBeNull();
        });

        it('renders no chip row when the ONLY families present are excluded', () => {
            const { container } = renderPicker({
                apis: [{ code: 'SignSDK', name: 'Adobe Sign', locked: false, group: DC }],
            });
            expect(container.querySelector('.intflow-api-chips')).toBeNull();
        });

        it('still toggles a pickable row after filtering to a pill', () => {
            const { onToggle } = renderPicker({ apis: REAL });
            fireEvent.click(screen.getByRole('button', { name: 'App Builder' }));
            fireEvent.click(checkboxFor('API Mesh'));
            expect(onToggle).toHaveBeenCalledWith('GraphQLServiceSDK');
        });
    });

    describe('secondary code text', () => {
        const MIXED: ApiOption[] = [
            { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: false },
            {
                code: 'nogw-4011f358-2edb-4b01-acb8-3c84e0cbb299',
                name: 'Edge Delivery Services',
                locked: false,
            },
            { code: 'AEM Assets Author API', name: 'AEM Assets Author API', locked: false },
        ];

        it('shows a meaningful sdk code but hides GUID and name-equal codes', () => {
            const { container } = renderPicker({ apis: MIXED });
            const codes = Array.from(container.querySelectorAll('.intflow-api-code')).map(
                (el) => el.textContent
            );
            expect(codes).toEqual(['GraphQLServiceSDK']);
        });
    });

    describe('Adobe-review gating', () => {
        const WITH_REVIEW: ApiOption[] = [
            { code: 'TargetSDK', name: 'Adobe Target', locked: false },
            {
                code: 'AdobeCommerceWithAdobeID',
                name: 'Commerce w/ Adobe ID',
                locked: false,
                requiresReview: true,
            },
            { code: 'AssetsSDK', name: 'AEM Assets', locked: false },
            { code: 'CampaignSDK', name: 'Adobe Campaign', locked: false },
            { code: 'CloudManagerSDK', name: 'Cloud Manager', locked: false },
            { code: 'AudienceManagerSDK', name: 'Audience Manager', locked: false },
        ];

        it('never renders review-gated APIs — no group, no row, no section header', () => {
            const { container } = renderPicker({ apis: WITH_REVIEW });
            expect(container.querySelector('[data-group="review"]')).toBeNull();
            expect(screen.queryByText('Requires Adobe review')).not.toBeInTheDocument();
            expect(screen.queryByText('Commerce w/ Adobe ID')).not.toBeInTheDocument();
        });

        it('keeps review-gated APIs out of the list', () => {
            const { container } = renderPicker({ apis: WITH_REVIEW });
            expect(listNames(container)).not.toContain('Commerce w/ Adobe ID');
        });
    });

    describe('display', () => {
        it('shows the display name primary with the code as secondary text', () => {
            renderPicker();
            const label = screen.getByText('Adobe Analytics').closest('label');
            expect(label?.querySelector('.intflow-api-name')?.textContent).toBe('Adobe Analytics');
            expect(label?.querySelector('.intflow-api-code')?.textContent).toBe('AnalyticsSDK');
        });
    });

    /**
     * Step 05 — the reason slot.
     *
     * A locked row renders checked + disabled and, until now, said nothing about
     * why. Step 04 made both handlers send `requiredBy`; this is where it becomes
     * something a user can act on: "you cannot uncheck this, ERP Sync needs it."
     *
     * The cases that must NOT name anyone are as load-bearing as the one that must.
     * Baseline is always-on — nothing chose it, so attributing it to an integration
     * would be a lie. And a legacy pick's owner is genuinely unrecoverable, so an
     * invented reason is worse than none.
     */
    describe('locked reason', () => {
        function withOwnership(over: Partial<ApiAccessOption>): ApiAccessOption[] {
            return [{ code: 'MeshSDK', name: 'API Mesh', locked: true, ...over }];
        }

        it('names the integration holding a locked code', () => {
            const { container } = renderPicker({
                apis: withOwnership({ ownership: 'other-required', requiredBy: ['ERP Sync'] }),
            });
            expect(container.querySelector('.intflow-api-reason')?.textContent).toBe(
                'Required by ERP Sync'
            );
        });

        it('names every holder when more than one integration requires it', () => {
            const { container } = renderPicker({
                apis: withOwnership({
                    ownership: 'other-required',
                    requiredBy: ['ERP Sync', 'Firefly App'],
                }),
            });
            expect(container.querySelector('.intflow-api-reason')?.textContent).toBe(
                'Required by ERP Sync and Firefly App'
            );
        });

        it('says nothing for the always-on baseline', () => {
            // Nothing chose it. Naming an owner here would be false.
            const { container } = renderPicker({
                apis: withOwnership({ ownership: 'baseline', requiredBy: [] }),
            });
            expect(container.querySelector('.intflow-api-reason')).toBeNull();
        });

        it('says nothing when the holder is unrecoverable', () => {
            // A legacy unattributed pick locks the row but can name nobody.
            const { container } = renderPicker({
                apis: withOwnership({ ownership: 'other-required', requiredBy: [] }),
            });
            expect(container.querySelector('.intflow-api-reason')).toBeNull();
        });

        it('says nothing on a row the asking integration can itself uncheck', () => {
            // mine-optional is removable — a reason would contradict the checkbox.
            const { container } = renderPicker({
                apis: withOwnership({
                    locked: false,
                    ownership: 'mine-optional',
                    requiredBy: [],
                }),
            });
            expect(container.querySelector('.intflow-api-reason')).toBeNull();
        });
    });
});
