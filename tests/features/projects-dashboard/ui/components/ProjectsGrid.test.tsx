/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectsGrid } from '@/features/projects-dashboard/ui/components/ProjectsGrid';
import { createMockProjects, createMockProject } from '../../testUtils';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => render(ui); // Simplified - no Provider needed

describe('ProjectsGrid', () => {
    describe('rendering', () => {
        it('should render nothing when projects array is empty', () => {
            const { container } = renderWithProvider(
                <ProjectsGrid projects={[]} onSelectProject={jest.fn()} />
            );

            // Grid container should exist but be empty
            const grid = container.querySelector('[data-testid="projects-grid"]');
            expect(grid).toBeInTheDocument();
            expect(grid?.children.length).toBe(0);
        });

        it('should render correct number of project cards', () => {
            const projects = createMockProjects(5);
            renderWithProvider(
                <ProjectsGrid projects={projects} onSelectProject={jest.fn()} />
            );

            // Should have 5 cards
            const cards = screen.getAllByRole('button');
            expect(cards).toHaveLength(5);
        });

        it('should render all project names', () => {
            const projects = createMockProjects(3);
            renderWithProvider(
                <ProjectsGrid projects={projects} onSelectProject={jest.fn()} />
            );

            expect(screen.getByText('Project 1')).toBeInTheDocument();
            expect(screen.getByText('Project 2')).toBeInTheDocument();
            expect(screen.getByText('Project 3')).toBeInTheDocument();
        });

        it('should apply grid layout class from CSS Module', () => {
            const projects = createMockProjects(2);
            const { container } = renderWithProvider(
                <ProjectsGrid projects={projects} onSelectProject={jest.fn()} />
            );

            const grid = container.querySelector('[data-testid="projects-grid"]');
            // CSS Module class name - Jest identity mock returns class name as-is
            expect(grid).toHaveClass('projectsGrid');
        });
    });

    describe('interactions', () => {
        it('should pass click handler to cards', () => {
            const projects = createMockProjects(2);
            const onSelectProject = jest.fn();
            renderWithProvider(
                <ProjectsGrid
                    projects={projects}
                    onSelectProject={onSelectProject}
                />
            );

            const firstCard = screen.getByText('Project 1').closest('[role="button"]');
            if (firstCard) {
                fireEvent.click(firstCard);
            }

            expect(onSelectProject).toHaveBeenCalledWith(projects[0]);
        });

        it('should handle selecting different projects', () => {
            const projects = createMockProjects(3);
            const onSelectProject = jest.fn();
            renderWithProvider(
                <ProjectsGrid
                    projects={projects}
                    onSelectProject={onSelectProject}
                />
            );

            // Click second project
            const secondCard = screen.getByText('Project 2').closest('[role="button"]');
            if (secondCard) {
                fireEvent.click(secondCard);
            }

            expect(onSelectProject).toHaveBeenCalledWith(projects[1]);
        });
    });

    describe('responsiveness', () => {
        it('should use responsive grid class for auto-fit columns', () => {
            const projects = createMockProjects(4);
            const { container } = renderWithProvider(
                <ProjectsGrid projects={projects} onSelectProject={jest.fn()} />
            );

            const grid = container.querySelector('[data-testid="projects-grid"]');
            // Grid class provides responsive layout via CSS (auto-fill, minmax(240px, 1fr))
            // CSS Module class name - Jest identity mock returns class name as-is
            expect(grid).toHaveClass('projectsGrid');
        });
    });

    describe('accessibility', () => {
        it('should be navigable with keyboard', () => {
            const projects = createMockProjects(2);
            renderWithProvider(
                <ProjectsGrid projects={projects} onSelectProject={jest.fn()} />
            );

            const cards = screen.getAllByRole('button');
            cards.forEach((card) => {
                expect(card).toHaveAttribute('tabIndex', '0');
            });
        });
    });
});
