/**
 * AiCapabilitiesModal
 *
 * "What the AI can do in this project" — the capability catalog, reached from
 * the dashboard's "View AI Capabilities" link (NOT the AI Ready health badge).
 *
 * MCP servers come first as the primary capability surface (concrete tool
 * counts, clear health signals). Skills appear below as a collapsible summary
 * — Claude auto-discovers skills from their descriptions, so users don't need
 * the list to invoke them; the disclosure exists for trust and debugging.
 *
 * The Regenerate AI files action sits in the footer because it writes both
 * sets: regenerating refreshes the modal's lists in place.
 */

import { Flex, Heading, Text, View } from '@adobe/react-spectrum';
import React from 'react';
import { AiMcpsList } from './AiMcpsList';
import { AiSkillsList } from './AiSkillsList';
import { Spinner } from '@/core/ui/components/ui';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { McpInventoryEntry, SkillInventoryEntry } from '@/types/ai';

export interface AiCapabilitiesModalProps {
    skills: SkillInventoryEntry[];
    mcps: McpInventoryEntry[];
    /** True when the skill inspector errored — skills section shows a warning row. */
    hasSkillsError?: boolean;
    /** True when the MCP inspector errored — MCP section shows a warning row. */
    hasMcpsError?: boolean;
    onClose: () => void;
    /** Regenerates the project's AI files (.claude/* + AGENTS.md), which rewrites skills + MCP config. */
    onRegenerate: () => void | Promise<void>;
    /** True while a verify/regenerate operation is in flight — disables the action. */
    isBusy?: boolean;
}

export function AiCapabilitiesModal({
    skills,
    mcps,
    hasSkillsError = false,
    hasMcpsError = false,
    onClose,
    onRegenerate,
    isBusy = false,
}: AiCapabilitiesModalProps): React.ReactElement {
    return (
        <Modal
            title="AI Capabilities"
            size="M"
            onClose={onClose}
            actionButtons={[
                {
                    label: isBusy ? 'Regenerating…' : 'Regenerate AI files',
                    variant: 'secondary',
                    onPress: () => {
                        void onRegenerate();
                    },
                    isDisabled: isBusy,
                },
            ]}
        >
            {/* Body content is replaced — not overlaid — when busy. Two reasons:
                (a) the shared LoadingOverlay's opaque backdrop assumes a lighter
                app surface and collides with Spectrum Dialog's own background,
                producing a visibly stuck rectangle in dark mode; (b) the
                semi-transparent variant lets the underlying text bleed through.
                Swapping content on the modal's own surface gives the spinner
                natural contrast and avoids both issues. The wrapper holds a
                minHeight so the modal doesn't shrink during the busy → idle
                transition. */}
            <View minHeight="size-3600">
                {isBusy ? (
                    <Flex
                        data-testid="ai-capabilities-loading"
                        direction="column"
                        alignItems="center"
                        justifyContent="center"
                        gap="size-200"
                        height="size-3600"
                    >
                        <Spinner size="L" aria-label="Regenerating AI files" />
                        <Flex direction="column" alignItems="center" gap="size-50">
                            <Text UNSAFE_className="text-sm text-gray-700">
                                Reinstalling storefront dependencies and rewriting AI files.
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600">
                                This can take up to a minute.
                            </Text>
                        </Flex>
                    </Flex>
                ) : (
                    <Flex direction="column" gap="size-300">
                        <Text UNSAFE_className="text-sm text-gray-600">
                            What the AI can do in this project.
                        </Text>

                        <Flex direction="column" gap="size-150">
                            <Heading level={4} UNSAFE_className="text-sm font-semibold text-gray-800 m-0">
                                MCP servers
                            </Heading>
                            <AiMcpsList mcps={mcps} hasError={hasMcpsError} />
                        </Flex>

                        <AiSkillsList skills={skills} hasError={hasSkillsError} />
                    </Flex>
                )}
            </View>
        </Modal>
    );
}
