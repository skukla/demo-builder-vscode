/**
 * SessionUIState Tests
 *
 * Tests for centralized session-only UI state management.
 * This singleton manages panel visibility and view mode overrides.
 */

import { sessionUIState } from '@/core/state/sessionUIState';
import type { ViewMode } from '@/types/viewMode';

describe('sessionUIState', () => {
    // Reset state before each test to ensure isolation
    beforeEach(() => {
        sessionUIState.reset();
    });

    describe('initial state', () => {
        it('should default isLogsViewShown to false', () => {
            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('holds no view choice for any list', () => {
            expect(sessionUIState.getViewModeOverride('projects')).toBeUndefined();
            expect(sessionUIState.getViewModeOverride('integrations')).toBeUndefined();
        });
    });

    // Each list's toggle is its own choice: switching the projects list to rows
    // must not switch the integrations screen, and vice versa.
    describe('view mode overrides, per list', () => {
        it('keeps each list apart', () => {
            sessionUIState.setViewModeOverride('projects', 'rows');
            sessionUIState.setViewModeOverride('integrations', 'cards');

            expect(sessionUIState.getViewModeOverride('projects')).toBe('rows');
            expect(sessionUIState.getViewModeOverride('integrations')).toBe('cards');
        });

        it('forgets a list\'s choice when set to undefined', () => {
            sessionUIState.setViewModeOverride('projects', 'rows');
            sessionUIState.setViewModeOverride('projects', undefined);

            expect(sessionUIState.getViewModeOverride('projects')).toBeUndefined();
        });

        it('is cleared by reset', () => {
            sessionUIState.setViewModeOverride('integrations', 'rows');
            sessionUIState.reset();

            expect(sessionUIState.getViewModeOverride('integrations')).toBeUndefined();
        });
    });

    describe('panel visibility - isLogsViewShown', () => {
        it('should set isLogsViewShown to true', () => {
            sessionUIState.isLogsViewShown = true;

            expect(sessionUIState.isLogsViewShown).toBe(true);
        });

        it('should set isLogsViewShown to false', () => {
            sessionUIState.isLogsViewShown = true;
            sessionUIState.isLogsViewShown = false;

            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('should toggle isLogsViewShown', () => {
            expect(sessionUIState.isLogsViewShown).toBe(false);

            sessionUIState.isLogsViewShown = !sessionUIState.isLogsViewShown;
            expect(sessionUIState.isLogsViewShown).toBe(true);

            sessionUIState.isLogsViewShown = !sessionUIState.isLogsViewShown;
            expect(sessionUIState.isLogsViewShown).toBe(false);
        });
    });

    describe('view mode override (the projects list, through the keyed API)', () => {
        it('should set viewModeOverride to cards', () => {
            sessionUIState.setViewModeOverride('projects', 'cards');

            expect(sessionUIState.getViewModeOverride('projects')).toBe('cards');
        });

        it('should set viewModeOverride to rows', () => {
            sessionUIState.setViewModeOverride('projects', 'rows');

            expect(sessionUIState.getViewModeOverride('projects')).toBe('rows');
        });

        it('should clear viewModeOverride by setting to undefined', () => {
            sessionUIState.setViewModeOverride('projects', 'cards');
            sessionUIState.setViewModeOverride('projects', undefined);

            expect(sessionUIState.getViewModeOverride('projects')).toBeUndefined();
        });

        it('should allow changing viewModeOverride between values', () => {
            sessionUIState.setViewModeOverride('projects', 'cards');
            expect(sessionUIState.getViewModeOverride('projects')).toBe('cards');

            sessionUIState.setViewModeOverride('projects', 'rows');
            expect(sessionUIState.getViewModeOverride('projects')).toBe('rows');
        });
    });

    describe('reset() method', () => {
        it('should reset isLogsViewShown to false', () => {
            sessionUIState.isLogsViewShown = true;

            sessionUIState.reset();

            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('should reset viewModeOverride to undefined', () => {
            sessionUIState.setViewModeOverride('projects', 'cards');

            sessionUIState.reset();

            expect(sessionUIState.getViewModeOverride('projects')).toBeUndefined();
        });

        it('should reset all state at once', () => {
            sessionUIState.isLogsViewShown = true;
            sessionUIState.setViewModeOverride('projects', 'rows');

            sessionUIState.reset();

            expect(sessionUIState.isLogsViewShown).toBe(false);
            expect(sessionUIState.getViewModeOverride('projects')).toBeUndefined();
        });
    });

    describe('field initialisers', () => {
        // Every other test runs after `reset()`, which assigns the same values the
        // field initialisers do — so a freshly constructed instance is the only place
        // the initialisers are observable. A module registry reset gives one.
        it('should start a brand-new instance with the logs view hidden', () => {
            jest.isolateModules(() => {
                const fresh = require('@/core/state/sessionUIState').sessionUIState;

                expect(fresh.isLogsViewShown).toBe(false);
                expect(fresh.getViewModeOverride('projects')).toBeUndefined();
            });
        });
    });

    describe('singleton behavior', () => {
        it('should return the same instance on multiple imports', () => {
            // Modify state
            sessionUIState.isLogsViewShown = true;
            sessionUIState.setViewModeOverride('projects', 'rows');

            // Require the module again - should get same instance

            const { sessionUIState: sameInstance } = require('@/core/state/sessionUIState');

            expect(sameInstance.isLogsViewShown).toBe(true);
            expect(sameInstance.getViewModeOverride('projects')).toBe('rows');
        });
    });

    describe('type safety - ViewMode', () => {
        it('should accept cards as valid ViewMode', () => {
            const mode: ViewMode = 'cards';
            sessionUIState.setViewModeOverride('projects', mode);

            expect(sessionUIState.getViewModeOverride('projects')).toBe('cards');
        });

        it('should accept rows as valid ViewMode', () => {
            const mode: ViewMode = 'rows';
            sessionUIState.setViewModeOverride('projects', mode);

            expect(sessionUIState.getViewModeOverride('projects')).toBe('rows');
        });
    });
});
