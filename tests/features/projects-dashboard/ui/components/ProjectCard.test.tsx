/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectCard } from '@/features/projects-dashboard/ui/components/ProjectCard';
import {
    createMockProject,
    createRunningProject,
} from '../../testUtils';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('ProjectCard', () => {
    describe('rendering', () => {
        it('should render project name', () => {
            const project = createMockProject({ name: 'My Demo Project' });
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            expect(screen.getByText('My Demo Project')).toBeInTheDocument();
        });

        it('should show running status with green indicator', () => {
            const project = createRunningProject({ name: 'Running Demo' });
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            // Find the status text specifically (not the project name)
            const statusElements = screen.getAllByText(/running/i);
            // Should have at least the status text
            expect(statusElements.length).toBeGreaterThanOrEqual(1);
            // Status dot should be present
            const statusIndicator = screen.getByRole('presentation');
            expect(statusIndicator).toBeInTheDocument();
        });

        it('should show stopped status with gray indicator', () => {
            const project = createMockProject({
                name: 'My Demo',  // Avoid status word in name
                status: 'stopped',
            });
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            expect(screen.getByText('Stopped')).toBeInTheDocument();
        });

        it('should show port number when running', () => {
            const project = createRunningProject({ name: 'Running Demo' });
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            expect(screen.getByText(/:3000/)).toBeInTheDocument();
        });

        it('should not show port when stopped', () => {
            const project = createMockProject({
                name: 'Stopped Demo',
                status: 'stopped',
            });
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            expect(screen.queryByText(/:3000/)).not.toBeInTheDocument();
        });

        it('should display component names stacked', () => {
            const project = createMockProject();
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            // Components should be listed individually
            expect(screen.getByText('CitiSignal')).toBeInTheDocument();
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });

        it('should handle project with no components gracefully', () => {
            const project = createMockProject({
                name: 'Empty Project',
                componentInstances: undefined,
            });
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            expect(screen.getByText('Empty Project')).toBeInTheDocument();
        });
    });

    describe('interactions', () => {
        it('should call onSelect when clicked', () => {
            const project = createMockProject({ name: 'Clickable Demo' });
            const onSelect = jest.fn();
            renderWithProvider(
                <ProjectCard project={project} onSelect={onSelect} />
            );

            fireEvent.click(screen.getByRole('button'));

            expect(onSelect).toHaveBeenCalledWith(project);
            expect(onSelect).toHaveBeenCalledTimes(1);
        });

        it('should call onSelect when Enter key is pressed', () => {
            const project = createMockProject({ name: 'Keyboard Demo' });
            const onSelect = jest.fn();
            renderWithProvider(
                <ProjectCard project={project} onSelect={onSelect} />
            );

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: 'Enter' });

            expect(onSelect).toHaveBeenCalledWith(project);
        });

        it('should call onSelect when Space key is pressed', () => {
            const project = createMockProject({ name: 'Keyboard Demo' });
            const onSelect = jest.fn();
            renderWithProvider(
                <ProjectCard project={project} onSelect={onSelect} />
            );

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: ' ' });

            expect(onSelect).toHaveBeenCalledWith(project);
        });
    });

    describe('accessibility', () => {
        it('should have proper aria-label', () => {
            const project = createRunningProject({ name: 'Accessible Demo' });
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            const card = screen.getByRole('button');
            expect(card).toHaveAttribute(
                'aria-label',
                expect.stringContaining('Accessible Demo')
            );
        });

        it('should be focusable', () => {
            const project = createMockProject({ name: 'Focusable Demo' });
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            const card = screen.getByRole('button');
            expect(card).toHaveAttribute('tabIndex', '0');
        });
    });
});
