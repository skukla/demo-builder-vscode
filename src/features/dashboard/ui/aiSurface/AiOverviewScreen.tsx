/**
 * AiOverviewScreen — the Prompt Library
 *
 * A single, centered prompt-management surface: the user's saved AI prompts in
 * a PromptGrid, with create/edit/duplicate/delete/pin and launch/copy. AI
 * health and capability discovery (installed skills, Regenerate AI files,
 * Browse sessions) live on the Project Dashboard, not here — this surface is
 * purely about prompts and never calls verify-ai-setup.
 */

import {
    Button,
    DialogContainer,
    Flex,
} from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { PromptEditDialog } from './components/PromptEditDialog';
import { PromptGrid } from './components/PromptGrid';
import { PageFooter, PageHeader, PageLayout } from '@/core/ui/components/layout';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AiPrompt, Project } from '@/types/base';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiOverviewScreenProps {
    project: Project;
}

interface SavePromptResponse {
    success: boolean;
    aiPrompts?: AiPrompt[];
}

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

export function AiOverviewScreen({ project }: AiOverviewScreenProps): React.ReactElement {
    const [userPrompts, setUserPrompts] = useState<AiPrompt[]>(project.aiPrompts ?? []);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<AiPrompt | null>(null);

    // Reset the prompt list when the project changes.
    useEffect(() => {
        setUserPrompts(project.aiPrompts ?? []);
    }, [project.path, project.aiPrompts]);

    const handleClose = useCallback(() => {
        webviewClient.postMessage('cancel');
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

    return (
        <>
            <PageLayout
                header={<PageHeader title="Prompt Library" subtitle={project.name} constrainWidth />}
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
                    </Flex>
                </div>
            </PageLayout>

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
