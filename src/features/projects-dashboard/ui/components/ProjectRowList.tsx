/**
 * ProjectRowList Component
 *
 * Displays projects as a vertical stack of full-width rows.
 * Part of the layout prototype comparison (Option A: Rows).
 */

import React from 'react';
import { ProjectRow } from './ProjectRow';
import type { ProjectActions } from './ProjectActionsMenu';
import type { Project } from '@/types/base';

export interface ProjectRowListProps {
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
    /** Bundled action callbacks passed to each row's menu */
    actions?: ProjectActions;
}

/**
 * ProjectRowList - Displays projects in a vertical row list
 */
export const ProjectRowList: React.FC<ProjectRowListProps> = ({
    projects,
    runningProjectPath,
    onSelectProject,
    actions = {},
}) => {
    return (
        <div className="project-row-list">
            {projects.map((project) => (
                <ProjectRow
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
