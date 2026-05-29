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
import type { McpInventoryEntry } from '@/types/ai';

export interface AiMcpsListProps {
    mcps: McpInventoryEntry[];
    /** True when the MCP inspector errored — list is replaced by a warning row. */
    hasError?: boolean;
}

/** Format the right-hand side of the row based on inspection status. */
function summarize(entry: McpInventoryEntry): string {
    if (entry.status === 'timeout') return 'timed out';
    if (entry.status === 'error') return entry.error ? `error: ${entry.error}` : 'error: inspector failed';
    const count = entry.tools?.length ?? 0;
    return `${count} ${count === 1 ? 'tool' : 'tools'}`;
}

export function AiMcpsList({ mcps, hasError = false }: AiMcpsListProps): React.ReactElement {
    const sorted = useMemo(
        () => [...mcps].sort((a, b) => a.id.localeCompare(b.id)),
        [mcps],
    );

    if (hasError) {
        return (
            <Flex gap="size-100" alignItems="center" data-testid="ai-mcps-error">
                <AlertCircle size="S" UNSAFE_className="text-yellow-600" />
                <Text UNSAFE_className="text-sm text-gray-700">
                    Couldn&apos;t read the project&apos;s MCP servers. Try Regenerate AI files.
                </Text>
            </Flex>
        );
    }

    if (sorted.length === 0) {
        return (
            <Text UNSAFE_className="text-sm text-gray-700" data-testid="ai-mcps-empty">
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
                    UNSAFE_className="text-sm text-gray-800"
                >
                    {entry.id} · {summarize(entry)}
                </Text>
            ))}
        </Flex>
    );
}
