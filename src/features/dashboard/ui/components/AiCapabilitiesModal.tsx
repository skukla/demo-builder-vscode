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
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { Spinner } from '@/core/ui/components/ui';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { McpInventoryEntry, SkillInventoryEntry } from '@/types/ai';

/**
 * Live regenerate-step shape, mirrored from the wizard's `creationProgress`
 * payload. `currentOperation` is the step name (bold), `message` is the
 * sub-text (gray), `progress` is the optional 0–100 percentage that drives
 * the determinate `ProgressCircle` inside `LoadingDisplay`.
 */
export interface AiRegenerateProgress {
    currentOperation: string;
    message?: string;
    progress?: number;
}

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
    /**
     * Live regenerate progress (step name + optional detail). Forwarded from
     * the dashboard hook, which subscribes to the wizard's `creationProgress`
     * channel. When present, the busy state renders `LoadingDisplay` with the
     * live step instead of the static "Reinstalling…" fallback.
     */
    progress?: AiRegenerateProgress;
}

export function AiCapabilitiesModal({
    skills,
    mcps,
    hasSkillsError = false,
    hasMcpsError = false,
    onClose,
    onRegenerate,
    isBusy = false,
    progress,
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
                        {progress ? (
                            // Live progress arrived — render LoadingDisplay so the user
                            // sees each step (install → AGENTS.md → MCP → skills → finalize)
                            // and the determinate progress ring when a percentage is set.
                            <LoadingDisplay
                                size="L"
                                message={progress.currentOperation}
                                subMessage={progress.message}
                                progress={progress.progress}
                            />
                        ) : (
                            // Busy without a `progress` payload. This branch fires for
                            // TWO distinct operations:
                            //   1. verify-ai-setup (runs on every dashboard mount and
                            //      every modal open) — file checks + MCP inspection, no
                            //      install, no file writes.
                            //   2. regenerate-ai-files (only on explicit button click) —
                            //      BUT only for the brief window before the first
                            //      creationProgress payload arrives; once it does, the
                            //      modal switches to the per-step LoadingDisplay above.
                            // Earlier copy ("Reinstalling storefront dependencies and
                            // rewriting AI files. This can take up to a minute.") only
                            // fit operation 2, and misled users during the much more
                            // common case 1. Use neutral copy that fits both.
                            <>
                                <Spinner size="L" aria-label="Checking AI setup" />
                                <Text UNSAFE_className="text-sm text-gray-700">
                                    Checking AI setup…
                                </Text>
                            </>
                        )}
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
