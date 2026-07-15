/**
 * ApiAccessPicker Tests (core, presentational)
 *
 * The SHARED grouped Adobe-API list used by the wizard's ApiAccessStage and the
 * dashboard's Manage APIs modal. Pure props — no fetching, no feature imports:
 *   - groups, in order: "Suggested" (codes ∈ suggested, hidden when none) → "All
 *     available" (the rest, alphabetical by display name); locked (already-covered)
 *     APIs collapse to a quiet footnote, not checkbox rows;
 *   - search across name + code (SearchHeader reuse, catalog threshold);
 *   - display names primary, codes secondary; optional helper copy line at top.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ApiAccessPicker } from '@/core/ui/components/selection';

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

    describe('product-family filter chips', () => {
        const EC = { code: 'marketing_cloud', name: 'Experience Cloud' };
        const AEP = { code: 'experience_platform', name: 'Adobe Experience Platform' };
        const WITH_FAMILY: ApiOption[] = [
            { code: 'TargetSDK', name: 'Adobe Target', locked: false, group: EC },
            { code: 'MeshSDK', name: 'API Mesh', locked: false, group: AEP },
            { code: 'CampaignSDK', name: 'Adobe Campaign', locked: false, group: EC },
            { code: 'PlatformSDK', name: 'AEP Query', locked: false, group: AEP },
            { code: 'LooseSDK', name: 'Ungrouped Thing', locked: false },
            { code: 'MoreSDK', name: 'More Filler', locked: false, group: EC },
        ];

        function chipLabels(container: HTMLElement): (string | null)[] {
            return Array.from(container.querySelectorAll('.intflow-api-chip')).map(
                (el) => el.textContent
            );
        }

        it('renders a chip per family: All first, families alphabetical, Other last', () => {
            const { container } = renderPicker({ apis: WITH_FAMILY });
            expect(chipLabels(container)).toEqual([
                'All',
                'Adobe Experience Platform',
                'Experience Cloud',
                'Other',
            ]);
        });

        it('shows every family by default (no chip active)', () => {
            const { container } = renderPicker({ apis: WITH_FAMILY });
            const names = listNames(container);
            expect(names).toContain('API Mesh'); // AEP
            expect(names).toContain('Adobe Target'); // EC
            expect(names).toContain('Ungrouped Thing'); // Other
        });

        it('clicking a family chip filters the list to that family', () => {
            const { container } = renderPicker({ apis: WITH_FAMILY });
            fireEvent.click(screen.getByRole('button', { name: 'Adobe Experience Platform' }));
            const names = listNames(container);
            expect(names).toEqual(['AEP Query', 'API Mesh']); // AEP only, alphabetical
        });

        it('marks the active chip pressed', () => {
            renderPicker({ apis: WITH_FAMILY });
            const chip = screen.getByRole('button', { name: 'Experience Cloud' });
            expect(chip).toHaveAttribute('aria-pressed', 'false');
            fireEvent.click(chip);
            expect(chip).toHaveAttribute('aria-pressed', 'true');
        });

        it('renders no chip row when fewer than two families are present', () => {
            const { container } = renderPicker(); // APIS carry no group
            expect(container.querySelector('.intflow-api-chips')).toBeNull();
        });

        it('still toggles a pickable row after filtering to its family', () => {
            const { onToggle } = renderPicker({ apis: WITH_FAMILY });
            fireEvent.click(screen.getByRole('button', { name: 'Adobe Experience Platform' }));
            fireEvent.click(checkboxFor('API Mesh'));
            expect(onToggle).toHaveBeenCalledWith('MeshSDK');
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
});
