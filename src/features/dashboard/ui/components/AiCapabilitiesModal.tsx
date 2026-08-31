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
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React from 'react';
import { buildIntegrationSections } from './aiIntegrations';
import { AiMcpsList } from './AiMcpsList';
import { AiSkillsList } from './AiSkillsList';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { Spinner } from '@/core/ui/components/ui/Spinner';
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
    /**
     * The verify has not answered yet. Both sections show "checking" rather than
     * claiming emptiness — the modal used to tell users to regenerate AI files it
     * had never looked at.
     */
    isLoading?: boolean;
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
    /**
     * ADR-013: user-edited bundle files (project-relative posix paths, from
     * `inventory.editedFiles`). Skill files flag their row in `AiSkillsList`;
     * the rest ("AGENTS.md", ".mcp.json", …) render as a compact
     * "Edited — kept your version" note. Nothing renders when empty.
     */
    editedFiles?: string[];
    /** Tool-driving skills the project qualifies for but lacks, with why. */
    gatedSkills?: Array<{
        file: string;
        toolId: string;
        reason: 'setting-disabled' | 'tool-missing';
    }>;
    /**
     * Error from the last regenerate (forwarded from the hook's
     * `aiRegenError`) — the handler's failure message or a rejected request.
     * Renders as a compact inline line above the lists; absent when the last
     * regenerate succeeded.
     */
    errorMessage?: string | null;
}

/** Bundle prefix that routes an edited file to the skills list instead of the note. */
const SKILLS_PREFIX = '.claude/skills/';

/** Stable empty array — a fresh `[]` prop would rerender the gated-only list. */
const EMPTY_SKILLS: SkillInventoryEntry[] = [];

export function AiCapabilitiesModal({
    skills,
    mcps,
    hasSkillsError = false,
    hasMcpsError = false,
    isLoading = false,
    onClose,
    onRegenerate,
    isBusy = false,
    progress,
    editedFiles,
    gatedSkills,
    errorMessage,
}: AiCapabilitiesModalProps): React.ReactElement {
    const editedNonSkillFiles = (editedFiles ?? []).filter((f) => !f.startsWith(SKILLS_PREFIX));
    // Adobe pairs each MCP server with its skill set; show them that way so a
    // missing half reads as a gap. See `aiIntegrations`.
    const sections = React.useMemo(
        () => buildIntegrationSections(mcps, skills),
        [mcps, skills],
    );
    // Pairs are for the populated, healthy case. Whenever a half is missing or
    // errored, fall back to the flat two-list body — it owns the "checking…",
    // "none wired" and inspector-error copy, and a sectioned view would hide
    // all three: a section renders its MCP list only when it HAS an MCP, so an
    // empty or failed inspector produced no row to carry the message.
    const useSections =
        !isLoading &&
        !hasMcpsError &&
        !hasSkillsError &&
        mcps.length > 0 &&
        skills.length > 0 &&
        sections.length > 0;
    return (
        <Modal
            title="AI Capabilities"
            size="L"
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
                                <Text UNSAFE_className="text-gray-700">Checking AI setup…</Text>
                            </>
                        )}
                    </Flex>
                ) : (
                    /* ONE scroll region for everything beneath the modal heading —
                       MCP servers and skills scroll together; the frame stays put.
                       A plain div, not Spectrum Flex, for the columns: Flex caps
                       width at ~450px (see the spectrum-webview-ui skill). */
                    <div className="ai-capabilities-body">
                        {/* The last regenerate failed — say so inline (the
                            handler's message, or the rejection). Without this
                            the modal returned to idle with no signal. Cleared
                            by the next successful regenerate. */}
                        {errorMessage && (
                            <Flex gap="size-100" alignItems="center" data-testid="ai-regen-error">
                                <AlertCircle size="S" UNSAFE_className="text-red-600" />
                                <Text UNSAFE_className="text-gray-700">{errorMessage}</Text>
                            </Flex>
                        )}
                        {/* ADR-013: user-edited non-skill bundle files were kept
                            on the last refresh — say so, compactly, above the
                            lists. Edited SKILL files flag their row in
                            AiSkillsList instead. Absent when nothing is edited. */}
                        {editedNonSkillFiles.length > 0 && (
                            <Text
                                data-testid="ai-edited-files-note"
                                UNSAFE_className="text-gray-700"
                            >
                                Edited — kept your version: {editedNonSkillFiles.join(', ')}
                            </Text>
                        )}
                        <div
                            className="ai-capabilities-columns"
                            data-testid="ai-capabilities-columns"
                        >
                            {!useSections ? (
                                // Loading, errored, or one half empty — see
                                // `useSections`.
                                <>
                                    <Flex direction="column" gap="size-150">
                                        <Heading
                                            level={4}
                                            UNSAFE_className="ai-section-heading"
                                            data-testid="ai-mcps-heading"
                                        >
                                            MCP servers · {mcps.length}
                                        </Heading>
                                        <AiMcpsList
                                            mcps={mcps}
                                            hasError={hasMcpsError}
                                            isLoading={isLoading}
                                        />
                                    </Flex>
                                    <AiSkillsList
                                        skills={skills}
                                        hasError={hasSkillsError}
                                        isLoading={isLoading}
                                        editedFiles={editedFiles}
                                        gatedSkills={gatedSkills}
                                    />
                                </>
                            ) : (
                                sections.map((section) => (
                                    <Flex
                                        key={section.key}
                                        direction="column"
                                        gap="size-150"
                                        data-testid={`ai-integration-${section.key}`}
                                    >
                                        <Heading
                                            level={4}
                                            UNSAFE_className="ai-section-heading"
                                            data-testid="ai-integration-heading"
                                        >
                                            {section.label}
                                        </Heading>
                                        {section.mcps.length > 0 && (
                                            <AiMcpsList
                                                mcps={section.mcps}
                                                hasError={hasMcpsError}
                                            />
                                        )}
                                        {section.skills.length > 0 && (
                                            <AiSkillsList
                                                skills={section.skills}
                                                hasError={hasSkillsError}
                                                editedFiles={editedFiles}
                                                flat
                                            />
                                        )}
                                    </Flex>
                                ))
                            )}
                            {/* Gated skills are a project-wide absence, not one
                                pair's — render them once, under everything. */}
                            {useSections && (
                                <AiSkillsList
                                    skills={EMPTY_SKILLS}
                                    gatedSkills={gatedSkills}
                                    flat
                                />
                            )}
                        </div>
                    </div>
                )}
            </View>
        </Modal>
    );
}
