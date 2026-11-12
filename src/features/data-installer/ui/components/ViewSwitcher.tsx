/**
 * ViewSwitcher — a free switch between the Data Installer panel's views.
 *
 * Feature-local by intent, per `reuse-first`. What was considered and rejected:
 *
 *   - `navigation/StepRail` — a *step* rail, where `upcoming` and `locked` are
 *     non-actionable by design. These views are all reachable all the time, so
 *     using it would mean lying about every tab's status to get it clickable.
 *   - Spectrum `Tabs` — zero consumers in this repo; introducing it here would
 *     mean a second tab vocabulary beside `StepRail` for one panel.
 *
 * Toggle semantics come from `aria-pressed`, the treatment `ChoiceCard` already
 * uses for a pressed choice. It promotes to `core/ui` when a second surface wants
 * it, not before.
 *
 * Presentational and fully controlled: the parent owns `activeId`. A switcher for
 * a single view is chrome with nothing to switch, so it renders nothing — which is
 * what lets the catalog ship alone and the installed/activity views arrive later
 * without a placeholder tab in between.
 *
 * @module features/data-installer/ui/components/ViewSwitcher
 */

import { ActionButton, Text } from '@adobe/react-spectrum';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

/** One switchable view. */
export interface SwitchableView {
    /** Stable id, handed back to `onSelect`. */
    id: string;
    /** Button label. */
    label: string;
    /**
     * Drawn in its place but not choosable: a view that has nothing in it this time, kept so every
     * screen using the switch has one layout (the Clear spot check's Kept view, 2026-11-11).
     */
    isDisabled?: boolean;
    /**
     * Drawn after the label, inside the button: a status dot tying the view to the same dot beside
     * the item it belongs to (the Clear spot check's Kept view, 2026-11-11).
     */
    marker?: React.ReactNode;
}

export interface ViewSwitcherProps {
    /** Views to offer, left to right. */
    views: SwitchableView[];
    /** Id of the view currently on screen. */
    activeId: string;
    /** Fires for every press, including a re-press of the active view. */
    onSelect: (id: string) => void;
}

export function ViewSwitcher({
    views,
    activeId,
    onSelect,
}: ViewSwitcherProps): React.JSX.Element | null {
    if (views.length < 2) {
        return null;
    }

    return (
        <div className="view-switcher">
            {views.map((view) => (
                <ActionButton
                    key={view.id}
                    isQuiet
                    isDisabled={view.isDisabled}
                    aria-pressed={view.id === activeId}
                    UNSAFE_className={cn(
                        'view-switcher-button',
                        view.id === activeId && 'is-active',
                    )}
                    onPress={() => onSelect(view.id)}
                >
                    {view.marker ? (
                        // One child: Spectrum's button lays out a `Text` slot apart from other
                        // children, which put the marker before the label.
                        <Text>
                            {view.label}
                            <span className="view-switcher-marker">{view.marker}</span>
                        </Text>
                    ) : (
                        view.label
                    )}
                </ActionButton>
            ))}
        </div>
    );
}
