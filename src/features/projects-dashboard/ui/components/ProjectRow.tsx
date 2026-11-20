/**
 * ProjectRow Component
 *
 * Displays a project as a full-width horizontal row with Spectrum styling.
 * Shows project name, installed components, and status.
 * Includes a kebab menu for additional actions like Export.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useCallback, useMemo, useState } from 'react';
import { useProjectSelectHandlers } from '../hooks/useProjectSelectHandlers';
import type { ProjectActions } from './ProjectActionsMenu';
import { ProjectSelectBox, type TileSelection } from './ProjectSelectBox';
import { ProjectTileName, ProjectTileTools } from './ProjectTileTools';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { getComponentSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import { getProjectStatusDisplay } from '@/features/projects-dashboard/utils/projectStatusUtils';
import type { Project } from '@/types/base';

export interface ProjectRowProps {
    /** The project to display */
    project: Project;
    /** Whether the project demo is currently running */
    isRunning?: boolean;
    /**
     * Callback when the row is selected. The optional `opts` carries modifier
     * intent — `forceNewWindow: true` indicates the user wants to open the
     * project in a new VS Code window (shift-click or cmd-click convention).
     */
    onSelect: (project: Project, opts?: { forceNewWindow?: boolean }) => void;
    /** Bundled action callbacks for the kebab menu */
    actions?: ProjectActions;
    /** While the list is selecting: a box, a click ticks it, no menu, pin or rename (as the card). */
    selection?: TileSelection;
}

/**
 * ProjectRow - Displays a project as a clickable row with Spectrum styling
 */
export function ProjectRow({
    project,
    isRunning = false,
    onSelect,
    actions = {},
    selection,
}: ProjectRowProps) {
    const [renameRequest, setRenameRequest] = useState(0);
    const askRename = useCallback((): void => setRenameRequest((count) => count + 1), []);
    const { handleClick, handleKeyDown } = useProjectSelectHandlers(project, onSelect, selection?.onToggle);

    const { statusText, statusVariant, statusExplanation } = getProjectStatusDisplay(project);
    const componentSummary = useMemo(() => getComponentSummary(project), [project]);

    const ariaLabel = `${getProjectDisplayName(project)}, ${statusText}${componentSummary ? `, ${componentSummary}` : ''}`;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-pressed={selection ? selection.selected : undefined}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="project-row"
        >
            <Flex alignItems="center" justifyContent="space-between" width="100%">
                {/* Left: Status dot + Name + Components */}
                <Flex alignItems="center" gap="size-150">
                    {selection && <ProjectSelectBox project={project} selection={selection} />}
                    <StatusDot variant={statusVariant} size={8} />
                    <ProjectTileName
                        project={project}
                        isRunning={isRunning}
                        actions={actions}
                        textClassName="project-row-name"
                        editRequest={renameRequest}
                        selecting={Boolean(selection)}
                    />
                    {componentSummary && (
                        <Text UNSAFE_className="project-row-components">{componentSummary}</Text>
                    )}
                </Flex>

                {/* Right: Pin + More menu + Status text + Chevron. The pin is a button
                    beside the menu, as on the card (owner, 2026-10-28). */}
                <Flex alignItems="center" gap="size-150">
                    {!selection && <ProjectTileTools project={project} isRunning={isRunning} actions={actions} onRename={askRename} />}
                    <span title={statusExplanation} data-testid="project-row-status">
                        <Text UNSAFE_className="project-row-status">{statusText}</Text>
                    </span>
                    <ChevronRight size="S" UNSAFE_className="project-row-chevron" />
                </Flex>
            </Flex>
        </div>
    );
}
