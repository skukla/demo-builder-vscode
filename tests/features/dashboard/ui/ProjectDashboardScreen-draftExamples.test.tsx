/**
 * ProjectDashboardScreen — the Draft Examples tile's wiring (EDS-71 step 4c, review F10): the
 * count arrives on the status push and becomes the tile's dot and hover; the tile is offered on
 * an EDS storefront only; pressing it opens the AI with the Draft Block Examples prompt.
 */

import { fireEvent, screen } from '@testing-library/react';
import { setupTestContext, renderDashboard, type TestContext } from './ProjectDashboardScreen.testUtils';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DRAFT_BLOCK_EXAMPLES_PROMPT } from '@/features/dashboard/services/draftBlockExamplesPrompt';

const PROJECT = { name: asDisplayName('Scratch'), path: '/p/scratch' };

function statusWith(blocksNeedingExamples?: number) {
    return {
        name: 'Scratch',
        path: '/p/scratch',
        status: 'ready',
        ...(blocksNeedingExamples !== undefined ? { blocksNeedingExamples } : {}),
    };
}

describe('ProjectDashboardScreen - Draft Examples', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    it('dots the tile with the count the status push carries', () => {
        renderDashboard({ project: PROJECT, isEds: true });
        ctx.triggerMessage('statusUpdate', statusWith(13));

        expect(screen.getByTestId('draft-examples-tile-dot')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Draft Examples, 13 blocks have no example' }))
            .toBeInTheDocument();
    });

    it('asks for Refresh Blocks, with no dot, when the status carries no count', () => {
        renderDashboard({ project: PROJECT, isEds: true });
        ctx.triggerMessage('statusUpdate', statusWith());

        expect(screen.queryByTestId('draft-examples-tile-dot')).not.toBeInTheDocument();
        expect(screen.getByText('Refresh Blocks to check which blocks have no example')).toBeInTheDocument();
    });

    it('is not offered on a project with no storefront', () => {
        renderDashboard({ project: PROJECT, isEds: false });
        ctx.triggerMessage('statusUpdate', statusWith(3));

        expect(screen.queryByText('Draft Examples')).not.toBeInTheDocument();
    });

    it('opens the AI with the Draft Block Examples prompt when pressed', () => {
        renderDashboard({ project: PROJECT, isEds: true });
        ctx.triggerMessage('statusUpdate', statusWith(2));

        fireEvent.click(screen.getByText('Draft Examples'));

        expect(webviewClient.postMessage).toHaveBeenCalledWith(
            'openInClaude',
            { prompt: DRAFT_BLOCK_EXAMPLES_PROMPT.prompt },
        );
    });
});
