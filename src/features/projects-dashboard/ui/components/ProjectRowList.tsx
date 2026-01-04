/**
 * ProjectRowList Component
 *
 * Displays projects as a vertical stack of full-width rows.
 * Part of the layout prototype comparison (Option A: Rows).
 */

import React from 'react';
import stylesImport from '../styles/projects-dashboard.module.css';
import { ProjectRow } from './ProjectRow';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};
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
    /** Callback to edit project settings */
    onEditProject?: (project: Project) => void;
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
    onEditProject,
    onExportProject,
    onDeleteProject,
}) => {
    return (
        <div className={styles.projectRowList}>
            {projects.map((project) => (
                <ProjectRow
                    key={project.path}
                    project={project}
                    isRunning={project.path === runningProjectPath}
                    onSelect={onSelectProject}
                    onStartDemo={onStartDemo}
                    onStopDemo={onStopDemo}
                    onOpenBrowser={onOpenBrowser}
                    onEdit={onEditProject}
                    onExport={onExportProject}
                    onDelete={onDeleteProject}
                />
            ))}
        </div>
    );
};
