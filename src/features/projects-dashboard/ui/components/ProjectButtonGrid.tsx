/**
 * ProjectButtonGrid Component
 *
 * Displays projects as a centered grid of fixed-size buttons.
 * Matches the Project Dashboard action button grid layout.
 * Part of the layout prototype comparison (Option B: Button Grid).
 */

import React from 'react';
import { ProjectButton } from './ProjectButton';
import type { Project } from '@/types/base';

export interface ProjectButtonGridProps {
    /** Array of projects to display */
    projects: Project[];
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
}

/**
 * ProjectButtonGrid - Displays projects in a centered button grid
 */
export const ProjectButtonGrid: React.FC<ProjectButtonGridProps> = ({
    projects,
    onSelectProject,
}) => {
    return (
        <div className="project-button-grid-container">
            <div className="project-button-grid">
                {projects.map((project) => (
                    <ProjectButton
                        key={project.path}
                        project={project}
                        onSelect={onSelectProject}
                    />
                ))}
            </div>
        </div>
    );
};
