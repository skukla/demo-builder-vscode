/**
 * ProjectDashboardScreen - Live Authoring Experience Tests
 *
 * After a Configure save flips the authoring experience, the backend pushes an
 * `authoringExperienceUpdate` message. An already-open dashboard must update the
 * Author tile label (and the DA URL it opens) live — without a reopen.
 */

import { screen, waitFor } from '@testing-library/react';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen - Live Authoring Experience', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    it('renders the initial Author label from the authoringExperience prop', () => {
        renderDashboard({ isEds: true, authoringExperience: 'da-live-classic' });
        expect(screen.getByText(/Author in DA\.live Classic/i)).toBeInTheDocument();
    });

    it('updates the Author tile live when an authoringExperienceUpdate arrives', async () => {
        renderDashboard({ isEds: true, authoringExperience: 'da-live-classic' });

        expect(screen.getByText(/Author in DA\.live Classic/i)).toBeInTheDocument();

        ctx.triggerMessage('authoringExperienceUpdate', {
            authoringExperience: 'experience-workspace',
            edsDaLiveUrl: 'https://da.live/canvas#/my-org/my-site/index.html',
        });

        await waitFor(() => {
            expect(screen.getByText(/Author in Experience Workspace/i)).toBeInTheDocument();
        });
        expect(screen.queryByText(/Author in DA\.live Classic/i)).not.toBeInTheDocument();
    });

    it('keeps the existing label when the update omits the authoringExperience', async () => {
        renderDashboard({ isEds: true, authoringExperience: 'experience-workspace' });

        ctx.triggerMessage('authoringExperienceUpdate', {
            edsDaLiveUrl: 'https://da.live/canvas#/my-org/my-site/index.html',
        });

        await waitFor(() => {
            expect(screen.getByText(/Author in Experience Workspace/i)).toBeInTheDocument();
        });
    });
});
