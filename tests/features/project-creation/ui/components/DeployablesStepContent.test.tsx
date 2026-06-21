/**
 * DeployablesStepContent Component Tests (D2 Track B — Step 03)
 *
 * The catalog-driven deployables picker that replaces the single mesh on/off
 * toggle: required rows locked+checked, optional rows toggleable, mesh as ONE
 * normal row, plus a custom-URL door reusing the shared GitHub-URL validator
 * (parseGitHubUrl). Presentational only — data + callbacks, no fetching.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeployablesStepContent } from '@/features/project-creation/ui/components/DeployablesStepContent';
import type { SelectableDeployable } from '@/features/project-creation/services/deployableSelection';

const meshRequired: SelectableDeployable = {
    id: 'commerce-paas-mesh',
    name: 'Commerce PaaS API Mesh',
    description: 'API Mesh for EDS + PaaS',
    kind: 'mesh',
    source: { owner: 'skukla', repo: 'commerce-paas-mesh', branch: 'main' },
    requirement: 'required',
};

const meshOptional: SelectableDeployable = {
    ...meshRequired,
    requirement: 'optional',
};

const integrationOptional: SelectableDeployable = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'Connects to an external ERP',
    kind: 'integration',
    source: { owner: 'o', repo: 'erp-integration', branch: 'main' },
    requirement: 'optional',
};

const noop = jest.fn();

const defaultProps = {
    deployables: [] as SelectableDeployable[],
    selectedDeployables: [] as string[],
    onDeployableToggle: noop,
    onAddCustomDeployable: noop,
};

describe('DeployablesStepContent', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('catalog rows', () => {
        it('renders one checkbox row per deployable with name + description', () => {
            render(
                <DeployablesStepContent
                    {...defaultProps}
                    deployables={[meshOptional, integrationOptional]}
                />,
            );
            expect(screen.getByText('Commerce PaaS API Mesh')).toBeInTheDocument();
            expect(screen.getByText('API Mesh for EDS + PaaS')).toBeInTheDocument();
            expect(screen.getByText('ERP Integration')).toBeInTheDocument();
            expect(screen.getByText('Connects to an external ERP')).toBeInTheDocument();
        });

        it('renders a required row checked + disabled', () => {
            render(
                <DeployablesStepContent {...defaultProps} deployables={[meshRequired]} />,
            );
            const checkbox = screen.getByRole('checkbox', { name: /Commerce PaaS API Mesh/i });
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeDisabled();
        });

        it('renders an optional row as toggleable and reflects selection', () => {
            render(
                <DeployablesStepContent
                    {...defaultProps}
                    deployables={[integrationOptional]}
                    selectedDeployables={['erp-integration']}
                />,
            );
            const checkbox = screen.getByRole('checkbox', { name: /ERP Integration/i });
            expect(checkbox).toBeChecked();
            expect(checkbox).not.toBeDisabled();
        });

        it('calls onDeployableToggle when an optional row toggles', () => {
            const onDeployableToggle = jest.fn();
            render(
                <DeployablesStepContent
                    {...defaultProps}
                    deployables={[integrationOptional]}
                    onDeployableToggle={onDeployableToggle}
                />,
            );
            fireEvent.click(screen.getByRole('checkbox', { name: /ERP Integration/i }));
            expect(onDeployableToggle).toHaveBeenCalledWith('erp-integration', true);
        });

        it('treats the mesh as ONE normal row (no special mesh section)', () => {
            const onDeployableToggle = jest.fn();
            render(
                <DeployablesStepContent
                    {...defaultProps}
                    deployables={[meshOptional]}
                    onDeployableToggle={onDeployableToggle}
                />,
            );
            // The mesh is just a catalog row driven by the same handler.
            fireEvent.click(screen.getByRole('checkbox', { name: /Commerce PaaS API Mesh/i }));
            expect(onDeployableToggle).toHaveBeenCalledWith('commerce-paas-mesh', true);
        });
    });

    describe('empty state (Edge)', () => {
        it('shows an empty-state message and does not crash when no deployables', () => {
            render(<DeployablesStepContent {...defaultProps} deployables={[]} />);
            expect(screen.getByText(/no.*deployables/i)).toBeInTheDocument();
        });
    });

    describe('custom-URL door (reuses parseGitHubUrl validation)', () => {
        it('disables Add when the URL is empty', () => {
            render(<DeployablesStepContent {...defaultProps} />);
            const addButton = screen.getByRole('button', { name: /Add/i });
            expect(addButton).toBeDisabled();
        });

        it('disables Add for an invalid (non-GitHub) URL', () => {
            render(<DeployablesStepContent {...defaultProps} />);
            const input = screen.getByRole('textbox', { name: /deployable.*url/i });
            fireEvent.change(input, { target: { value: 'https://example.com/not-github' } });
            expect(screen.getByRole('button', { name: /Add/i })).toBeDisabled();
        });

        it('enables Add for a valid public GitHub URL', () => {
            render(<DeployablesStepContent {...defaultProps} />);
            const input = screen.getByRole('textbox', { name: /deployable.*url/i });
            fireEvent.change(input, { target: { value: 'https://github.com/owner/my-repo' } });
            expect(screen.getByRole('button', { name: /Add/i })).not.toBeDisabled();
        });

        it('calls onAddCustomDeployable with a canonicalized source on Add', () => {
            const onAddCustomDeployable = jest.fn();
            render(
                <DeployablesStepContent
                    {...defaultProps}
                    onAddCustomDeployable={onAddCustomDeployable}
                />,
            );
            const input = screen.getByRole('textbox', { name: /deployable.*url/i });
            fireEvent.change(input, { target: { value: 'https://github.com/owner/my-repo.git' } });
            fireEvent.click(screen.getByRole('button', { name: /Add/i }));
            expect(onAddCustomDeployable).toHaveBeenCalledWith(
                expect.objectContaining({ owner: 'owner', repo: 'my-repo' }),
            );
        });
    });
});
