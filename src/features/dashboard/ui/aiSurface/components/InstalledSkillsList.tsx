/**
 * InstalledSkillsList
 *
 * Compact, inline list of installed skills grouped by source domain.
 * Replaces the F2 InstalledSkillsDialog — the user wants confirmation
 * that skills are loaded, not full descriptions. Each group shows a
 * status check + skill names; descriptions intentionally omitted.
 *
 * When the skill inspector errored (`hasError` is true), the list
 * is replaced by a single warning row that surfaces the failure
 * without claiming a count.
 */

import { Flex, Text, View } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useMemo } from 'react';
import type { SkillInventoryEntry, SkillSource } from '@/types/ai';

export interface InstalledSkillsListProps {
    skills: SkillInventoryEntry[];
    /** True when the skill inspector errored — list is replaced by a warning row. */
    hasError?: boolean;
}

const STYLE_GROUP_NAME = { marginLeft: '16px' } as const;

const SOURCE_LABEL: Record<SkillSource, string> = {
    'demo-builder': 'Demo Builder',
    'adobe': 'Adobe',
    'unknown': 'Other',
};

const SOURCE_ORDER: SkillSource[] = ['demo-builder', 'adobe', 'unknown'];

interface SkillGroup {
    source: SkillSource;
    label: string;
    skills: SkillInventoryEntry[];
}

function groupSkills(skills: SkillInventoryEntry[]): SkillGroup[] {
    const buckets = new Map<SkillSource, SkillInventoryEntry[]>();
    for (const skill of skills) {
        const existing = buckets.get(skill.source) ?? [];
        existing.push(skill);
        buckets.set(skill.source, existing);
    }
    return SOURCE_ORDER
        .filter(source => buckets.has(source))
        .map(source => ({
            source,
            label: SOURCE_LABEL[source],
            skills: (buckets.get(source) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
        }));
}

export function InstalledSkillsList({
    skills,
    hasError = false,
}: InstalledSkillsListProps): React.ReactElement {
    const groups = useMemo(() => groupSkills(skills), [skills]);

    return (
        <View data-testid="ai-installed-skills-list">
            <Text UNSAFE_className="text-xs font-semibold text-gray-700 text-uppercase letter-spacing-05">
                Installed skills
            </Text>

            <View marginTop="size-150">
                {hasError ? (
                    <Flex gap="size-100" alignItems="center" data-testid="ai-installed-skills-error">
                        <AlertCircle size="S" UNSAFE_className="text-yellow-600" />
                        <Text UNSAFE_className="text-sm text-gray-700">
                            Couldn&apos;t inspect skills. Try Regenerate AI Files.
                        </Text>
                    </Flex>
                ) : groups.length === 0 ? (
                    <Text UNSAFE_className="text-sm text-gray-700">
                        No skills detected.
                    </Text>
                ) : (
                    <Flex direction="column" gap="size-200">
                        {groups.map(group => (
                            <View key={group.source} data-testid={`ai-skill-group-${group.source}`}>
                                <Flex gap="size-100" alignItems="center">
                                    <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                    <Text UNSAFE_className="text-sm font-semibold">
                                        {`${group.label} (${group.skills.length})`}
                                    </Text>
                                </Flex>
                                <View marginTop="size-75" UNSAFE_style={STYLE_GROUP_NAME}>
                                    <Flex direction="column" gap="size-25">
                                        {group.skills.map(skill => (
                                            <Text
                                                key={skill.path}
                                                UNSAFE_className="text-sm text-gray-700"
                                            >
                                                {skill.name}
                                            </Text>
                                        ))}
                                    </Flex>
                                </View>
                            </View>
                        ))}
                    </Flex>
                )}
            </View>
        </View>
    );
}
