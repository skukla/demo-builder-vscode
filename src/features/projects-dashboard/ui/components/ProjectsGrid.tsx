/**
 * ProjectsGrid Component
 *
 * Displays a responsive grid of project cards.
 */

import React from 'react';
import { ProjectCard } from './ProjectCard';
import type { Project } from '@/types/base';

export interface ProjectsGridProps {
    /** Array of projects to display */
    projects: Project[];
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
}

/**
 * ProjectsGrid - Displays projects in a responsive grid layout
 */
export const ProjectsGrid: React.FC<ProjectsGridProps> = ({
    projects,
    onSelectProject,
}) => {
    return (
        <div
            data-testid="projects-grid"
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
                padding: '4px', // Small padding for hover shadow overflow
            }}
        >
            {projects.map((project) => (
                <ProjectCard
                    key={project.path}
                    project={project}
                    onSelect={onSelectProject}
                />
            ))}
        </div>
    );
};
