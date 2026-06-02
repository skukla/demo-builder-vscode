/**
 * AiCapabilitiesModal Tests
 *
 * The capability catalog reached from the dashboard's "View AI Capabilities" link:
 * a lean two-section modal showing what the AI can do in this project — skills
 * (markdown procedural guides) and MCPs (programmatic tool servers). Empty and
 * error states use plain language. Footer carries a Regenerate AI files action.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { AiCapabilitiesModal } from '@/features/dashboard/ui/components/AiCapabilitiesModal';
import type { SkillInventoryEntry, McpInventoryEntry } from '@/types/ai';
import '@testing-library/jest-dom';

const SKILLS: SkillInventoryEntry[] = [
    { name: 'Add a component', description: 'Adds a component to your project', path: '/p/.claude/skills/add-component.md', source: 'demo-builder' },
    { name: 'Sync changes', description: null, path: '/p/.claude/skills/sync-changes.md', source: 'demo-builder' },
];

const MCPS: McpInventoryEntry[] = [
    {
        id: 'demo-builder',
        status: 'ok',
        tools: [
            { name: 'list_projects', description: 'List Demo Builder projects' },
            { name: 'get_project', description: 'Read project state' },
        ],
    },
    {
        id: 'playwright',
        status: 'ok',
        tools: [
            { name: 'browser_navigate', description: 'Navigate' },
            { name: 'browser_snapshot', description: 'Snapshot' },
            { name: 'browser_take_screenshot', description: 'Screenshot' },
        ],
    },
];

function renderModal(props: Partial<React.ComponentProps<typeof AiCapabilitiesModal>> = {}) {
    const onClose = jest.fn();
    const onRegenerate = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <AiCapabilitiesModal
                skills={props.skills ?? []}
                mcps={props.mcps ?? []}
                onClose={onClose}
                onRegenerate={onRegenerate}
                hasSkillsError={props.hasSkillsError}
                hasMcpsError={props.hasMcpsError}
                isBusy={props.isBusy}
                progress={props.progress}
            />
        </Provider>,
    );
    return { onClose, onRegenerate };
}

describe('AiCapabilitiesModal', () => {
    beforeEach(() => jest.clearAllMocks());

    // ─── Skills section ──────────────────────────────────────────────────────
    // Detailed skills-list behavior (grouping, disclosure, sorting) lives in
    // AiSkillsList.test.tsx; this suite only checks integration into the modal.

    it('renders the skills summary line', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        expect(screen.getByTestId('ai-skills-summary')).toHaveTextContent(/2 installed/);
    });

    it('does not surface skill names by default (skills are collapsed)', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        expect(screen.queryByText('Add a component')).not.toBeInTheDocument();
        expect(screen.queryByText('Sync changes')).not.toBeInTheDocument();
    });

    it('frames the surface as capability discovery, not a health check', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        expect(screen.getByText(/what the ai can do/i)).toBeInTheDocument();
    });

    it('shows a plain-language empty state for skills when none are installed', () => {
        renderModal({ skills: [], mcps: MCPS });
        expect(screen.getByTestId('ai-skills-empty')).toBeInTheDocument();
    });

    it('shows an error row when the skill inspector errored', () => {
        renderModal({ skills: [], mcps: MCPS, hasSkillsError: true });
        expect(screen.getByTestId('ai-skills-error')).toBeInTheDocument();
    });

    // ─── MCPs section ────────────────────────────────────────────────────────

    it('lists each MCP server by id', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        expect(screen.getByText(/demo-builder/i)).toBeInTheDocument();
        expect(screen.getByText(/playwright/i)).toBeInTheDocument();
    });

    it('shows the tool count for each healthy MCP', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        // demo-builder has 2 tools, playwright has 3 tools
        expect(screen.getByTestId('ai-mcp-demo-builder')).toHaveTextContent(/2 tools/i);
        expect(screen.getByTestId('ai-mcp-playwright')).toHaveTextContent(/3 tools/i);
    });

    it('shows a plain-language empty state for MCPs when none are wired', () => {
        renderModal({ skills: SKILLS, mcps: [] });
        expect(screen.getByTestId('ai-mcps-empty')).toBeInTheDocument();
    });

    it('shows an error row when the MCP inspector errored', () => {
        renderModal({ skills: SKILLS, mcps: [], hasMcpsError: true });
        expect(screen.getByTestId('ai-mcps-error')).toBeInTheDocument();
    });

    it('flags MCP servers that timed out during inspection', () => {
        const stuck: McpInventoryEntry[] = [{ id: 'slow-server', status: 'timeout' }];
        renderModal({ skills: SKILLS, mcps: stuck });
        expect(screen.getByTestId('ai-mcp-slow-server')).toHaveTextContent(/timed out|timeout/i);
    });

    it('flags MCP servers that errored during inspection', () => {
        const broken: McpInventoryEntry[] = [{ id: 'broken-server', status: 'error', error: 'boom' }];
        renderModal({ skills: SKILLS, mcps: broken });
        expect(screen.getByTestId('ai-mcp-broken-server')).toHaveTextContent(/error|failed/i);
    });

    // ─── Actions ─────────────────────────────────────────────────────────────

    it('fires onRegenerate when "Regenerate AI files" is pressed', () => {
        const { onRegenerate } = renderModal({ skills: SKILLS, mcps: MCPS });
        fireEvent.click(screen.getByRole('button', { name: /regenerate ai files/i }));
        expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('disables Regenerate while a verify/regenerate operation is busy', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true });
        // The shared Modal renders actions as accessible div-buttons (aria-disabled),
        // not native <button disabled>.
        expect(screen.getByRole('button', { name: /regenerating/i }))
            .toHaveAttribute('aria-disabled', 'true');
    });

    it('changes the action label to "Regenerating…" while busy so the disabled state has visible cause', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true });
        expect(screen.queryByRole('button', { name: /^regenerate ai files$/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /regenerating/i })).toBeInTheDocument();
    });

    it('replaces the body with a centered loading state while a regenerate is in flight', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true });
        const loading = screen.getByTestId('ai-capabilities-loading');
        expect(loading).toBeInTheDocument();
        expect(loading).toHaveTextContent(/up to a minute|installing|reinstalling|regenerating/i);
        // Body lists must NOT render while busy — that's the whole point of
        // body replacement (avoids backdrop-color clash with the shared overlay).
        expect(screen.queryByTestId('ai-mcps-list')).not.toBeInTheDocument();
        expect(screen.queryByTestId('ai-skills-summary')).not.toBeInTheDocument();
    });

    it('hides the loading state when the modal is not busy', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: false });
        expect(screen.queryByTestId('ai-capabilities-loading')).not.toBeInTheDocument();
        // Body content present
        expect(screen.getByTestId('ai-mcps-list')).toBeInTheDocument();
        expect(screen.getByTestId('ai-skills-summary')).toBeInTheDocument();
    });

    // ─── Live progress reporting ──────────────────────────────────────────────
    // When the regenerate flow emits a `creationProgress` message, the hook
    // forwards the live step into the modal so users see what's happening
    // ("Installing storefront dependencies" → "Writing skills" → "Finalizing")
    // instead of a single static "Reinstalling…" string for the whole minute.

    it('surfaces the live step name in the loading state when progress is supplied', () => {
        renderModal({
            skills: SKILLS,
            mcps: MCPS,
            isBusy: true,
            progress: { currentOperation: 'Writing skills', message: '' },
        });
        const loading = screen.getByTestId('ai-capabilities-loading');
        expect(loading).toHaveTextContent(/Writing skills/);
    });

    it('surfaces the live sub-message when progress carries one', () => {
        renderModal({
            skills: SKILLS,
            mcps: MCPS,
            isBusy: true,
            progress: {
                currentOperation: 'Installing storefront dependencies',
                message: 'This can take up to a minute',
            },
        });
        const loading = screen.getByTestId('ai-capabilities-loading');
        expect(loading).toHaveTextContent(/Installing storefront dependencies/);
        expect(loading).toHaveTextContent(/This can take up to a minute/);
    });

    it('falls back to the original static text when busy but no progress has arrived yet', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true });
        const loading = screen.getByTestId('ai-capabilities-loading');
        // Initial busy state (before first creationProgress) still reads cleanly.
        expect(loading).toHaveTextContent(/up to a minute|reinstalling|regenerating/i);
    });
});
