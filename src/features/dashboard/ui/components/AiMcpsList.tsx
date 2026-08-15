/**
 * AiMcpsList
 *
 * Lean MCP server list for the project. One scannable row per server:
 * `<id> · <N> tools` for healthy servers, `<id> · timed out` or
 * `<id> · error: <msg>` for problem states. No health checkmarks — the
 * dashboard's "AI Ready" badge owns aggregate health; this surface is
 * informational, so the user can see what tools the AI can actually call.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React, { useMemo } from 'react';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import type { McpInventoryEntry } from '@/types/ai';

export interface AiMcpsListProps {
    mcps: McpInventoryEntry[];
    /** True when the MCP inspector errored — list is replaced by a warning row. */
    hasError?: boolean;
    /**
     * The verify has not produced a result yet. Distinct from an empty list:
     * without it, \"not asked yet\" rendered as \"none exist\" and told the user to
     * regenerate files nothing had looked at.
     */
    isLoading?: boolean;
}

/** Format the right-hand side of the row based on inspection status. */
function summarize(entry: McpInventoryEntry): string {
    if (entry.status === 'timeout') return 'timed out';
    if (entry.status === 'error') return entry.error ? `error: ${entry.error}` : 'error: inspector failed';
    const count = entry.tools?.length ?? 0;
    return `${count} ${count === 1 ? 'tool' : 'tools'}`;
}

export function AiMcpsList({ mcps, hasError = false, isLoading = false }: AiMcpsListProps): React.ReactElement {
    const sorted = useMemo(
        () => [...mcps].sort((a, b) => a.id.localeCompare(b.id)),
        [mcps],
    );

    if (hasError) {
        return (
            <Flex gap="size-100" alignItems="center" data-testid="ai-mcps-error">
                <AlertCircle size="S" UNSAFE_className="text-yellow-600" />
                <Text UNSAFE_className="text-gray-700">
                    Couldn&apos;t read the project&apos;s MCP servers. Try Regenerate AI files.
                </Text>
            </Flex>
        );
    }

    // Error first: an inspector failure is a settled answer, so "checking" would
    // be a lie. Loading second: only claim emptiness once something has looked.
    if (isLoading) {
        return (
            <Flex gap="size-100" alignItems="center" data-testid="ai-mcps-loading">
                <Spinner size="S" aria-label="Checking" />
                <Text UNSAFE_className="text-gray-700">Checking the project's MCP servers…</Text>
            </Flex>
        );
    }

    if (sorted.length === 0) {
        return (
            <Text UNSAFE_className="text-gray-700" data-testid="ai-mcps-empty">
                No MCP servers wired yet. Regenerate AI files to set them up.
            </Text>
        );
    }

    return (
        <Flex direction="column" gap="size-100" data-testid="ai-mcps-list">
            {sorted.map(entry => (
                <Text
                    key={entry.id}
                    data-testid={`ai-mcp-${entry.id}`}
                    UNSAFE_className="text-gray-800"
                >
                    {entry.id} · {summarize(entry)}
                </Text>
            ))}
        </Flex>
    );
}
