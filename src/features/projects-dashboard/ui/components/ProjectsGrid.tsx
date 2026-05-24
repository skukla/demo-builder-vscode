/**
 * ProjectsGrid Component
 *
 * Displays a responsive grid of project cards.
 */

import React from 'react';
import { ProjectCard } from './ProjectCard';
import type { ProjectActions } from './ProjectActionsMenu';
import type { Project } from '@/types/base';

export interface ProjectsGridProps {
    /** Array of projects to display */
    projects: Project[];
    /** Path of the currently running project (if any) */
    runningProjectPath?: string;
    /**
     * Callback when a project is selected. `opts.forceNewWindow=true` rides
     * along on shift/cmd-click so the parent can open the project in a new
     * VS Code window.
     */
    onSelectProject: (project: Project, opts?: { forceNewWindow?: boolean }) => void;
    /** Bundled action callbacks passed to each card's menu */
    actions?: ProjectActions;
}

/**
 * ProjectsGrid - Displays projects in a responsive grid layout
 */
export const ProjectsGrid: React.FC<ProjectsGridProps> = ({
    projects,
    runningProjectPath,
    onSelectProject,
    actions = {},
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
                    isRunning={project.path === runningProjectPath}
                    onSelect={onSelectProject}
                    actions={actions}
                />
            ))}
        </div>
    );
};
