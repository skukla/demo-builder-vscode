/**
 * ApiAccessStage Tests (Add Integration flow — API-access step)
 *
 * INFORMATIONAL, not interactive. Integrations are deterministic: their API
 * access is fixed and subscribed at deploy, so this step only TELLS the user
 * what the integration grants — required APIs (short labels) + the baseline
 * Adobe I/O access, each "Always on". Static (no org fetch, no picker). A custom
 * app additionally notes that more APIs are granted as it's built.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

import { ApiAccessStage } from '@/features/project-creation/ui/components/integration-flow/stages/ApiAccessStage';

type Props = React.ComponentProps<typeof ApiAccessStage>;

function renderStage(props: Partial<Props> = {}) {
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiAccessStage required={props.required} custom={props.custom} />
        </Provider>
    );
}

/** The "Always on" rows in the Included facts section. */
function includedNames(): string[] {
    const section = screen.getByTestId('api-access-included');
    return Array.from(section.querySelectorAll('.intflow-api-summary-name')).map(
        (el) => el.textContent ?? ''
    );
}

describe('ApiAccessStage (informational)', () => {
    it('renders as read-only facts — no picker, checkboxes, or filter', () => {
        renderStage({ required: ['GraphQLServiceSDK'] });

        expect(screen.getByTestId('api-access-stage')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByTestId('spectrum-searchfield')).not.toBeInTheDocument();
        expect(screen.getByText(/granted automatically/i)).toBeInTheDocument();
    });

    it('shows a required API by its short label plus the baseline, both Always on', () => {
        renderStage({ required: ['GraphQLServiceSDK'] });

        // GraphQLServiceSDK -> "API Mesh"; baseline -> "I/O Management API".
        expect(includedNames()).toEqual(['API Mesh', 'I/O Management API']);
        const section = screen.getByTestId('api-access-included');
        expect(within(section).getAllByText('Always on')).toHaveLength(2);
    });

    it('lists only the baseline when the integration declares no required APIs', () => {
        renderStage({ required: [] });
        expect(includedNames()).toEqual(['I/O Management API']);
    });

    it('renders instantly with no `required` prop at all (baseline only)', () => {
        renderStage();
        expect(includedNames()).toEqual(['I/O Management API']);
    });

    it('de-dupes a required code that IS the baseline', () => {
        renderStage({ required: ['AdobeIOManagementAPISDK'] });
        expect(includedNames()).toEqual(['I/O Management API']);
    });

    it('falls back to the raw code when no short label exists', () => {
        renderStage({ required: ['SomeOtherSDK'] });
        expect(includedNames()).toEqual(['SomeOtherSDK', 'I/O Management API']);
    });

    it('shows the build-time note only for a custom app', () => {
        renderStage({ custom: true });
        expect(screen.getByText(/as you build it/i)).toBeInTheDocument();
        expect(screen.getByText(/Manage APIs/i)).toBeInTheDocument();
    });

    it('omits the custom note for a catalog/mesh integration', () => {
        renderStage({ required: ['GraphQLServiceSDK'] });
        expect(screen.queryByText(/as you build it/i)).not.toBeInTheDocument();
    });
});
