/**
 * InstalledSkillsModal (Batch F4)
 *
 * Modal wrapper around InstalledSkillsList. Triggered from the quiet
 * "View installed skills" link on the AI surface. Composition only —
 * the Modal shared wrapper provides the Close button; the body is
 * the same grouped-by-source list used inline elsewhere.
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
}

export function InstalledSkillsModal({
    skills,
    hasError = false,
    onClose,
}: InstalledSkillsModalProps): React.ReactElement {
    return (
        <Modal title="Installed skills" size="M" onClose={onClose}>
            <InstalledSkillsList skills={skills} hasError={hasError} />
        </Modal>
    );
}
