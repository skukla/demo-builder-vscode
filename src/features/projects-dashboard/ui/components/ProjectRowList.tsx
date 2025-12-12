/**
 * ProjectRowList Component
 *
 * Displays projects as a vertical stack of full-width rows.
 * Part of the layout prototype comparison (Option A: Rows).
 */

import React from 'react';
import { ProjectRow } from './ProjectRow';
import type { Project } from '@/types/base';

export interface ProjectRowListProps {
    /** Array of projects to display */
    projects: Project[];
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
    /** Callback to export project settings */
    onExportProject?: (project: Project) => void;
}

/**
 * ProjectRowList - Displays projects in a vertical row list
 */
export const ProjectRowList: React.FC<ProjectRowListProps> = ({
    projects,
    onSelectProject,
    onExportProject,
}) => {
    return (
        <div className="project-row-list">
            {projects.map((project) => (
                <ProjectRow
                    key={project.path}
                    project={project}
                    onSelect={onSelectProject}
                    onExport={onExportProject}
                />
            ))}
        </div>
    );
};
