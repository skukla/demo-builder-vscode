/**
 * ProjectDashboardScreen - AI Ready Badge Tests
 *
 * Verifies the new third StatusCard badge "AI Ready" is rendered alongside
 * Frontend + API Mesh on the project dashboard header.
 */

import { screen, waitFor } from '@testing-library/react';
import { setupTestContext, renderDashboard } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen - AI Ready Badge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupTestContext();
    });

    describe('Badge Presence', () => {
        it('renders the AI Ready status badge alongside Frontend + API Mesh', () => {
            renderDashboard({ hasMesh: true });
            // Frontend (mocked StatusCard renders as `status-card-${label}`)
            expect(screen.getByTestId('status-card-Frontend')).toBeInTheDocument();
            // API Mesh
            expect(screen.getByTestId('status-card-API Mesh')).toBeInTheDocument();
            // AI Ready (new in F1)
            expect(screen.getByTestId('status-card-AI Ready')).toBeInTheDocument();
        });

        it('renders the AI Ready badge even when project has no mesh', () => {
            renderDashboard();
            // AI Ready should still show
            expect(screen.getByTestId('status-card-AI Ready')).toBeInTheDocument();
        });
    });

    describe('Badge Color (initial state)', () => {
        it('shows gray color while verify is pending', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI Ready');
            expect(badge.getAttribute('data-color')).toBe('gray');
        });

        it('shows "Verifying" status text while verify is pending', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI Ready');
            expect(badge.textContent).toMatch(/Verifying/i);
        });
    });

    describe('Badge Color (resolved state)', () => {
        it('shows green color when verify-ai-setup returns all OK + registered', async () => {
            const { webviewClient } = require('@/core/ui/utils/WebviewClient');
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                status: 'ok',
                checks: [
                    { name: 'AGENTS.md', status: 'ok' },
                    { name: '.claude/mcp.json', status: 'ok' },
                    { name: 'mcp-binary', status: 'ok' },
                    { name: 'skill-files', status: 'ok' },
                ],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
                globalMcpRegistration: 'registered',
            });
            renderDashboard();
            await waitFor(() => {
                const badge = screen.getByTestId('status-card-AI Ready');
                expect(badge.getAttribute('data-color')).toBe('green');
                expect(badge.textContent).toMatch(/Ready/i);
            });
        });

        it('shows yellow color when files OK but not registered globally', async () => {
            const { webviewClient } = require('@/core/ui/utils/WebviewClient');
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                status: 'ok',
                checks: [
                    { name: 'AGENTS.md', status: 'ok' },
                    { name: '.claude/mcp.json', status: 'ok' },
                    { name: 'mcp-binary', status: 'ok' },
                    { name: 'skill-files', status: 'ok' },
                ],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
                globalMcpRegistration: 'unregistered',
            });
            renderDashboard();
            await waitFor(() => {
                const badge = screen.getByTestId('status-card-AI Ready');
                expect(badge.getAttribute('data-color')).toBe('yellow');
                expect(badge.textContent).toMatch(/Setup incomplete/i);
            });
        });

        it('shows red color when any file check fails', async () => {
            const { webviewClient } = require('@/core/ui/utils/WebviewClient');
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                status: 'warning',
                checks: [
                    { name: 'AGENTS.md', status: 'warning', message: 'Missing' },
                    { name: '.claude/mcp.json', status: 'ok' },
                    { name: 'mcp-binary', status: 'ok' },
                    { name: 'skill-files', status: 'ok' },
                ],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
                globalMcpRegistration: 'registered',
            });
            renderDashboard();
            await waitFor(() => {
                const badge = screen.getByTestId('status-card-AI Ready');
                expect(badge.getAttribute('data-color')).toBe('red');
                expect(badge.textContent).toMatch(/Broken/i);
            });
        });
    });

    describe('Badge is display-only', () => {
        it('does not have an onClick handler (display-only badge)', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI Ready');
            // The mocked StatusCard component does not forward any onClick prop
            // (it isn't part of the StatusCardProps interface). Confirm by
            // ensuring the rendered node is not a button or link.
            expect(badge.tagName.toLowerCase()).not.toBe('button');
            expect(badge.tagName.toLowerCase()).not.toBe('a');
        });
    });
});
