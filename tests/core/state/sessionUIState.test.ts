/**
 * SessionUIState Tests
 *
 * Tests for centralized session-only UI state management.
 * This singleton manages panel visibility and view mode overrides.
 */

import { sessionUIState, ViewMode } from '@/core/state/sessionUIState';

describe('sessionUIState', () => {
    // Reset state before each test to ensure isolation
    beforeEach(() => {
        sessionUIState.reset();
    });

    describe('initial state', () => {
        it('should default isComponentsViewShown to false', () => {
            expect(sessionUIState.isComponentsViewShown).toBe(false);
        });

        it('should default isLogsViewShown to false', () => {
            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('should default viewModeOverride to undefined', () => {
            expect(sessionUIState.viewModeOverride).toBeUndefined();
        });
    });

    describe('panel visibility - isComponentsViewShown', () => {
        it('should set isComponentsViewShown to true', () => {
            sessionUIState.isComponentsViewShown = true;

            expect(sessionUIState.isComponentsViewShown).toBe(true);
        });

        it('should set isComponentsViewShown to false', () => {
            sessionUIState.isComponentsViewShown = true;
            sessionUIState.isComponentsViewShown = false;

            expect(sessionUIState.isComponentsViewShown).toBe(false);
        });

        it('should toggle isComponentsViewShown', () => {
            expect(sessionUIState.isComponentsViewShown).toBe(false);

            sessionUIState.isComponentsViewShown = !sessionUIState.isComponentsViewShown;
            expect(sessionUIState.isComponentsViewShown).toBe(true);

            sessionUIState.isComponentsViewShown = !sessionUIState.isComponentsViewShown;
            expect(sessionUIState.isComponentsViewShown).toBe(false);
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

    describe('view mode override', () => {
        it('should set viewModeOverride to cards', () => {
            sessionUIState.viewModeOverride = 'cards';

            expect(sessionUIState.viewModeOverride).toBe('cards');
        });

        it('should set viewModeOverride to rows', () => {
            sessionUIState.viewModeOverride = 'rows';

            expect(sessionUIState.viewModeOverride).toBe('rows');
        });

        it('should clear viewModeOverride by setting to undefined', () => {
            sessionUIState.viewModeOverride = 'cards';
            sessionUIState.viewModeOverride = undefined;

            expect(sessionUIState.viewModeOverride).toBeUndefined();
        });

        it('should allow changing viewModeOverride between values', () => {
            sessionUIState.viewModeOverride = 'cards';
            expect(sessionUIState.viewModeOverride).toBe('cards');

            sessionUIState.viewModeOverride = 'rows';
            expect(sessionUIState.viewModeOverride).toBe('rows');
        });
    });

    describe('reset() method', () => {
        it('should reset isComponentsViewShown to false', () => {
            sessionUIState.isComponentsViewShown = true;

            sessionUIState.reset();

            expect(sessionUIState.isComponentsViewShown).toBe(false);
        });

        it('should reset isLogsViewShown to false', () => {
            sessionUIState.isLogsViewShown = true;

            sessionUIState.reset();

            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('should reset viewModeOverride to undefined', () => {
            sessionUIState.viewModeOverride = 'cards';

            sessionUIState.reset();

            expect(sessionUIState.viewModeOverride).toBeUndefined();
        });

        it('should reset all state at once', () => {
            sessionUIState.isComponentsViewShown = true;
            sessionUIState.isLogsViewShown = true;
            sessionUIState.viewModeOverride = 'rows';

            sessionUIState.reset();

            expect(sessionUIState.isComponentsViewShown).toBe(false);
            expect(sessionUIState.isLogsViewShown).toBe(false);
            expect(sessionUIState.viewModeOverride).toBeUndefined();
        });
    });

    describe('resetPanelState() method', () => {
        it('should reset isComponentsViewShown to false', () => {
            sessionUIState.isComponentsViewShown = true;

            sessionUIState.resetPanelState();

            expect(sessionUIState.isComponentsViewShown).toBe(false);
        });

        it('should reset isLogsViewShown to false', () => {
            sessionUIState.isLogsViewShown = true;

            sessionUIState.resetPanelState();

            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('should preserve viewModeOverride', () => {
            sessionUIState.viewModeOverride = 'cards';
            sessionUIState.isComponentsViewShown = true;
            sessionUIState.isLogsViewShown = true;

            sessionUIState.resetPanelState();

            expect(sessionUIState.viewModeOverride).toBe('cards');
        });

        it('should reset panel state while preserving view mode', () => {
            sessionUIState.isComponentsViewShown = true;
            sessionUIState.isLogsViewShown = true;
            sessionUIState.viewModeOverride = 'rows';

            sessionUIState.resetPanelState();

            expect(sessionUIState.isComponentsViewShown).toBe(false);
            expect(sessionUIState.isLogsViewShown).toBe(false);
            expect(sessionUIState.viewModeOverride).toBe('rows');
        });
    });

    describe('singleton behavior', () => {
        it('should return the same instance on multiple imports', () => {
            // Modify state
            sessionUIState.isComponentsViewShown = true;
            sessionUIState.viewModeOverride = 'rows';

            // Require the module again - should get same instance
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { sessionUIState: sameInstance } = require('@/core/state/sessionUIState');

            expect(sameInstance.isComponentsViewShown).toBe(true);
            expect(sameInstance.viewModeOverride).toBe('rows');
        });
    });

    describe('type safety - ViewMode', () => {
        it('should accept cards as valid ViewMode', () => {
            const mode: ViewMode = 'cards';
            sessionUIState.viewModeOverride = mode;

            expect(sessionUIState.viewModeOverride).toBe('cards');
        });

        it('should accept rows as valid ViewMode', () => {
            const mode: ViewMode = 'rows';
            sessionUIState.viewModeOverride = mode;

            expect(sessionUIState.viewModeOverride).toBe('rows');
        });
    });
});
