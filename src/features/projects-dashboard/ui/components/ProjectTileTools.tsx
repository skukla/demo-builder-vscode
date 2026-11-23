/**
 * What a project's card and row both carry: its name, renamed in place, and the pin beside the More
 * menu (owner, 2026-10-28: the pin is a button beside the menu). One module so the two tiles cannot
 * drift; both hide the tools and lock the name while the list is selecting (Reset Selected and
 * Delete Selected, owner 2026-11-04).
 *
 * @module features/projects-dashboard/ui/components/ProjectTileTools
 */

import React from 'react';
import { ProjectActionsMenu, type ProjectActions } from './ProjectActionsMenu';
import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';
import { PinToggle } from '@/core/ui/components/ui/PinToggle';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';

export interface ProjectTileToolsProps {
    project: Project;
    isRunning: boolean;
    actions: ProjectActions;
}

/** Whether a project can be renamed: not while its demo runs (the backend rejects it), or is being created. */
function canRename(project: Project, isRunning: boolean, actions: ProjectActions): boolean {
    return !isRunning && project.status !== 'creating' && Boolean(actions.onRenameSubmit);
}

export function ProjectTileTools({
    project,
    isRunning,
    actions,
    onRename,
}: ProjectTileToolsProps & { /** Rename in the menu: starts the name's field. */ onRename: () => void }): React.JSX.Element {
    const menuActions = canRename(project, isRunning, actions) ? { ...actions, onRename } : actions;
    return (
        <>
            <PinToggle
                pinned={Boolean(project.pinned)}
                subject="project"
                onToggle={actions.onPinToggle ? () => actions.onPinToggle?.(project) : undefined}
            />
            <ProjectActionsMenu project={project} isRunning={isRunning} actions={menuActions} />
        </>
    );
}

export interface ProjectTileNameProps extends ProjectTileToolsProps {
    /** The tile's own class for the name: the card's and the row's differ. */
    textClassName: string;
    /** The list is selecting: the name cannot be renamed then. */
    selecting: boolean;
    /** A new value starts the rename: the menu's Rename asks. */
    editRequest: number;
}

/**
 * The name, renamed in place: the menu's Rename swaps it for an input, and a click on it opens the
 * project (owner, 2026-11-05: the hover pencil sat 6px from the name, and took those clicks). Locked
 * while the demo runs, while it is being created, when no rename is wired, and while the list is
 * selecting.
 */
export function ProjectTileName({ project, isRunning, actions, textClassName, selecting, editRequest }: ProjectTileNameProps): React.JSX.Element {
    return (
        <InlineRenameField
            name={getProjectDisplayName(project)}
            textClassName={textClassName}
            disabled={!canRename(project, isRunning, actions) || selecting}
            noPencil
            editRequest={editRequest}
            // No `normalize`: the field takes the TITLE as typed. `renameProjectCore` derives the slug
            // from it and moves the folder to match, so rewriting keystrokes to hyphens here would
            // only put the enforcement back in the one place the user has to look at.
            onRename={(newName) => (actions.onRenameSubmit ? actions.onRenameSubmit(project, newName) : Promise.resolve(null))}
        />
    );
}
