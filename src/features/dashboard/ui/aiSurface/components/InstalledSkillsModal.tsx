/**
 * InstalledSkillsModal
 *
 * Modal wrapper around InstalledSkillsList. Triggered from the quiet
 * "View installed skills" link on the AI surface. The modal owns the
 * project's AI maintenance action — `Regenerate AI files` — in its
 * footer, alongside the standard Close button. (Refresh is handled
 * implicitly: the parent re-inspects MCPs and re-verifies on modal
 * open, so opening the modal IS refreshing.)
 */

import React from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { SkillInventoryEntry } from '@/types/ai';
import { InstalledSkillsList } from './InstalledSkillsList';

export interface InstalledSkillsModalProps {
    skills: SkillInventoryEntry[];
    /** True when the skill inspector errored — list is replaced by a warning row. */
    hasError?: boolean;
    onClose: () => void;
    /** Triggers regeneration of the project's AI files (.claude/* + AGENTS.md). */
    onRegenerate: () => void | Promise<void>;
    /** True while any verify/regenerate operation is in flight — disables the action button. */
    isBusy?: boolean;
}

export function InstalledSkillsModal({
    skills,
    hasError = false,
    onClose,
    onRegenerate,
    isBusy = false,
}: InstalledSkillsModalProps): React.ReactElement {
    return (
        <Modal
            title="Installed skills"
            size="M"
            onClose={onClose}
            actionButtons={[
                {
                    label: 'Regenerate AI files',
                    variant: 'secondary',
                    onPress: () => {
                        void onRegenerate();
                    },
                    isDisabled: isBusy,
                },
            ]}
        >
            <InstalledSkillsList skills={skills} hasError={hasError} />
        </Modal>
    );
}
