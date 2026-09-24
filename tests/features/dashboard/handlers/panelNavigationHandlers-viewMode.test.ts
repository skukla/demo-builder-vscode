/**
 * The integrations screen's cards/rows choice is kept for the session
 * (owner, 2026-09-24) — the projects list's `handleSetViewModeOverride`, for the
 * other list. Held apart from it: switching one list never switches the other.
 */

import { handleSetIntegrationsViewModeOverride } from '@/features/dashboard/handlers/panelNavigationHandlers';
import { sessionUIState } from '@/core/state/sessionUIState';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

describe('handleSetIntegrationsViewModeOverride', () => {
    beforeEach(() => sessionUIState.reset());

    it('records the requested view on the session state and answers success', async () => {
        const result = await handleSetIntegrationsViewModeOverride(createMockHandlerContext(), {
            viewMode: 'rows',
        });

        expect(sessionUIState.integrationsViewModeOverride).toBe('rows');
        expect(result).toEqual({ success: true });
    });

    it('leaves the projects list alone', async () => {
        sessionUIState.viewModeOverride = 'cards';

        await handleSetIntegrationsViewModeOverride(createMockHandlerContext(), { viewMode: 'rows' });

        expect(sessionUIState.viewModeOverride).toBe('cards');
    });

    it('ignores a payload that names neither view', async () => {
        sessionUIState.integrationsViewModeOverride = 'rows';

        const result = await handleSetIntegrationsViewModeOverride(
            createMockHandlerContext(),
            { viewMode: 'tiles' } as unknown as { viewMode: 'cards' | 'rows' },
        );

        expect(sessionUIState.integrationsViewModeOverride).toBe('rows');
        expect(result).toEqual({ success: true });
    });
});
