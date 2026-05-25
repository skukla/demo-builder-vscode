/**
 * AiOverviewScreen
 *
 * Standalone AI surface screen. Composes the existing page chrome
 * (PageLayout + PageHeader + PageFooter) with a single, centered
 * content column that matches the projects-dashboard layout.
 *
 * Body:
 *   - PromptGrid of curated + user-saved prompts.
 *   - Quiet "View installed skills (N)" link beneath the grid opens
 *     InstalledSkillsModal, which carries the Regenerate AI files
 *     action in its footer.
 *
 * Inventory freshness: opening the skills modal triggers a background
 * MCP re-inspection + verify, so the modal renders fresh data every
 * time. No standalone Refresh control on the surface — opening the
 * modal IS the refresh gesture.
 *
 * Composition notes:
 *   - No new UI primitives. PageLayout + .page-container-padded for the
 *     centered 800px content column; Modal wrapper for the drill-down.
 */

import {
    Button,
    DialogContainer,
    Flex,
    Link,
    Text,
    View,
} from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { InstalledSkillsModal } from './components/InstalledSkillsModal';
import { PromptEditDialog } from './components/PromptEditDialog';
import { PromptGrid } from './components/PromptGrid';
import { PageFooter, PageHeader, PageLayout } from '@/core/ui/components/layout';
import { useAsyncOperation } from '@/core/ui/hooks/useAsyncOperation';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { Surface } from '@/commands/openInClaude';
import type { AiCheckResult } from '@/features/ai/aiSetupVerifier';
import type { AiInventory } from '@/types/ai';
import type { AiPrompt, Project } from '@/types/base';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiOverviewScreenProps {
    project: Project;
}

type GlobalMcpRegistrationStateValue = 'registered' | 'declined' | 'unregistered';

interface VerifyAiSetupResponse {
    status: 'ok' | 'warning' | 'error';
    checks: AiCheckResult[];
    inventory: AiInventory;
    globalMcpRegistration?: GlobalMcpRegistrationStateValue;
    /** Whether the Claude Code extension is installed (gate for sessions UI). */
    extensionInstalled?: boolean;
    /** Whether the sessions browser auto-open has already fired once for this workspace. */
    sessionsBrowserAutoShown?: boolean;
    /** User intent: launch via the extension URI handler or via a terminal. */
    surface?: Surface;
}

const CONTRACT_NOTE_EXTENSION =
    'Each prompt click opens Claude Code in a new conversation with the prompt pre-filled. '
    + 'The session appears in the sessions browser after you send the first message. '
    + 'To continue an existing session with a Demo Builder prompt, use the prompt card’s '
    + 'Copy prompt action and paste into the active chat.';

const CONTRACT_NOTE_TERMINAL =
    'Each prompt click sends a new prompt to your Claude terminal session. '
    + 'The first click starts the session; subsequent clicks continue it. '
    + 'The prompt is on your clipboard — paste (Cmd+V) into the terminal at the Claude prompt to send it.';

/**
 * Generate an id for a duplicated prompt. Prefers `crypto.randomUUID` when
 * available (modern browsers + Node 16+); falls back to a timestamp+random
 * suffix for older environments.
 */
