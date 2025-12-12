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
    /** Callback to export project settings */
    onExportProject?: (project: Project) => void;
}

/**
 * ProjectsGrid - Displays projects in a responsive grid layout
 */
export const ProjectsGrid: React.FC<ProjectsGridProps> = ({
    projects,
    onSelectProject,
    onExportProject,
}) => {
    return (
        <div
            data-testid="projects-grid"
            className="projects-grid"
        >
            {projects.map((project) => (
                <ProjectCard
                    key={project.path}
                    project={project}
                    onSelect={onSelectProject}
                    onExport={onExportProject}
                />
            ))}
        </div>
    );
};
