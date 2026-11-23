/**
 * ProjectSelectBox — the box on a project's card or row while the list is selecting (owner,
 * 2026-11-04). The house Spectrum `Checkbox`; the tile itself ticks it too, so the box stays out
 * of the tab order (the tile is the one stop, and says whether it is ticked) and keeps its own
 * presses from reaching the tile, which would tick it a second time.
 *
 * @module features/projects-dashboard/ui/components/ProjectSelectBox
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';

/** A tile's part in the selection: whether it is ticked, and what ticks it. */
export interface TileSelection {
    selected: boolean;
    onToggle: (project: Project) => void;
}

/** The list's selection, while it is selecting: the ticked paths, and what ticks one. */
export interface ListSelection {
    selected: ReadonlySet<string>;
    onToggle: (project: Project) => void;
}

const stop = (event: React.SyntheticEvent): void => event.stopPropagation();

/** The box, before the project's name. */
export function ProjectSelectBox({ project, selection }: { project: Project; selection: TileSelection }): React.ReactElement {
    return (
        <span className="project-select-box" role="presentation" onClick={stop} onKeyDown={stop}>
            <Checkbox
                aria-label={getProjectDisplayName(project)}
                isSelected={selection.selected}
                isDisabled={project.status === 'creating'}
                excludeFromTabOrder
                onChange={() => selection.onToggle(project)}
            />
        </span>
    );
}
