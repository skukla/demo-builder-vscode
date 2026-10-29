/**
 * setViewModeOverride — one handler for every list's cards/rows toggle
 * (extracted 2026-09-24). It records exactly the list the payload names,
 * refuses nothing loudly (the webview has already switched), and ignores a
 * payload that names an unknown list or view rather than recording garbage.
 */

import { handleSetViewModeOverride } from '@/core/handlers/viewModeHandler';
import { sessionUIState } from '@/core/state/sessionUIState';
import type { SetViewModeOverridePayload } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../helpers/handlerContextTestHelpers';

describe('handleSetViewModeOverride', () => {
    beforeEach(() => sessionUIState.reset());

    it('records the named list\'s view and answers success', async () => {
        const result = await handleSetViewModeOverride(createMockHandlerContext(), {
            list: 'integrations',
            viewMode: 'rows',
        });

        expect(sessionUIState.getViewModeOverride('integrations')).toBe('rows');
        expect(sessionUIState.getViewModeOverride('projects')).toBeUndefined();
        expect(result).toEqual({ success: true });
    });

    it('serves the projects list through the same door', async () => {
        await handleSetViewModeOverride(createMockHandlerContext(), { list: 'projects', viewMode: 'rows' });

        expect(sessionUIState.getViewModeOverride('projects')).toBe('rows');
    });

    it.each([
        ['an unknown list', { list: 'datapacks', viewMode: 'rows' }],
        ['an unknown view', { list: 'projects', viewMode: 'tiles' }],
        ['no payload', undefined],
    ])('ignores %s and still answers success', async (_what, payload) => {
        sessionUIState.setViewModeOverride('projects', 'cards');

        const result = await handleSetViewModeOverride(
            createMockHandlerContext(),
            payload as unknown as SetViewModeOverridePayload,
        );

        expect(sessionUIState.getViewModeOverride('projects')).toBe('cards');
        expect(result).toEqual({ success: true });
    });
});
