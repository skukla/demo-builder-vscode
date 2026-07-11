/**
 * ProjectDashboardScreen - Authoring Tile Tests
 *
 * The Author tile label is STATIC ("Author Content") — the resolved authoring
 * experience decides WHERE the action opens (backend-side), never the tile
 * text. A Configure save still pushes `authoringExperienceUpdate` (the live
 * DA URL rides on it); the tile must not react to it.
 */

import { screen } from '@testing-library/react';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen - Authoring tile', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    it('renders the static "Author Content" tile for EDS projects', () => {
        renderDashboard({ isEds: true });
        expect(screen.getByText('Author Content')).toBeInTheDocument();
        expect(screen.queryByText(/Author in/)).not.toBeInTheDocument();
    });

    it('keeps the static label when an authoringExperienceUpdate arrives', () => {
        renderDashboard({ isEds: true });

        ctx.triggerMessage('authoringExperienceUpdate', {
            authoringExperience: 'experience-workspace',
            edsDaLiveUrl: 'https://da.live/canvas#/my-org/my-site/index',
        });

        expect(screen.getByText('Author Content')).toBeInTheDocument();
        expect(screen.queryByText(/Author in/)).not.toBeInTheDocument();
    });
});
