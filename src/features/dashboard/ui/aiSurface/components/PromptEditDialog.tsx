/**
 * PromptEditDialog
 *
 * Modal wrapper around a small form (title TextField + prompt TextArea).
 * Used in two modes:
 *   - 'create' — fields empty, Save generates a new id via crypto.randomUUID()
 *   - 'edit'   — fields prefilled from initialPrompt, Save preserves the id
 *
 * Save is disabled when either field is empty (trimmed). Cancel/Close fires
 * onClose without persisting.
 *
 * Composition: the shared `Modal` wrapper + Spectrum TextField/TextArea — no
 * new UI primitives.
 */

import { Flex, TextArea, TextField } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { AiPrompt } from '@/types/base';

export interface PromptEditDialogProps {
    /** 'create' starts blank; 'edit' prefills from initialPrompt. */
    mode: 'create' | 'edit';
    /** Required when mode is 'edit'. */
    initialPrompt?: AiPrompt;
    /** Called when the user clicks Save with valid title + prompt. */
    onSave: (prompt: AiPrompt) => Promise<void> | void;
    /** Called when the user dismisses the dialog without saving. */
    onClose: () => void;
}

function generateId(): string {
    // Webview context — crypto is a global (window.crypto / globalThis.crypto),
    // NOT a Node import. Modern browsers + VS Code webviews expose
    // crypto.randomUUID; older environments fall through to a best-effort string.
    const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        return cryptoApi.randomUUID();
    }
    return `ai-prompt-${Date.now()}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

export function PromptEditDialog({
    mode,
    initialPrompt,
    onSave,
    onClose,
}: PromptEditDialogProps): React.ReactElement {
    const [title, setTitle] = useState<string>(initialPrompt?.title ?? '');
    const [promptBody, setPromptBody] = useState<string>(initialPrompt?.prompt ?? '');

    const isValid = useMemo(
        () => title.trim().length > 0 && promptBody.trim().length > 0,
        [title, promptBody],
    );

    const handleSave = useCallback(() => {
        if (!isValid) return;
        const id = mode === 'edit' && initialPrompt ? initialPrompt.id : generateId();
        const payload: AiPrompt = {
            id,
            title: title.trim(),
            prompt: promptBody.trim(),
        };
        // Allow async onSave but don't block the UI thread for tests.
        void Promise.resolve(onSave(payload));
    }, [isValid, mode, initialPrompt, title, promptBody, onSave]);

    const modalTitle = mode === 'edit' ? 'Edit prompt' : 'New prompt';

    return (
        <Modal
            title={modalTitle}
            size="M"
            onClose={onClose}
            actionButtons={[
                {
                    label: 'Save',
                    variant: 'accent',
                    onPress: handleSave,
                    isDisabled: !isValid,
                },
            ]}
        >
            <Flex direction="column" gap="size-200">
                <TextField
                    label="Title"
                    value={title}
                    onChange={setTitle}
                    width="100%"
                    autoFocus={mode === 'create'}
                />
                <TextArea
                    label="Prompt"
                    value={promptBody}
                    onChange={setPromptBody}
                    width="100%"
                />
            </Flex>
        </Modal>
    );
}
