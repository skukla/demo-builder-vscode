/**
 * resolveViewMode — the session's choice over the list's setting, else cards.
 * One resolver for every list that offers the toggle (extracted 2026-09-24 from
 * the projects list and the integrations screen, which had it twice).
 */

import { sessionUIState } from '@/core/state/sessionUIState';
import {
    readViewModeSetting,
    resolveViewMode,
    VIEW_MODE_SETTING,
} from '@/core/state/viewModePreference';

const vscode = require('vscode');

function settingAnswers(values: Record<string, string>) {
    vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn((key: string, fallback: string) => values[key] ?? fallback),
    });
}

describe('viewModePreference', () => {
    beforeEach(() => {
        sessionUIState.reset();
        settingAnswers({});
    });

    it('names a distinct setting per list', () => {
        expect(VIEW_MODE_SETTING.projects).toBe('projectsViewMode');
        expect(VIEW_MODE_SETTING.integrations).toBe('integrationsViewMode');
    });

    it('reads each list its own setting, cards when unset', () => {
        settingAnswers({ integrationsViewMode: 'rows' });

        expect(readViewModeSetting('integrations')).toBe('rows');
        expect(readViewModeSetting('projects')).toBe('cards');
        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder');
    });

    it("the session's choice wins over the setting", () => {
        settingAnswers({ projectsViewMode: 'cards' });
        sessionUIState.setViewModeOverride('projects', 'rows');

        expect(resolveViewMode('projects')).toBe('rows');
    });

    it("one list's choice never reaches another", () => {
        settingAnswers({ integrationsViewMode: 'cards' });
        sessionUIState.setViewModeOverride('projects', 'rows');

        expect(resolveViewMode('integrations')).toBe('cards');
    });
});