function generateAiPromptId(): string {
    const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        return cryptoApi.randomUUID();
    }
    return `ai-prompt-${Date.now()}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SavePromptResponse {
    success: boolean;
    aiPrompts?: AiPrompt[];
}

export function AiOverviewScreen({ project }: AiOverviewScreenProps): React.ReactElement {
    const [verifyResult, setVerifyResult] = useState<VerifyAiSetupResponse | null>(null);
    const [userPrompts, setUserPrompts] = useState<AiPrompt[]>(project.aiPrompts ?? []);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<AiPrompt | null>(null);
    const [skillsModalOpen, setSkillsModalOpen] = useState(false);

    const verifyOp = useAsyncOperation<VerifyAiSetupResponse>();
    const refreshOp = useAsyncOperation<void>();
    const regenerateOp = useAsyncOperation<void>();

    const runVerify = useCallback(async (): Promise<void> => {
        const result = await verifyOp.execute(async () => {
            return await webviewClient.request<VerifyAiSetupResponse>(
                'verify-ai-setup',
                { projectPath: project.path },
            );
        });
        if (result) {
            setVerifyResult(result);
        }
    }, [project.path, verifyOp]);

    useEffect(() => {
        verifyOp.reset();
        refreshOp.reset();
        regenerateOp.reset();
        setUserPrompts(project.aiPrompts ?? []);
        void runVerify();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.path]);

    const handleRegenerate = useCallback(async (): Promise<void> => {
        await regenerateOp.execute(async () => {
            await webviewClient.request('regenerate-ai-files', { projectPath: project.path });
        });
        await runVerify();
    }, [project.path, regenerateOp, runVerify]);

    const handleClose = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

    const handleOpenSkillsModal = useCallback(() => {
        setSkillsModalOpen(true);
        // Background re-inspect + verify so the modal shows fresh data. The
        // modal renders current state immediately; it updates silently when
        // verify completes. Opening IS refreshing — no standalone Refresh action.
        void (async () => {
            await refreshOp.execute(async () => {
                await webviewClient.request('inspect-mcp', {});
            });
            await runVerify();
        })();
    }, [refreshOp, runVerify]);

    const handleCloseSkillsModal = useCallback(() => {
        setSkillsModalOpen(false);
    }, []);

    // ─── User prompt CRUD ────────────────────────────────────────────────────

    const handleNewPrompt = useCallback(() => {
        setEditTarget(null);
        setEditDialogOpen(true);
    }, []);

    const handleEditPrompt = useCallback((id: string) => {
        const target = userPrompts.find(p => p.id === id);
        if (!target) return;
        setEditTarget(target);
        setEditDialogOpen(true);
    }, [userPrompts]);

    const handleCloseEditDialog = useCallback(() => {
        setEditDialogOpen(false);
        setEditTarget(null);
    }, []);

    const handleSavePrompt = useCallback(async (prompt: AiPrompt): Promise<void> => {
        const response = await webviewClient.request<SavePromptResponse>(
            'save-ai-prompt',
            { prompt },
        );
        if (response?.success && Array.isArray(response.aiPrompts)) {
            setUserPrompts(response.aiPrompts);
        }
        setEditDialogOpen(false);
        setEditTarget(null);
    }, []);

    const handleDuplicatePrompt = useCallback(async (id: string): Promise<void> => {
        const target = userPrompts.find(p => p.id === id);
        if (!target) return;
        const copy: AiPrompt = {
            id: generateAiPromptId(),
            title: `${target.title} (copy)`,
            prompt: target.prompt,
        };
        const response = await webviewClient.request<SavePromptResponse>(
            'save-ai-prompt',
            { prompt: copy },
        );
        if (response?.success && Array.isArray(response.aiPrompts)) {
            setUserPrompts(response.aiPrompts);
        }
    }, [userPrompts]);

    const handleDeletePrompt = useCallback(async (id: string): Promise<void> => {
        const response = await webviewClient.request<SavePromptResponse>(
            'delete-ai-prompt',
            { promptId: id },
        );
        if (response?.success && Array.isArray(response.aiPrompts)) {
            setUserPrompts(response.aiPrompts);
        }
    }, []);

    const handlePinTogglePrompt = useCallback(async (id: string, nextPinned: boolean): Promise<void> => {
        const target = userPrompts.find(p => p.id === id);
        if (!target) return;
        const response = await webviewClient.request<SavePromptResponse>(
            'save-ai-prompt',
            { prompt: { ...target, pinned: nextPinned } },
        );
        if (response?.success && Array.isArray(response.aiPrompts)) {
            setUserPrompts(response.aiPrompts);
        }
    }, [userPrompts]);

    const handleLaunchUserPrompt = useCallback((prompt: AiPrompt) => {
        webviewClient.postMessage('openInClaude', { prompt: prompt.prompt });
    }, []);

    const handleCopyPrompt = useCallback((promptBody: string) => {
        webviewClient.postMessage('copyAiPrompt', { prompt: promptBody });
    }, []);

    const handleBrowseSessions = useCallback(() => {
        webviewClient.postMessage('browseClaudeSessions');
    }, []);

    const inventory: AiInventory = verifyResult?.inventory ?? {
        skills: [],
        mcps: [],
        sessionMcps: [],
    };

    const extensionInstalled = verifyResult?.extensionInstalled === true;
    const surface: Surface = verifyResult?.surface ?? 'terminal';
    const contractNoteText =
        surface === 'extension' ? CONTRACT_NOTE_EXTENSION : CONTRACT_NOTE_TERMINAL;

    const isBusy =
        verifyOp.isExecuting ||
        refreshOp.isExecuting ||
        regenerateOp.isExecuting;

    return (
        <>
            <PageLayout
                header={<PageHeader title="AI" subtitle={project.name} constrainWidth />}
                footer={
                    <PageFooter
                        leftContent={
                            <Button variant="secondary" onPress={handleClose} isQuiet>
                                Close
                            </Button>
                        }
                    />
                }
                backgroundColor="var(--spectrum-global-color-gray-50)"
            >
                <div className="page-container-padded page-body-section">
                    <Flex direction="column" gap="size-400">
                        {/* Surface-aware multi-click contract note: explains what happens
                            when the user clicks a prompt card, which differs between the
                            extension and terminal surfaces. */}
                        <View>
                            <Text
                                data-testid="ai-multi-click-contract"
                                UNSAFE_className="text-xs text-gray-700"
                            >
                                {contractNoteText}
                            </Text>
                        </View>

                        {/* Primary content — user-saved prompt library */}
                        <PromptGrid
                            userPrompts={userPrompts}
                            onLaunchUser={handleLaunchUserPrompt}
                            onEdit={handleEditPrompt}
                            onDuplicate={handleDuplicatePrompt}
                            onDelete={handleDeletePrompt}
                            onPinToggle={handlePinTogglePrompt}
                            onNew={handleNewPrompt}
                            onCopy={handleCopyPrompt}
                        />

                        {/* Quiet triggers row: installed-skills drill-down + (when the
                            Claude Code extension is installed) the sessions browser. */}
                        <Flex direction="row" gap="size-300" alignItems="center">
                            <Link
                                data-testid="ai-installed-skills-trigger"
                                onPress={handleOpenSkillsModal}
                                UNSAFE_className="cursor-pointer text-sm"
                            >
                                {`View installed skills (${inventory.skills.length})`}
                            </Link>
                            {extensionInstalled && (
                                <Link
                                    data-testid="ai-browse-sessions-trigger"
                                    onPress={handleBrowseSessions}
                                    UNSAFE_className="cursor-pointer text-sm"
                                >
                                    Browse Claude sessions
                                </Link>
                            )}
                        </Flex>
                    </Flex>
                </div>
            </PageLayout>

            {/* Installed skills drill-down modal — carries the Regenerate action */}
            {skillsModalOpen && (
                <DialogContainer onDismiss={handleCloseSkillsModal}>
                    <InstalledSkillsModal
                        skills={inventory.skills}
                        hasError={Boolean(inventory.skillsError)}
                        onClose={handleCloseSkillsModal}
                        onRegenerate={handleRegenerate}
                        isBusy={isBusy}
                    />
                </DialogContainer>
            )}

            {/* User prompt create/edit dialog */}
            {editDialogOpen && (
                <DialogContainer onDismiss={handleCloseEditDialog}>
                    <PromptEditDialog
                        mode={editTarget ? 'edit' : 'create'}
                        initialPrompt={editTarget ?? undefined}
                        onSave={handleSavePrompt}
                        onClose={handleCloseEditDialog}
                    />
                </DialogContainer>
            )}
        </>
    );
}
