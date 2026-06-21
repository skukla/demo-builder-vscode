/**
 * AppBuilderComponentsStepContent Component Tests (D2 Track B — Step 03)
 *
 * The catalog-driven appBuilderComponents picker that replaces the single mesh on/off
 * toggle: required rows locked+checked, optional rows toggleable, mesh as ONE
 * normal row, plus a custom-URL door reusing the shared GitHub-URL validator
 * (parseGitHubUrl). Presentational only — data + callbacks, no fetching.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppBuilderComponentsStepContent } from '@/features/project-creation/ui/components/AppBuilderComponentsStepContent';
import type { SelectableAppBuilderComponent } from '@/features/project-creation/services/appBuilderComponentSelection';

const meshRequired: SelectableAppBuilderComponent = {
    id: 'commerce-paas-mesh',
    name: 'Commerce PaaS API Mesh',
    description: 'API Mesh for EDS + PaaS',
    kind: 'mesh',
    source: { owner: 'skukla', repo: 'commerce-paas-mesh', branch: 'main' },
    requirement: 'required',
};

const meshOptional: SelectableAppBuilderComponent = {
    ...meshRequired,
    requirement: 'optional',
};

const integrationOptional: SelectableAppBuilderComponent = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'Connects to an external ERP',
    kind: 'integration',
    source: { owner: 'o', repo: 'erp-integration', branch: 'main' },
    requirement: 'optional',
};

const noop = jest.fn();

const defaultProps = {
    appBuilderComponents: [] as SelectableAppBuilderComponent[],
    selectedAppBuilderComponents: [] as string[],
    onAppBuilderComponentToggle: noop,
    onAddCustomAppBuilderComponent: noop,
};

describe('AppBuilderComponentsStepContent', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('catalog rows', () => {
        it('renders one checkbox row per appBuilderComponent with name + description', () => {
            render(
                <AppBuilderComponentsStepContent
                    {...defaultProps}
                    appBuilderComponents={[meshOptional, integrationOptional]}
                />,
            );
            expect(screen.getByText('Commerce PaaS API Mesh')).toBeInTheDocument();
            expect(screen.getByText('API Mesh for EDS + PaaS')).toBeInTheDocument();
            expect(screen.getByText('ERP Integration')).toBeInTheDocument();
            expect(screen.getByText('Connects to an external ERP')).toBeInTheDocument();
        });

        it('renders a required row checked + disabled', () => {
            render(
                <AppBuilderComponentsStepContent {...defaultProps} appBuilderComponents={[meshRequired]} />,
            );
            const checkbox = screen.getByRole('checkbox', { name: /Commerce PaaS API Mesh/i });
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeDisabled();
        });

        it('renders an optional row as toggleable and reflects selection', () => {
            render(
                <AppBuilderComponentsStepContent
                    {...defaultProps}
                    appBuilderComponents={[integrationOptional]}
                    selectedAppBuilderComponents={['erp-integration']}
                />,
            );
            const checkbox = screen.getByRole('checkbox', { name: /ERP Integration/i });
            expect(checkbox).toBeChecked();
            expect(checkbox).not.toBeDisabled();
        });

        it('calls onAppBuilderComponentToggle when an optional row toggles', () => {
            const onAppBuilderComponentToggle = jest.fn();
            render(
                <AppBuilderComponentsStepContent
                    {...defaultProps}
                    appBuilderComponents={[integrationOptional]}
                    onAppBuilderComponentToggle={onAppBuilderComponentToggle}
                />,
            );
            fireEvent.click(screen.getByRole('checkbox', { name: /ERP Integration/i }));
            expect(onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-integration', true);
        });

        it('treats the mesh as ONE normal row (no special mesh section)', () => {
            const onAppBuilderComponentToggle = jest.fn();
            render(
                <AppBuilderComponentsStepContent
                    {...defaultProps}
                    appBuilderComponents={[meshOptional]}
                    onAppBuilderComponentToggle={onAppBuilderComponentToggle}
                />,
            );
            // The mesh is just a catalog row driven by the same handler.
            fireEvent.click(screen.getByRole('checkbox', { name: /Commerce PaaS API Mesh/i }));
            expect(onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-paas-mesh', true);
        });
    });

    describe('empty state (Edge)', () => {
        it('shows an empty-state message and does not crash when no appBuilderComponents', () => {
            render(<AppBuilderComponentsStepContent {...defaultProps} appBuilderComponents={[]} />);
            expect(screen.getByText(/no.*App Builder components/i)).toBeInTheDocument();
        });
    });

    describe('custom-URL door (reuses parseGitHubUrl validation)', () => {
        it('disables Add when the URL is empty', () => {
            render(<AppBuilderComponentsStepContent {...defaultProps} />);
            const addButton = screen.getByRole('button', { name: /Add/i });
            expect(addButton).toBeDisabled();
        });

        it('disables Add for an invalid (non-GitHub) URL', () => {
            render(<AppBuilderComponentsStepContent {...defaultProps} />);
            const input = screen.getByRole('textbox', { name: /App Builder component.*url/i });
            fireEvent.change(input, { target: { value: 'https://example.com/not-github' } });
            expect(screen.getByRole('button', { name: /Add/i })).toBeDisabled();
        });

        it('enables Add for a valid public GitHub URL', () => {
            render(<AppBuilderComponentsStepContent {...defaultProps} />);
            const input = screen.getByRole('textbox', { name: /App Builder component.*url/i });
            fireEvent.change(input, { target: { value: 'https://github.com/owner/my-repo' } });
            expect(screen.getByRole('button', { name: /Add/i })).not.toBeDisabled();
        });

        it('calls onAddCustomAppBuilderComponent with a canonicalized source on Add', () => {
            const onAddCustomAppBuilderComponent = jest.fn();
            render(
                <AppBuilderComponentsStepContent
                    {...defaultProps}
                    onAddCustomAppBuilderComponent={onAddCustomAppBuilderComponent}
                />,
            );
            const input = screen.getByRole('textbox', { name: /App Builder component.*url/i });
            fireEvent.change(input, { target: { value: 'https://github.com/owner/my-repo.git' } });
            fireEvent.click(screen.getByRole('button', { name: /Add/i }));
            expect(onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
                expect.objectContaining({ owner: 'owner', repo: 'my-repo' }),
            );
        });
    });

    describe('showCustomDoor prop', () => {
        it('shows the custom-URL door by default (preserves existing callers)', () => {
            render(<AppBuilderComponentsStepContent {...defaultProps} />);
            expect(
                screen.getByRole('textbox', { name: /App Builder component.*url/i }),
            ).toBeInTheDocument();
        });

        it('shows the custom-URL door when showCustomDoor is true', () => {
            render(<AppBuilderComponentsStepContent {...defaultProps} showCustomDoor />);
            expect(
                screen.getByRole('textbox', { name: /App Builder component.*url/i }),
            ).toBeInTheDocument();
        });

        it('hides the custom-URL door when showCustomDoor is false', () => {
            render(<AppBuilderComponentsStepContent {...defaultProps} showCustomDoor={false} />);
            expect(
                screen.queryByRole('textbox', { name: /App Builder component.*url/i }),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Add/i })).not.toBeInTheDocument();
        });
    });
});
