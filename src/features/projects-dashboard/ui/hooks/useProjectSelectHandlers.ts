/**
 * useProjectSelectHandlers — the click/keyboard contract for a project tile.
 *
 * Both project surfaces (`ProjectCard`, `ProjectRow`) are div-role buttons that
 * open a project, and both honour the VS Code modifier convention: shift or cmd
 * opens it in a NEW window (as Open Recent does). They had each written the pair
 * out (duplication scan, 2026-07-31) — and a divergence here would mean the card
 * and list views behaved differently for the same gesture.
 *
 * @module features/projects-dashboard/ui/hooks/useProjectSelectHandlers
 */

import { useCallback } from 'react';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import type { Project } from '@/types/base';

/** How a surface opens a project; `forceNewWindow` requests a new VS Code window. */
export type ProjectSelectHandler = (
    project: Project,
    opts?: { forceNewWindow?: boolean },
) => void;

/**
 * Build the click + keydown handlers for a project tile.
 *
 * Keyboard deliberately honours SHIFT only: there is no cmd-Enter convention for
 * this in VS Code, and binding meta here would swallow other shortcuts.
 *
 * @param project - the project this tile represents
 * @param onSelect - the surface's open-project callback
 * @returns handlers to spread onto the tile's `onClick` / `onKeyDown`
 */
export function useProjectSelectHandlers(project: Project, onSelect: ProjectSelectHandler) {
    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            // Shift-click / Cmd-click → open in a new VS Code window (standard
            // VS Code modifier convention for Open Recent et al.).
            if (e.shiftKey || e.metaKey) {
                onSelect(project, { forceNewWindow: true });
            } else {
                onSelect(project);
            }
        },
        [project, onSelect],
    );

    const handleKeyDown = useActivateOnKey((e) => {
        // SHIFT only: there is no cmd-Enter convention for this in VS Code, and
        // binding meta here would swallow other shortcuts.
        if (e.shiftKey) {
            onSelect(project, { forceNewWindow: true });
        } else {
            onSelect(project);
        }
    });

    return { handleClick, handleKeyDown };
}
