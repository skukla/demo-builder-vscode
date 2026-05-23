/**
 * AiOverviewScreen
 *
 * Standalone AI surface screen. Composes the existing page chrome
 * (PageLayout + PageHeader + PageFooter) with a single, centered
 * content column that matches the projects-dashboard layout.
 *
 * Body (Batch F4 — single-column with modal drill-down):
 *   - Inline Refresh + Regenerate buttons above the PromptGrid.
 *   - PromptGrid of curated + user-saved prompts.
 *   - Quiet "View installed skills" link triggers InstalledSkillsModal.
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
    View,
} from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { InstalledSkillsModal } from './components/InstalledSkillsModal';
import { PromptEditDialog } from './components/PromptEditDialog';
import { PromptGrid } from './components/PromptGrid';
import { PageFooter, PageHeader, PageLayout } from '@/core/ui/components/layout';
import { useAsyncOperation } from '@/core/ui/hooks/useAsyncOperation';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AiCheckResult } from '@/features/ai/aiSetupVerifier';
import aiPromptsConfig from '@/features/project-creation/config/ai-prompts.json';
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
}

const CONFIGURED_PROMPTS: AiPrompt[] = (aiPromptsConfig as { prompts: AiPrompt[] }).prompts;

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

    const handleRefresh = useCallback(async (): Promise<void> => {
        await refreshOp.execute(async () => {
            await webviewClient.request('inspect-mcp', {});
        });
        await runVerify();
    }, [refreshOp, runVerify]);

    const handleRegenerate = useCallback(async (): Promise<void> => {
        await regenerateOp.execute(async () => {
            await webviewClient.request('regenerate-ai-files', { projectPath: project.path });
        });
        await runVerify();
    }, [project.path, regenerateOp, runVerify]);

    const handleClose = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

    const handlePromptLaunch = useCallback((prompt: string) => {
        webviewClient.postMessage('openInClaude', { prompt });
    }, []);

    const handleOpenSkillsModal = useCallback(() => {
        setSkillsModalOpen(true);
    }, []);

    const handleCloseSkillsModal = useCallback(() => {
        setSkillsModalOpen(false);
    }, []);

    // ─── F3: user prompt CRUD ────────────────────────────────────────────────

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

    const handleLaunchUserPrompt = useCallback((prompt: AiPrompt) => {
        webviewClient.postMessage('openInClaude', { prompt: prompt.prompt });
    }, []);

    const inventory: AiInventory = verifyResult?.inventory ?? {
        skills: [],
        mcps: [],
        sessionMcps: [],
    };

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
                    <Flex direction="column" gap="size-300">
                        {/* Refresh + Regenerate above the grid */}
                        <Flex gap="size-100" justifyContent="end">
                            <Button variant="secondary" isQuiet isDisabled={isBusy} onPress={handleRefresh}>
                                Refresh
                            </Button>
                            <Button variant="secondary" isQuiet isDisabled={isBusy} onPress={handleRegenerate}>
                                Regenerate AI Files
                            </Button>
                        </Flex>

                        {/* Primary content — curated prompt grid + user prompts */}
                        <PromptGrid
                            curatedPrompts={CONFIGURED_PROMPTS}
                            userPrompts={userPrompts}
                            onLaunch={handlePromptLaunch}
                            onLaunchUser={handleLaunchUserPrompt}
                            onEdit={handleEditPrompt}
                            onDuplicate={handleDuplicatePrompt}
                            onDelete={handleDeletePrompt}
                            onNew={handleNewPrompt}
                        />

                        {/* Quiet trigger for the installed-skills drill-down */}
                        <View>
                            <Link
                                data-testid="ai-installed-skills-trigger"
                                onPress={handleOpenSkillsModal}
                                UNSAFE_className="cursor-pointer text-sm"
                            >
                                {`View installed skills (${inventory.skills.length})`}
                            </Link>
                        </View>
                    </Flex>
                </div>
            </PageLayout>

            {/* Installed skills drill-down modal */}
            {skillsModalOpen && (
                <DialogContainer onDismiss={handleCloseSkillsModal}>
                    <InstalledSkillsModal
                        skills={inventory.skills}
                        hasError={Boolean(inventory.skillsError)}
                        onClose={handleCloseSkillsModal}
                    />
                </DialogContainer>
            )}

            {/* F3: User prompt create/edit dialog */}
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
