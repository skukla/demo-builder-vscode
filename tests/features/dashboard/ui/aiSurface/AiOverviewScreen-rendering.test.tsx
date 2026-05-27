/**
 * AiOverviewScreen Tests — Rendering
 *
 * Page chrome (PageLayout shell, header/footer), the single-column body
 * composition, and the prompt-library mount behavior. Shared setup lives in
 * AiOverviewScreen.testUtils.tsx.
 */

import { screen, within } from '@testing-library/react';
import {
    makeProjectWithUserPrompts,
    renderScreen,
} from './AiOverviewScreen.testUtils';

describe('AiOverviewScreen — rendering', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('page chrome', () => {
        it('renders PageHeader with title "Prompt Library"', async () => {
            await renderScreen();
            const header = screen.getByTestId('page-header');
            expect(header.querySelector('h1')?.textContent).toBe('Prompt Library');
        });

        it('renders PageHeader subtitle with the project name', async () => {
            await renderScreen({ projectOverrides: { name: 'Citi Signal Demo' } });
            expect(screen.getByTestId('page-header-subtitle').textContent).toBe('Citi Signal Demo');
        });

        it('renders PageLayout shell with header, body, footer + Close button', async () => {
            await renderScreen();
            expect(screen.getByTestId('page-layout')).toBeInTheDocument();
            expect(screen.getByTestId('page-layout-body')).toBeInTheDocument();
            expect(screen.getByTestId('page-footer')).toBeInTheDocument();
            expect(within(screen.getByTestId('page-footer')).getByRole('button', { name: /close/i })).toBeInTheDocument();
        });

        it('wraps body content in the centered .page-container-padded class', async () => {
            await renderScreen();
            const body = screen.getByTestId('page-layout-body');
            expect(body.querySelector('.page-container-padded')).not.toBeNull();
        });
    });

    describe('body (F4 single-column)', () => {
        it('does not render the inline capability list', async () => {
            await renderScreen();
            expect(screen.queryByTestId('ai-capability-list')).not.toBeInTheDocument();
        });

        it('does not render the removed "Open in Claude Code" CTA', async () => {
            await renderScreen();
            expect(screen.queryByRole('button', { name: /open in claude code/i })).not.toBeInTheDocument();
        });

        it('does not render the removed Learn more link', async () => {
            await renderScreen();
            expect(screen.queryByText(/learn more about ai integration/i)).not.toBeInTheDocument();
        });

        it('does not render the inline InstalledSkillsList (it now lives in a modal)', async () => {
            await renderScreen();
            const body = screen.getByTestId('page-layout-body');
            expect(within(body).queryByTestId('ai-installed-skills-list')).not.toBeInTheDocument();
        });

        it('renders the PromptGrid in the body (no curated section after G1)', async () => {
            await renderScreen();
            const body = screen.getByTestId('page-layout-body');
            expect(within(body).queryByText(/suggested prompts/i)).not.toBeInTheDocument();
            // With no user prompts, only the "+ New prompt" tile renders.
            expect(within(body).getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
            expect(within(body).queryAllByTestId('ai-prompt-card').length).toBe(0);
        });

        it('does NOT render a Refresh or Regenerate button in the body', async () => {
            // Both actions moved off the surface: Refresh is implicit on modal
            // open; Regenerate lives in the modal footer.
            await renderScreen();
            const body = screen.getByTestId('page-layout-body');
            expect(within(body).queryByRole('button', { name: /^refresh$/i })).not.toBeInTheDocument();
            expect(within(body).queryByRole('button', { name: /regenerate ai files/i })).not.toBeInTheDocument();
        });

        it('renders the quiet "View installed skills (N)" link beneath the grid', async () => {
            await renderScreen();
            const trigger = screen.getByTestId('ai-installed-skills-trigger');
            expect(trigger).toBeInTheDocument();
            expect(trigger.textContent).toMatch(/view installed skills \(3\)/i);
        });
    });

    describe('prompt library mount', () => {
        it('renders the grid and runs verify-ai-setup on mount', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: makeProjectWithUserPrompts(),
            });

            expect(screen.getByTestId('page-header')).toBeInTheDocument();
            expect(screen.getByTestId('ai-installed-skills-trigger')).toBeInTheDocument();
            const verifyCalls = (webviewClient.request as jest.Mock).mock.calls
                .filter(c => c[0] === 'verify-ai-setup');
            expect(verifyCalls.length).toBeGreaterThanOrEqual(1);
        });

        it('does NOT open the edit dialog on mount', async () => {
            await renderScreen({ projectOverrides: makeProjectWithUserPrompts() });

            expect(screen.queryByRole('heading', { name: /edit prompt/i })).not.toBeInTheDocument();
        });
    });
});
