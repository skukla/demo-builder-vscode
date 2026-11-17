/**
 * ProjectDashboardScreen — Finish Setup (PL-101): the steps arrive on the status push, the plain
 * "N steps remaining" line opens the guide, the end screen's Finish Setup opens it on arrival, and
 * the tile that fixes an open step wears the dot.
 *
 * The guide's body is the shared SetupGuide, which renders Spectrum's dialog: this suite's mock
 * wall has no Dialog, so it is stubbed to the props the screen hands it (its title and steps).
 * The real guide is driven in `components/FinishSetup.test.tsx`.
 */

jest.mock('@/features/dashboard/ui/components/integrations/SetupGuide', () => ({
    SetupGuide: ({ title, items }: { title: string; items: Array<{ id: string }> }) => (
        <div data-testid="finish-setup-guide">
            {title}: {items.map((item) => item.id).join(',')}
        </div>
    ),
}));

import { fireEvent, screen } from '@testing-library/react';
import { setupTestContext, renderDashboard, type TestContext } from './ProjectDashboardScreen.testUtils';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { FinishSetupStatus } from '@/types/webviewPayloads';

const CODE: SetupChecklistItem = {
    id: 'republish-code',
    title: 'Republish the Code',
    why: 'The live site does not serve scripts/a.js yet.',
    where: 'Project Dashboard > Republish',
    state: 'open',
    checkable: true,
    applicable: true,
};

const PROJECT = { name: asDisplayName('Scratch'), path: '/p/scratch' };

function statusWith(finishSetup?: FinishSetupStatus) {
    return { name: 'Scratch', path: '/p/scratch', status: 'ready', ...(finishSetup ? { finishSetup } : {}) };
}

describe('ProjectDashboardScreen - Finish Setup', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    it('shows "1 step remaining" with Finish Setup, which opens the guide titled for the project', () => {
        renderDashboard({ project: PROJECT, isEds: true });
        ctx.triggerMessage('statusUpdate', statusWith({ items: [CODE], remaining: 1, republishDue: true }));

        expect(screen.getByText('1 step remaining')).toBeInTheDocument();
        expect(screen.queryByTestId('finish-setup-guide')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Finish Setup'));

        expect(screen.getByTestId('finish-setup-guide')).toHaveTextContent(
            'Finish Setup: Scratch: republish-code',
        );
    });

    it('dots Republish while Republish the Code is open', () => {
        renderDashboard({ project: PROJECT, isEds: true });
        ctx.triggerMessage('statusUpdate', statusWith({ items: [CODE], remaining: 1, republishDue: true }));

        expect(screen.getByTestId('republish-tile-dot')).toBeInTheDocument();
    });

    it('shows no line when every step is done or skipped', () => {
        renderDashboard({ project: PROJECT, isEds: true });
        ctx.triggerMessage('statusUpdate', statusWith({ items: [{ ...CODE, state: 'done' }], remaining: 0 }));

        expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
        expect(screen.queryByText('Finish Setup')).not.toBeInTheDocument();
    });

    it('opens the guide by itself when opened from the end screen, once the steps arrive', () => {
        renderDashboard({ project: PROJECT, isEds: true, openFinishSetup: true });
        expect(screen.queryByTestId('finish-setup-guide')).not.toBeInTheDocument();

        ctx.triggerMessage('statusUpdate', statusWith({ items: [CODE], remaining: 1, republishDue: true }));

        expect(screen.getByTestId('finish-setup-guide')).toBeInTheDocument();
    });
});
