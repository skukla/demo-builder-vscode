/**
 * Which view a list shows: the session's choice when there is one, else the
 * list's VS Code setting, else cards.
 *
 * The projects list and the integrations screen each had this as four lines
 * beside their own init payload; a third list would have copied them again. One
 * resolver, one setting-key table, one session store (`sessionUIState`).
 *
 * @module core/state/viewModePreference
 */

import * as vscode from 'vscode';
import { sessionUIState } from './sessionUIState';
import type { ViewMode, ViewModeList } from '@/types/viewMode';

/** The `demoBuilder.*` setting that holds each list's default view. */
export const VIEW_MODE_SETTING: Record<ViewModeList, 'projectsViewMode' | 'integrationsViewMode'> = {
    projects: 'projectsViewMode',
    integrations: 'integrationsViewMode',
};

/** The list's default view from its setting (cards when unset). Never the session's choice. */
export function readViewModeSetting(list: ViewModeList): ViewMode {
    return vscode.workspace
        .getConfiguration('demoBuilder')
        .get<ViewMode>(VIEW_MODE_SETTING[list], 'cards');
}

/** The view the list shows now: the session's choice over the setting. */
export function resolveViewMode(list: ViewModeList): ViewMode {
    return sessionUIState.getViewModeOverride(list) ?? readViewModeSetting(list);
}
