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
 * sets: regenerating refreshes the modal's lists in place. The one sentence
 * about edited files sits just above it, because Regenerate is the only thing
 * that fact is about (owner, 2026-10-22). No middle dots anywhere.
 *
 * While the verify reads what the dialog will show, and while a regenerate runs, the dialog is
 * the Modal's wait: nothing else on screen, no words for the read, the step's own words for the
 * regenerate (dialog design rules). A regenerate that failed is the title's outcome, in red.
 */

import { Flex, Heading } from '@adobe/react-spectrum';
import React from 'react';
import { regenerateKeepsSentence } from './aiEditedNote';
import { buildIntegrationSections } from './aiIntegrations';
import { AiMcpsList } from './AiMcpsList';
import { AiSkillsList } from './AiSkillsList';
import { Modal, type ModalWait } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { AI_FILES_OPERATION_ID } from '@/core/utils/operationIds';
import type { McpInventoryEntry, SkillInventoryEntry } from '@/types/ai';

/**
 * Live regenerate-step shape, mirrored from the wizard's `creationProgress`
 * payload. `currentOperation` is the step name, `message` the line under it,
 * `progress` the optional 0–100 percentage, said in words under them.
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
     * The verify has not answered yet. The dialog is its wait rather than claiming
     * emptiness — the modal used to tell users to regenerate AI files it had never
     * looked at.
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
     * channel. When present, the wait says the live step.
     */
    progress?: AiRegenerateProgress;
    /**
     * ADR-013: user-edited bundle files (project-relative posix paths, from
     * `inventory.editedFiles`). All of them, skills included, render as ONE
     * sentence above the Regenerate button ("Regenerate keeps your edits to
     * AGENTS.md."), see `aiEditedNote`. Nothing renders when empty.
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
     * The title says it failed and this sits under it, above the lists; absent
     * when the last regenerate succeeded.
     */
    errorMessage?: string | null;
}

/** Stable empty array — a fresh `[]` prop would rerender the gated-only list. */
const EMPTY_SKILLS: SkillInventoryEntry[] = [];

/** A dialog reading what it will show says nothing while it does. */
const READING: ModalWait = {};

/**
 * The dialog's wait. Busy with no `progress` is either the verify (on every dashboard mount and
 * modal open: file checks and MCP inspection, no writes) or the moment before a regenerate's
 * first step arrives, and neither has anything to say.
 */
function waitOf(isBusy: boolean, isLoading: boolean, progress?: AiRegenerateProgress): ModalWait | false {
    if (isBusy && progress) {
        const percent = progress.progress === undefined ? '' : `${progress.progress}%`;
        return { message: progress.currentOperation, detail: [progress.message, percent].filter(Boolean).join(', ') };
    }
    return isBusy || isLoading ? READING : false;
}

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
    const keepsSentence = regenerateKeepsSentence(editedFiles, skills);
    // Adobe pairs each MCP server with its skill set; show them that way so a
    // missing half reads as a gap. See `aiIntegrations`.
    const sections = React.useMemo(() => buildIntegrationSections(mcps, skills), [mcps, skills]);
    // Pairs are for the populated, healthy case. Whenever a half is missing or
    // errored, fall back to the flat two-list body — it owns the "none wired" and
    // inspector-error copy, and a sectioned view would hide both: a section renders
    // its MCP list only when it HAS an MCP, so an empty or failed inspector produced
    // no row to carry the message.
    const useSections =
        !hasMcpsError &&
        !hasSkillsError &&
        mcps.length > 0 &&
        skills.length > 0 &&
        sections.length > 0;
    // A regenerate running again is not the one that failed.
    const regenFailed = Boolean(errorMessage) && !isBusy;
    // Closing a regenerate that is still RUNNING hands it to a progress
    // notification rather than leaving it to finish unseen — the same handover
    // every progress modal offers (PL-59 R8). Nothing is cancelled.
    const close = (): void => {
        if (isBusy) {
            webviewClient.postMessage('backgroundOperation', {
                id: AI_FILES_OPERATION_ID,
                title: 'Regenerating AI files',
            });
        }
        onClose();
    };

    return (
        <Modal
            title={regenFailed ? "Couldn't regenerate AI files" : 'AI Capabilities'}
            status={regenFailed ? 'error' : undefined}
            size="L"
            fitContent
            onClose={close}
            closeLabel={isBusy ? 'Run in background' : undefined}
            waiting={waitOf(isBusy, isLoading, progress)}
            actionButtons={[
                {
                    label: 'Regenerate AI files',
                    variant: 'secondary',
                    onPress: () => {
                        void onRegenerate();
                    },
                },
            ]}
        >
            {/* ONE scroll region for everything beneath the modal heading —
                MCP servers and skills scroll together; the frame stays put.
                A plain div, not Spectrum Flex, for the columns: Flex caps
                width at ~450px (see the spectrum-webview-ui skill). The
                Regenerate sentence sits OUTSIDE it, so it stays put just
                above the footer button it is about. */}
            <div className="ai-capabilities-body">
                {/* The last regenerate failed: the title says so, and this is
                    why (the handler's message, or the rejection). Cleared by
                    the next successful regenerate. */}
                {errorMessage && <p className="dialog-line ai-regen-error" data-testid="ai-regen-error">{errorMessage}</p>}
                <div
                    className="ai-capabilities-columns"
                    data-testid="ai-capabilities-columns"
                >
                    {!useSections ? (
                        // Errored, or one half empty — see `useSections`.
                        <>
                            <Flex direction="column" gap="size-150">
                                <Heading
                                    level={4}
                                    UNSAFE_className="ai-section-heading"
                                    data-testid="ai-mcps-heading"
                                >
                                    MCP servers ({mcps.length})
                                </Heading>
                                <AiMcpsList mcps={mcps} hasError={hasMcpsError} />
                            </Flex>
                            <AiSkillsList
                                skills={skills}
                                hasError={hasSkillsError}
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
                                    <AiMcpsList mcps={section.mcps} hasError={hasMcpsError} />
                                )}
                                {section.skills.length > 0 && (
                                    <AiSkillsList
                                        skills={section.skills}
                                        hasError={hasSkillsError}
                                        flat
                                    />
                                )}
                            </Flex>
                        ))
                    )}
                    {/* Gated skills are a project-wide absence, not one
                        pair's — render them once, under everything. Only when
                        there are some: with none, an empty list says "No skills
                        yet" under sections that are listing the project's skills. */}
                    {useSections && (gatedSkills?.length ?? 0) > 0 && (
                        <AiSkillsList skills={EMPTY_SKILLS} gatedSkills={gatedSkills} flat />
                    )}
                </div>
            </div>
            {/* ADR-013: which edited files Regenerate leaves alone.
                Absent when nothing is edited. A plain <p>: its margin
                is ours to set, where Spectrum Text's own rule would
                win a tie on specificity. */}
            {keepsSentence && (
                <p
                    data-testid="ai-edited-files-note"
                    className="ai-regenerate-note text-gray-700"
                >
                    {keepsSentence}
                </p>
            )}
        </Modal>
    );
}
