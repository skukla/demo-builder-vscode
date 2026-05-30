/**
 * AiMcpsList Tests
 *
 * Renders the MCP servers wired into the current project's `.mcp.json` as a
 * lean list. Each row shows the server id, its current inspection status,
 * and (when healthy) the number of tools advertised by `tools/list`.
 *
 * Mirrors the AiSkillsList shape — error and empty states use plain language,
 * no health checkmarks (status is informational only).
 */

import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { AiMcpsList } from '@/features/dashboard/ui/components/AiMcpsList';
import '@testing-library/jest-dom';

function renderList(props: Partial<React.ComponentProps<typeof AiMcpsList>> = {}) {
    return render(
        <Provider theme={defaultTheme}>
            <AiMcpsList mcps={props.mcps ?? []} hasError={props.hasError} />
        </Provider>,
    );
}

describe('AiMcpsList', () => {
    it('lists each MCP server by id', () => {
        renderList({
            mcps: [
                { id: 'demo-builder', status: 'ok', tools: [{ name: 't', description: 'd' }] },
                { id: 'playwright', status: 'ok', tools: [{ name: 't', description: 'd' }] },
            ],
        });

        expect(screen.getByTestId('ai-mcp-demo-builder')).toBeInTheDocument();
        expect(screen.getByTestId('ai-mcp-playwright')).toBeInTheDocument();
    });

    it('shows "1 tool" (singular) for a server with one tool', () => {
        renderList({
            mcps: [
                { id: 'single', status: 'ok', tools: [{ name: 'only', description: 'd' }] },
            ],
        });

        expect(screen.getByTestId('ai-mcp-single')).toHaveTextContent(/1 tool\b/i);
    });

    it('shows "N tools" (plural) for a server with multiple tools', () => {
        renderList({
            mcps: [
                {
                    id: 'multi',
                    status: 'ok',
                    tools: [
                        { name: 'a', description: 'd' },
                        { name: 'b', description: 'd' },
                        { name: 'c', description: 'd' },
                    ],
                },
            ],
        });

        expect(screen.getByTestId('ai-mcp-multi')).toHaveTextContent(/3 tools\b/i);
    });

    it('renders a healthy MCP with no tools as "0 tools" rather than crashing', () => {
        renderList({ mcps: [{ id: 'empty-server', status: 'ok', tools: [] }] });
        expect(screen.getByTestId('ai-mcp-empty-server')).toHaveTextContent(/0 tools\b/i);
    });

    it('flags MCPs that timed out during inspection', () => {
        renderList({ mcps: [{ id: 'slow', status: 'timeout' }] });
        expect(screen.getByTestId('ai-mcp-slow')).toHaveTextContent(/timed out|timeout/i);
    });

    it('flags MCPs that errored during inspection', () => {
        renderList({ mcps: [{ id: 'broken', status: 'error', error: 'spawn failed' }] });
        expect(screen.getByTestId('ai-mcp-broken')).toHaveTextContent(/error|failed/i);
    });

    it('shows a plain-language empty state when there are no MCPs', () => {
        renderList({ mcps: [] });
        expect(screen.getByTestId('ai-mcps-empty')).toBeInTheDocument();
    });

    it('shows an error row when the MCP inspector errored', () => {
        renderList({ mcps: [], hasError: true });
        expect(screen.getByTestId('ai-mcps-error')).toBeInTheDocument();
    });

    it('sorts MCPs alphabetically by id for predictable rendering', () => {
        renderList({
            mcps: [
                { id: 'zeta', status: 'ok', tools: [] },
                { id: 'alpha', status: 'ok', tools: [] },
                { id: 'beta', status: 'ok', tools: [] },
            ],
        });

        const rows = screen.getAllByTestId(/^ai-mcp-/);
        const ids = rows.map(r => r.getAttribute('data-testid'));
        expect(ids).toEqual(['ai-mcp-alpha', 'ai-mcp-beta', 'ai-mcp-zeta']);
    });
});
