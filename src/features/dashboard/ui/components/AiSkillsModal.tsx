/**
 * AiSkillsModal
 *
 * "What the AI can do in this project" — the capability catalog, reached from
 * the dashboard's "View Skills" link (NOT the AI Ready health badge). Lists
 * skills with lean descriptions and carries the project's Regenerate AI files
 * maintenance action in its footer. Regenerate writes the skills, so the action
 * and its result sit together; opening or regenerating refreshes the list.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { AiSkillsList } from './AiSkillsList';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { SkillInventoryEntry } from '@/types/ai';

export interface AiSkillsModalProps {
    skills: SkillInventoryEntry[];
    /** True when the skill inspector errored — list is replaced by a warning row. */
    hasError?: boolean;
    onClose: () => void;
    /** Regenerates the project's AI files (.claude/* + AGENTS.md), which rewrites skills. */
    onRegenerate: () => void | Promise<void>;
    /** True while a verify/regenerate operation is in flight — disables the action. */
    isBusy?: boolean;
}

export function AiSkillsModal({
    skills,
    hasError = false,
    onClose,
    onRegenerate,
    isBusy = false,
}: AiSkillsModalProps): React.ReactElement {
    return (
        <Modal
            title="Skills"
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
            <Flex direction="column" gap="size-150">
                <Text UNSAFE_className="text-sm text-gray-600">
                    What the AI can do in this project.
                </Text>
                <AiSkillsList skills={skills} hasError={hasError} />
            </Flex>
        </Modal>
    );
}
