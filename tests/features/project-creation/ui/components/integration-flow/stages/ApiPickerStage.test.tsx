/**
 * ApiPickerStage Tests — the INTERACTIVE api-access step for custom/import apps: the shared
 * ApiAccessPicker over the list the dialog read (`useOrgApis.test.ts`), so the user can pick the
 * APIs they know the app needs up front.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

import { ApiPickerStage } from '@/features/project-creation/ui/components/integration-flow/stages/ApiPickerStage';

const FFS = { code: 'FireflyServicesSDK', name: 'Firefly Services', locked: false };
const BASELINE = { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API', locked: true };

function renderStage() {
    const onToggle = jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiPickerStage apis={[FFS, BASELINE]} selected={[]} onToggle={onToggle} />
        </Provider>,
    );
    return { onToggle };
}

describe('ApiPickerStage', () => {
    it('renders no redundant "API access" heading (the modal title already carries it)', () => {
        renderStage();
        expect(screen.queryByText('API access')).not.toBeInTheDocument();
    });

    it('renders the picker with the APIs it is given', () => {
        renderStage();
        expect(screen.getByText('Firefly Services')).toBeInTheDocument();
        expect(screen.getByText('I/O Management API')).toBeInTheDocument();
    });

    it('gives the interactive picker the full-width modal container', () => {
        renderStage();
        expect(screen.getByTestId('api-picker-stage')).toHaveClass('intflow-api-info--full');
    });

    it('toggles a free (unlocked) pick through onToggle', () => {
        const { onToggle } = renderStage();
        fireEvent.click(screen.getByRole('checkbox', { name: /Firefly Services/i }));
        expect(onToggle).toHaveBeenCalledWith('FireflyServicesSDK');
    });
});
