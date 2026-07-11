/**
 * ApiAccessStage Tests (Add Integration flow — API-access stage)
 *
 * PRESENTATIONAL two-column stage (the builder's center-work/right-summary
 * grammar): the center column renders the journey-prefetched org APIs
 * ({@link useOrgConsoleApis} owns the fetch at the JOURNEY level — see its own
 * suite) as a filterable picker of FREE APIs only; the right "API Access"
 * summary column owns the facts — Applied (locked/required APIs, or a caller
 * `appliedSlot` such as the mesh enable row) and Selected (free picks by
 * display name). Loading row while the prefetch is pending; inline error +
 * Retry (the journey's retry) on failure. It NEVER blocks the footer.
 *
 * The REAL ApiAccessPicker renders (it is pure), so grouping/toggle behavior
 * is exercised end-to-end.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

import { ApiAccessStage } from '@/features/project-creation/ui/components/integration-flow/stages/ApiAccessStage';
import type { OrgConsoleApisState } from '@/features/project-creation/ui/components/integration-flow/useOrgConsoleApis';

const APIS = [
    { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: true },
    { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false },
    { code: 'TargetSDK', name: 'Adobe Target', locked: false },
];

function orgApis(overrides: Partial<OrgConsoleApisState> = {}): OrgConsoleApisState {
    return {
        status: 'ready',
        apis: APIS,
        error: undefined,
        retry: jest.fn(),
        ...overrides,
    };
}

type Props = React.ComponentProps<typeof ApiAccessStage>;

function renderStage(props: Partial<Props> = {}): { onToggle: jest.Mock } {
    const onToggle = jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiAccessStage
                orgApis={props.orgApis ?? orgApis()}
                suggested={props.suggested}
                selected={props.selected ?? []}
                onToggle={onToggle}
                appliedSlot={props.appliedSlot}
            />
        </Provider>
    );
    return { onToggle };
}

describe('ApiAccessStage', () => {
    it('shows a compact loading state while the prefetch is pending', () => {
        renderStage({ orgApis: orgApis({ status: 'loading', apis: [] }) });

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('renders FREE APIs as checkboxes and locked APIs in the summary Applied section', () => {
        renderStage();

        // The free API is a toggleable row; the locked one is NOT in the list…
        expect(screen.getByText('Adobe Analytics').closest('label')).not.toBeNull();
        expect(screen.getByText('API Mesh').closest('label')).toBeNull();
        // …it lives in the right summary column as a fact.
        const applied = screen.getByTestId('api-summary-applied');
        expect(within(applied).getByText('API Mesh')).toBeInTheDocument();
    });

    it('shows selected picks by display name in the summary Selected section', () => {
        renderStage({ selected: ['AnalyticsSDK'] });

        const selectedSection = screen.getByTestId('api-summary-selected');
        expect(within(selectedSection).getByText('Adobe Analytics')).toBeInTheDocument();
        expect(within(selectedSection).queryByText('Adobe Target')).not.toBeInTheDocument();
    });

    it('an appliedSlot replaces the locked list in the Applied section', () => {
        renderStage({ appliedSlot: <div data-testid="enable-slot">enable row</div> });

        const applied = screen.getByTestId('api-summary-applied');
        expect(within(applied).getByTestId('enable-slot')).toBeInTheDocument();
        expect(within(applied).queryByText('API Mesh')).not.toBeInTheDocument();
    });

    it('renders the add-later guidance copy with the picker', () => {
        renderStage();

        expect(screen.getByText(/add(ed)? .*later/i)).toBeInTheDocument();
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
        expect(screen.getByText(/asking the AI/i)).toBeInTheDocument();
    });

    it('toggling an unlocked API passes the code through onToggle', () => {
        const { onToggle } = renderStage();

        const checkbox = screen
            .getByText('Adobe Analytics')
            .closest('label')
            ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
        fireEvent.click(checkbox);
        expect(onToggle).toHaveBeenCalledWith('AnalyticsSDK');
    });

    it('error state shows the inline message with a Retry wired to the journey retry', () => {
        const retry = jest.fn();
        renderStage({
            orgApis: orgApis({ status: 'error', apis: [], error: 'org listing failed', retry }),
        });

        expect(screen.getByText('org listing failed')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /retry/i }));
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
