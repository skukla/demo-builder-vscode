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
    /** Path of the currently running project (if any) */
    runningProjectPath?: string;
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
    /** Callback to start a demo */
    onStartDemo?: (project: Project) => void;
    /** Callback to stop a demo */
    onStopDemo?: (project: Project) => void;
    /** Callback to open demo in browser */
    onOpenBrowser?: (project: Project) => void;
    /** Callback to open live site (for EDS projects) */
    onOpenLiveSite?: (project: Project) => void;
    /** Callback to open DA.live for authoring (for EDS projects) */
    onOpenDaLive?: (project: Project) => void;
    /** Callback to reset project (re-clone components or reset from template) */
    onResetProject?: (project: Project) => void;
    /** Callback to republish content to CDN (for EDS projects) */
    onRepublishContent?: (project: Project) => void;
    /** Callback to edit project settings */
    onEditProject?: (project: Project) => void;
    /** Callback to rename project */
    onRenameProject?: (project: Project) => void;
    /** Callback to export project settings */
    onExportProject?: (project: Project) => void;
    /** Callback to delete project */
    onDeleteProject?: (project: Project) => void;
}

/**
 * ProjectRowList - Displays projects in a vertical row list
 */
export const ProjectRowList: React.FC<ProjectRowListProps> = ({
    projects,
    runningProjectPath,
    onSelectProject,
    onStartDemo,
    onStopDemo,
    onOpenBrowser,
    onOpenLiveSite,
    onOpenDaLive,
    onResetProject,
    onRepublishContent,
    onEditProject,
    onRenameProject,
    onExportProject,
    onDeleteProject,
}) => {
    return (
        <div className="project-row-list">
            {projects.map((project) => (
                <ProjectRow
                    key={project.path}
                    project={project}
                    isRunning={project.path === runningProjectPath}
                    onSelect={onSelectProject}
                    onStartDemo={onStartDemo}
                    onStopDemo={onStopDemo}
                    onOpenBrowser={onOpenBrowser}
                    onOpenLiveSite={onOpenLiveSite}
                    onOpenDaLive={onOpenDaLive}
                    onResetProject={onResetProject}
                    onRepublishContent={onRepublishContent}
                    onEdit={onEditProject}
                    onRename={onRenameProject}
                    onExport={onExportProject}
                    onDelete={onDeleteProject}
                />
            ))}
        </div>
    );
};
