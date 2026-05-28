/**
 * AiSkillsList
 *
 * Lean capability list: what the AI can do in this project. One scannable row
 * per skill name (the skill ids are self-descriptive — add-component,
 * sync-changes, aem-block-developer …). No descriptions (truncated half-lines
 * informed poorly) and no status checks (health lives in the dashboard's
 * "AI Ready" badge). Error and empty states use plain language.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React, { useMemo } from 'react';
import type { SkillInventoryEntry } from '@/types/ai';

export interface AiSkillsListProps {
    skills: SkillInventoryEntry[];
    /** True when the skill inspector errored — list is replaced by a warning row. */
    hasError?: boolean;
}

export function AiSkillsList({ skills, hasError = false }: AiSkillsListProps): React.ReactElement {
    const sorted = useMemo(
        () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
        [skills],
    );

    if (hasError) {
        return (
            <Flex gap="size-100" alignItems="center" data-testid="ai-skills-error">
                <AlertCircle size="S" UNSAFE_className="text-yellow-600" />
                <Text UNSAFE_className="text-sm text-gray-700">
                    Couldn&apos;t read the project&apos;s skills. Try Regenerate AI files.
                </Text>
            </Flex>
        );
    }

    if (sorted.length === 0) {
        return (
            <Text UNSAFE_className="text-sm text-gray-700" data-testid="ai-skills-empty">
                No skills yet. Regenerate AI files to set them up.
            </Text>
        );
    }

    return (
        <Flex direction="column" gap="size-100" data-testid="ai-skills-list">
            {sorted.map(skill => (
                <Text key={skill.path} data-testid="ai-skill-row" UNSAFE_className="text-sm text-gray-800">
                    {skill.name}
                </Text>
            ))}
        </Flex>
    );
}
