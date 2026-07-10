/**
 * ApiAccessPicker Tests (core, presentational)
 *
 * The SHARED grouped Adobe-API list used by the wizard's ApiAccessStage and the
 * dashboard's Manage APIs modal. Pure props — no fetching, no feature imports:
 *   - groups, in order: "Required by this integration" (locked → checked + disabled)
 *     → "Suggested" (codes ∈ suggested, hidden when none) → "All available"
 *     (the rest, alphabetical by display name);
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
                suggested={props.suggested}
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

    describe('grouping', () => {
        it('renders the groups in order: Required → Suggested → All available', () => {
            const { container } = renderPicker({ suggested: ['AnalyticsSDK'] });
            const titles = Array.from(container.querySelectorAll('.intflow-api-group-title')).map(
                (el) => el.textContent
            );
            expect(titles).toEqual(['Required by this integration', 'Suggested', 'All available']);
        });

        it('locked APIs render checked + disabled in the Required group', () => {
            const { container } = renderPicker();
            const requiredGroup = container.querySelector('[data-group="required"]');
            expect(requiredGroup?.textContent).toContain('API Mesh');
            const locked = checkboxFor('API Mesh');
            expect(locked).toBeChecked();
            expect(locked).toBeDisabled();
        });

        it('clicking a locked API never calls onToggle', () => {
            const { onToggle } = renderPicker();
            fireEvent.click(checkboxFor('API Mesh'));
            expect(onToggle).not.toHaveBeenCalled();
        });

        it('hides the Suggested group when no suggestions are given', () => {
            renderPicker();
            expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
        });

        it('the Suggested group holds exactly the suggested non-locked codes', () => {
            const { container } = renderPicker({
                // GraphQLServiceSDK is locked → stays in Required, not Suggested.
                suggested: ['AnalyticsSDK', 'TargetSDK', 'GraphQLServiceSDK'],
            });
            const suggestedGroup = container.querySelector('[data-group="suggested"]');
            expect(suggestedGroup).not.toBeNull();
            const names = Array.from(
                suggestedGroup?.querySelectorAll('.intflow-api-name') ?? []
            ).map((el) => el.textContent);
            expect(names).toHaveLength(2);
            expect(names).toContain('Adobe Analytics');
            expect(names).toContain('Adobe Target');
        });

        it('the All-available group is alphabetical by display name', () => {
            const { container } = renderPicker({ suggested: ['AnalyticsSDK'] });
            const allGroup = container.querySelector('[data-group="all"]');
            const names = Array.from(allGroup?.querySelectorAll('.intflow-api-name') ?? []).map(
                (el) => el.textContent
            );
            expect(names).toEqual([
                'Adobe Campaign',
                'Adobe Target',
                'AEM Assets',
                'Audience Manager',
                'Cloud Manager',
            ]);
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

    describe('display', () => {
        it('shows the display name primary with the code as secondary text', () => {
            renderPicker();
            const label = screen.getByText('Adobe Analytics').closest('label');
            expect(label?.querySelector('.intflow-api-name')?.textContent).toBe('Adobe Analytics');
            expect(label?.querySelector('.intflow-api-code')?.textContent).toBe('AnalyticsSDK');
        });
    });
});
