/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectsDashboard } from '@/features/projects-dashboard/ui/ProjectsDashboard';
import {
    createMockProjects,
    createMockProject,
    createRunningProject,
} from '../testUtils';
import type { Project } from '@/types/base';

// Mock the webviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()), // Returns unsubscribe function
    },
}));

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('ProjectsDashboard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('empty state', () => {
        it('should show empty state when no projects', () => {
            renderWithProvider(
                <ProjectsDashboard
                    projects={[]}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: /new project/i })
            ).toBeInTheDocument();
        });

        it('should call onCreateProject when empty state CTA is clicked', () => {
            const onCreateProject = jest.fn();
            renderWithProvider(
                <ProjectsDashboard
                    projects={[]}
                    onSelectProject={jest.fn()}
                    onCreateProject={onCreateProject}
                />
            );

            fireEvent.click(
                screen.getByRole('button', { name: /new project/i })
            );

            expect(onCreateProject).toHaveBeenCalledTimes(1);
        });
    });

    describe('with projects', () => {
        it('should show project grid when projects exist', () => {
            const projects = createMockProjects(3);
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            expect(screen.getByText('Project 1')).toBeInTheDocument();
            expect(screen.getByText('Project 2')).toBeInTheDocument();
            expect(screen.getByText('Project 3')).toBeInTheDocument();
        });

        it('should show "+ New" button in header', () => {
            const projects = createMockProjects(2);
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            expect(
                screen.getByRole('button', { name: /new/i })
            ).toBeInTheDocument();
        });

        it('should call onCreateProject when "+ New" button is clicked', () => {
            const projects = createMockProjects(2);
            const onCreateProject = jest.fn();
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={onCreateProject}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /new/i }));

            expect(onCreateProject).toHaveBeenCalledTimes(1);
        });

        it('should call onSelectProject when a project card is clicked', () => {
            const projects = createMockProjects(2);
            const onSelectProject = jest.fn();
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={onSelectProject}
                    onCreateProject={jest.fn()}
                />
            );

            const firstCard = screen
                .getByText('Project 1')
                .closest('[role="button"]');
            if (firstCard) {
                fireEvent.click(firstCard);
            }

            expect(onSelectProject).toHaveBeenCalledWith(projects[0]);
        });
    });

    describe('search and filter', () => {
        it('should always show search field regardless of project count', () => {
            const projects = createMockProjects(2);
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            expect(
                screen.getByPlaceholderText(/filter projects/i)
            ).toBeInTheDocument();
        });

        it('should filter projects based on search query', async () => {
            const projects = [
                createMockProject({ name: 'Alpha Project', path: '/test/alpha' }),
                createMockProject({ name: 'Beta Project', path: '/test/beta' }),
                createMockProject({ name: 'Gamma Project', path: '/test/gamma' }),
                createMockProject({ name: 'Delta Project', path: '/test/delta' }),
                createMockProject({ name: 'Epsilon Project', path: '/test/epsilon' }),
                createMockProject({ name: 'Zeta Project', path: '/test/zeta' }),
            ];
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            const searchField = screen.getByPlaceholderText(/filter projects/i);
            fireEvent.change(searchField, { target: { value: 'Alpha' } });

            await waitFor(() => {
                expect(screen.getByText('Alpha Project')).toBeInTheDocument();
                expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
            });
        });

        it('should show "Showing X of Y projects" when filtering', async () => {
            const projects = createMockProjects(6);
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            const searchField = screen.getByPlaceholderText(/filter projects/i);
            fireEvent.change(searchField, { target: { value: 'Project 1' } });

            await waitFor(() => {
                expect(screen.getByText(/showing 1 of 6/i)).toBeInTheDocument();
            });
        });
    });

    describe('loading state', () => {
        it('should show loading spinner when isLoading is true', () => {
            renderWithProvider(
                <ProjectsDashboard
                    projects={[]}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                    isLoading
                />
            );

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('should not show empty state while loading', () => {
            renderWithProvider(
                <ProjectsDashboard
                    projects={[]}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                    isLoading
                />
            );

            expect(
                screen.queryByText(/no projects yet/i)
            ).not.toBeInTheDocument();
        });
    });

    describe('header', () => {
        it('should show "Your Projects" title', () => {
            const projects = createMockProjects(2);
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            expect(screen.getByText(/your projects/i)).toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        it('should have proper heading structure', () => {
            const projects = createMockProjects(2);
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            const heading = screen.getByRole('heading', { name: /your projects/i });
            expect(heading).toBeInTheDocument();
        });

        it('should be keyboard navigable', () => {
            const projects = createMockProjects(2);
            renderWithProvider(
                <ProjectsDashboard
                    projects={projects}
                    onSelectProject={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            // All interactive elements should be focusable
            const buttons = screen.getAllByRole('button');
            buttons.forEach((button) => {
                expect(button).toHaveAttribute('tabIndex');
            });
        });
    });
});
