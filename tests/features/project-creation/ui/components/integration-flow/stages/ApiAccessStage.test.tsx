/**
 * ApiAccessStage Tests (Add Integration flow — API-access step)
 *
 * INFORMATIONAL, not interactive. Integrations are deterministic: their API
 * access is fixed and subscribed at deploy, so this step only TELLS the user
 * what the integration will grant — required APIs (short labels) + the baseline
 * Adobe I/O access. State lives in the row icon alone (no status word), reusing
 * the StatusSection vocabulary: a Clock (pending) while an API is waiting to be
 * enabled at deploy — NOT a ✓ — and a green CheckmarkCircle for an API another
 * integration in the project already covers. Static (no org fetch, no picker, no
 * provisioning) — this stage is for the DETERMINISTIC mesh/catalog kinds;
 * custom/import use the ApiPickerStage.
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
            <ApiAccessStage required={props.required} alreadyEnabled={props.alreadyEnabled} />
        </Provider>
    );
}

/** The API-name rows in the Included facts section. */
function includedNames(): string[] {
    const section = screen.getByTestId('api-access-included');
    return Array.from(section.querySelectorAll('.intflow-api-summary-name')).map(
        (el) => el.textContent ?? ''
    );
}

/** Count granted rows (green CheckmarkCircle) in the Included section. */
function grantedCount(): number {
    const section = screen.getByTestId('api-access-included');
    return section.querySelectorAll('.text-green-600').length;
}

/** Count pending rows (blue Clock — waiting to be enabled) in the Included section. */
function pendingCount(): number {
    const section = screen.getByTestId('api-access-included');
    return section.querySelectorAll('.text-blue-600').length;
}

describe('ApiAccessStage (informational)', () => {
    it('renders as read-only facts — no picker, checkboxes, or filter', () => {
        renderStage({ required: ['GraphQLServiceSDK'] });

        expect(screen.getByTestId('api-access-stage')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByTestId('spectrum-searchfield')).not.toBeInTheDocument();
        expect(screen.getByText(/needs these Adobe APIs/i)).toBeInTheDocument();
    });

    it('shows a required API + baseline as PENDING (Clock), not ✓, before anything is enabled', () => {
        renderStage({ required: ['GraphQLServiceSDK'] });

        // GraphQLServiceSDK -> "API Mesh"; baseline -> "I/O Management API".
        expect(includedNames()).toEqual(['API Mesh', 'I/O Management API']);
        // Nothing enabled yet → both rows pending (Clock), zero granted ✓.
        expect(pendingCount()).toBe(2);
        expect(grantedCount()).toBe(0);
        // No per-row status word either.
        const section = screen.getByTestId('api-access-included');
        expect(within(section).queryByText(/Always on|Enabling|Enabled/)).not.toBeInTheDocument();
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

    it('says the required APIs are enabled at deploy (never provisioned in the modal)', () => {
        renderStage({ required: ['GraphQLServiceSDK'] });
        expect(screen.getByText(/needs these Adobe APIs/i)).toBeInTheDocument();
        expect(screen.getByText(/when this integration deploys/i)).toBeInTheDocument();
        // No in-modal enable states: no spinner, no "This step enables them" copy.
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.queryByText(/This step enables them/i)).not.toBeInTheDocument();
    });

    it('marks an API already enabled by another integration as ✓, not pending', () => {
        // The baseline is already covered by a prior integration (e.g. a mesh) — it
        // must show ✓, never a pending Clock asking the user to add it again.
        renderStage({
            required: ['GraphQLServiceSDK'],
            alreadyEnabled: ['AdobeIOManagementAPISDK'],
        });

        // Mesh API is net-new (pending Clock); the baseline is already-enabled (✓).
        expect(pendingCount()).toBe(1);
        expect(grantedCount()).toBe(1);
    });

    it('says "nothing new to add" when every API is already enabled by the project', () => {
        // A catalog integration whose only API (the baseline) is already covered.
        renderStage({ alreadyEnabled: ['AdobeIOManagementAPISDK'] });

        expect(grantedCount()).toBe(1);
        expect(pendingCount()).toBe(0);
        expect(
            screen.getByText(/already enabled on your workspace — nothing new to add/i)
        ).toBeInTheDocument();
        expect(screen.queryByText(/needs these Adobe APIs/i)).not.toBeInTheDocument();
    });
});
