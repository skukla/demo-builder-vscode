/**
 * ApiAccessStage Tests (Add Integration flow — API-access stage)
 *
 * A lean two-column stage. LEFT is the browse list: the journey-prefetched org
 * APIs ({@link useOrgConsoleApis} owns the fetch — see its own suite) as a
 * filterable picker of the FREE (non-locked) APIs, with a loading row and an
 * inline error + Retry. RIGHT is "Included": the integration's REQUIRED APIs,
 * sourced from the CATALOG `required` codes so it renders instantly and survives
 * a slow/timed-out list. There is NO live enable and NO Selected mirror — picks
 * are the checked rows, with a "N added" count. It NEVER blocks the footer.
 *
 * The REAL ApiAccessPicker renders (it is pure), so grouping/toggle behavior is
 * exercised end-to-end.
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
                required={props.required ?? ['GraphQLServiceSDK']}
                suggested={props.suggested}
                selected={props.selected ?? []}
                onToggle={onToggle}
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

    it('renders FREE APIs as checkboxes and the required API in the Included column', () => {
        renderStage();

        // The free API is a toggleable row; the locked one is NOT in the list…
        expect(screen.getByText('Adobe Analytics').closest('label')).not.toBeNull();
        expect(screen.getByText('API Mesh').closest('label')).toBeNull();
        // …it lives in the right Included column (from the catalog `required`),
        // name-resolved from the org list.
        const included = screen.getByTestId('api-summary-included');
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
    });

    it('renders Included INSTANTLY from the catalog even when the org list errored (timeout-resilient)', () => {
        renderStage({
            required: ['GraphQLServiceSDK'],
            orgApis: orgApis({
                status: 'error',
                apis: [],
                error: 'list-org-console-apis timed out',
            }),
        });

        // Left degrades to the inline error…
        expect(screen.getByText('list-org-console-apis timed out')).toBeInTheDocument();
        // …but Included shows the stable SHORT label instantly (no org list needed),
        // never the raw sdkCode — so there's no code→name swap when the list lands.
        const included = screen.getByTestId('api-summary-included');
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
        expect(within(included).queryByText('GraphQLServiceSDK')).not.toBeInTheDocument();
    });

    it('surfaces baseline locked APIs in Included, not just the catalog required', () => {
        // The baseline (AdobeIOManagementAPISDK) is locked → excluded from the
        // pickable list; it must still appear as an "Always on" fact in Included.
        renderStage({
            required: ['GraphQLServiceSDK'],
            orgApis: orgApis({
                apis: [
                    { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: true },
                    { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API', locked: true },
                    { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false },
                ],
            }),
        });

        const included = screen.getByTestId('api-summary-included');
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
        expect(within(included).getByText('I/O Management API')).toBeInTheDocument();
        // …and the baseline is NOT offered as a pickable checkbox.
        expect(screen.queryByText('I/O Management API')?.closest('label') ?? null).toBeNull();
    });

    it('shows a project mesh in Included even with NO catalog required (custom-path parity)', () => {
        // Adding a CUSTOM integration to a project that already has a mesh: the
        // stage gets no catalog `required`, but the mesh's GraphQLServiceSDK is
        // locked (it's a selected project component) → Included must still show it
        // alongside the baseline. This is the "everything always-on for the
        // project" behavior — Included reflects ALL locked APIs, not just `required`.
        renderStage({
            required: [],
            orgApis: orgApis({
                apis: [
                    { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: true },
                    { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API', locked: true },
                    { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false },
                ],
            }),
        });

        const included = screen.getByTestId('api-summary-included');
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
        expect(within(included).getByText('I/O Management API')).toBeInTheDocument();
    });

    it('shows an at-a-glance "N added" count reflecting the picks', () => {
        renderStage({ selected: ['AnalyticsSDK'] });
        expect(screen.getByText(/1 added/i)).toBeInTheDocument();
    });

    it('lists optional picks under "Added" in Included, separate from Always on', () => {
        renderStage({ selected: ['AnalyticsSDK'] });

        const added = screen.getByTestId('api-summary-added');
        expect(within(added).getByText('Adobe Analytics')).toBeInTheDocument();
        // Always-on facts stay in their own section (not mixed with Added).
        const alwaysOn = screen.getByTestId('api-summary-included');
        expect(within(alwaysOn).queryByText('Adobe Analytics')).not.toBeInTheDocument();
    });

    it('removes an added pick via its inline × (calls onToggle with the code)', () => {
        const { onToggle } = renderStage({ selected: ['AnalyticsSDK'] });

        fireEvent.click(screen.getByRole('button', { name: 'Remove Adobe Analytics' }));
        expect(onToggle).toHaveBeenCalledWith('AnalyticsSDK');
    });

    it('shows no Added section when there are no optional picks', () => {
        renderStage({ selected: [] });
        expect(screen.queryByTestId('api-summary-added')).not.toBeInTheDocument();
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
