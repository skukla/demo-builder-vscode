import './ConfigureScreen.mocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import '@testing-library/jest-dom';
import {
    mockProject,
    mockComponentsData,
    selectSection,
    railTab,
} from './ConfigureScreen.testUtils';

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
}));

// Mock layout components. The shell + rail are NOT mocked (direct-path imports) — the
// rail is what these tests use to reach a section, and what carries the error marker.
jest.mock('@/core/ui/components/layout/PageFooter', () => ({
    PageFooter: ({ leftContent, rightContent }: any) => (
        <div data-testid="page-footer" className="border-t bg-gray-75 max-w-800">
            <div data-testid="footer-left">{leftContent}</div>
            <div data-testid="footer-right">{rightContent}</div>
        </div>
    ),
}));

jest.mock('@/core/ui/components/layout/PageHeader', () => ({
    PageHeader: ({ title, subtitle }: any) => (
        <div data-testid="page-header" className="border-b bg-gray-75">
            <h1>{title}</h1>
            {subtitle && <h3>{subtitle}</h3>}
        </div>
    ),
}));

// Helper to wrap component in Provider
const renderWithProvider = (component: React.ReactElement) => {
    return render(<Provider theme={defaultTheme}>{component}</Provider>);
};

describe('ConfigureScreen - Validation', () => {
    // No scrollIntoView stub any more: nothing scrolls to a field now that switching
    // sections replaces the body, and StepRail optional-chains the one call it makes.

    describe('Field Validation', () => {
        it('should validate required fields on load', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject}
                    componentsData={mockComponentsData}
                    existingEnvValues={{}}
                />
            );

            // Save button should be disabled if required fields empty
            const saveButton = screen.getByText('Save Changes').closest('button');
            expect(saveButton).toBeDisabled();
        });

        it('should validate URL fields', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithProvider(
                <ConfigureScreen project={mockProject} componentsData={mockComponentsData} />
            );

            selectSection('Adobe Commerce');
            const urlField = document
                .getElementById('field-ADOBE_COMMERCE_URL')
                ?.querySelector('input');
            // Unconditional: this used to sit behind `if (urlField)`, which would have
            // passed silently the moment the field stopped rendering by default.
            expect(urlField).not.toBeNull();

            await user.clear(urlField as HTMLInputElement);
            await user.type(urlField as HTMLInputElement, 'not-a-url');
            await user.tab(); // Trigger blur to mark field as touched

            await waitFor(() => {
                expect(screen.getByText('Please enter a valid URL')).toBeInTheDocument();
            });
        });

        it('should enable save button when all required fields valid', async () => {
            // Component IDs must match mockProject.componentSelections
            const validConfig = {
                headless: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'adobe-commerce-paas': {
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
                'catalog-service': {
                    ADOBE_CATALOG_API_KEY: 'test-key-123',
                },
            };

            renderWithProvider(
                <ConfigureScreen
                    project={mockProject}
                    componentsData={mockComponentsData}
                    existingEnvValues={validConfig}
                />
            );

            await waitFor(() => {
                const saveButton = screen.getByText('Save Changes');
                expect(saveButton).not.toBeDisabled();
            });
        });
    });

    describe('Cross-section validation', () => {
        // With one section on screen, validation must stay GLOBAL: an error the user
        // cannot see still has to block Save, and the rail has to say which tab holds
        // it — otherwise Save is disabled with no visible cause.
        // Shared deliberately, as a canary. `useConfigureFieldValues` must not write into
        // the object it is handed; when it did, this fixture reached the second test
        // already carrying the first test's invalid URL and Save started out disabled.
        // Pinned directly by `hooks/useConfigureFieldValues.test.tsx`.
        const validConfig = {
            headless: {
                ADOBE_COMMERCE_URL: 'https://example.com',
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            },
            'adobe-commerce-paas': {
                ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
            },
            'catalog-service': {
                ADOBE_CATALOG_API_KEY: 'test-key-123',
            },
        };

        it('keeps Save blocked by an invalid field in a NON-active section', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

            renderWithProvider(
                <ConfigureScreen
                    project={mockProject}
                    componentsData={mockComponentsData}
                    existingEnvValues={validConfig}
                />
            );

            // Everything valid to start with.
            await waitFor(() => {
                expect(screen.getByText('Save Changes')).not.toBeDisabled();
            });

            // Break a field in Adobe Commerce…
            selectSection('Adobe Commerce');
            const urlField = document
                .getElementById('field-ADOBE_COMMERCE_URL')
                ?.querySelector('input') as HTMLInputElement;
            await user.clear(urlField);
            await user.type(urlField, 'not-a-url');

            // …then leave for another section, so the broken field is off screen.
            selectSection('Catalog Service');
            expect(document.getElementById('field-ADOBE_COMMERCE_URL')).toBeNull();

            await waitFor(() => {
                expect(screen.getByText('Save Changes').closest('button')).toBeDisabled();
            });
        });

        it('marks the rail tab that holds the off-screen error', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

            renderWithProvider(
                <ConfigureScreen
                    project={mockProject}
                    componentsData={mockComponentsData}
                    existingEnvValues={validConfig}
                />
            );

            // Control: nothing is marked while everything is valid. Establish "valid"
            // through Save first — `existingEnvValues` arrives via an effect, so the very
            // first paint legitimately has every required field empty.
            await waitFor(() => {
                expect(screen.getByText('Save Changes')).not.toBeDisabled();
            });
            expect(railTab('Adobe Commerce')).not.toHaveAttribute('data-has-error');

            selectSection('Adobe Commerce');
            const urlField = document
                .getElementById('field-ADOBE_COMMERCE_URL')
                ?.querySelector('input') as HTMLInputElement;
            await user.clear(urlField);
            await user.type(urlField, 'not-a-url');
            selectSection('Catalog Service');

            await waitFor(() => {
                expect(railTab('Adobe Commerce')).toHaveAttribute('data-has-error', 'true');
            });
            expect(railTab('Catalog Service')).not.toHaveAttribute('data-has-error');
        });
    });
});
