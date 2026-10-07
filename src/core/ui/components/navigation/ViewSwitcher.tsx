/**
 * ViewSwitcher — a free switch between a panel's views, drawn as tabs on a rule.
 *
 * Used by the Data Installer (Catalog, Activity) and Site access (Site admins,
 * Content readers); promoted from the Data Installer when Site access became its
 * second surface (2026-10-07). Its styles are `core/ui/styles/view-switcher.css`,
 * which a bundle rendering it must import. What was considered and rejected:
 *
 *   - `navigation/StepRail` — a *step* rail, where `upcoming` and `locked` are
 *     non-actionable by design. These views are all reachable all the time, so
 *     using it would mean lying about every tab's status to get it clickable.
 *   - Spectrum `Tabs` — zero consumers in this repo; introducing it here would
 *     mean a second tab vocabulary beside `StepRail` for one panel.
 *
 * Toggle semantics come from `aria-pressed`, the treatment `ChoiceCard` already
 * uses for a pressed choice.
 *
 * Presentational and fully controlled: the parent owns `activeId`. A switcher for
 * a single view is chrome with nothing to switch, so it renders nothing — which is
 * what lets the catalog ship alone and the installed/activity views arrive later
 * without a placeholder tab in between.
 *
 * @module core/ui/components/navigation/ViewSwitcher
 */

import { ActionButton } from '@adobe/react-spectrum';
import React from 'react';

/** One switchable view. */
export interface SwitchableView {
    /** Stable id, handed back to `onSelect`. */
    id: string;
    /** Button label. */
    label: string;
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
                    aria-pressed={view.id === activeId}
                    UNSAFE_className={
                        view.id === activeId ? 'view-switcher-button is-active' : 'view-switcher-button'
                    }
                    onPress={() => onSelect(view.id)}
                >
                    {view.label}
                </ActionButton>
            ))}
        </div>
    );
}
