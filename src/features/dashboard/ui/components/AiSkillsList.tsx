/**
 * AiSkillsList
 *
 * Skills are infrastructure (Claude auto-discovers them from descriptions),
 * but the user still wants to confirm what's installed. Layout:
 *
 *   Skills · N installed                       ← static summary
 *     ▸ Demo Builder (9)                       ← group row, collapsible
 *     ▸ Adobe AEM (6)                          ← group row, collapsible
 *
 * Source groups are always visible — they answer "what's installed?" at a
 * glance. Clicking a group reveals its alphabetized skill names; clicking
 * again hides them. Groups expand independently. Skill names are the deep
 * detail and stay tucked under their group until asked for.
 *
 * Group toggles use native <button> rather than Spectrum's <Link> on purpose:
 * Spectrum interactive components inside Spectrum <Dialog> Content crash the
 * dialog tree in this codebase (focus manager conflicts with React Aria's
 * usePress). Modal.tsx's FocusableButton applies the same workaround for the
 * modal's action footer.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React, { useMemo, useState } from 'react';
import type { SkillInventoryEntry, SkillSource } from '@/types/ai';

export interface AiSkillsListProps {
    skills: SkillInventoryEntry[];
    /** True when the skill inspector errored — list is replaced by a warning row. */
    hasError?: boolean;
}

/** Display labels for each source, in canonical render order. */
const SOURCE_GROUPS: ReadonlyArray<{ source: SkillSource; label: string }> = [
    { source: 'demo-builder', label: 'Demo Builder' },
    { source: 'adobe', label: 'Adobe AEM' },
    { source: 'unknown', label: 'Custom' },
];

/** Resets browser button chrome so the toggle reads as inline text. */
const BUTTON_RESET = 'bg-transparent border-none p-0 m-0 cursor-pointer text-left';

export function AiSkillsList({ skills, hasError = false }: AiSkillsListProps): React.ReactElement {
    const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<SkillSource>>(new Set());

    const grouped = useMemo(() => {
        const bySource = new Map<SkillSource, SkillInventoryEntry[]>();
        for (const skill of skills) {
            const bucket = bySource.get(skill.source) ?? [];
            bucket.push(skill);
            bySource.set(skill.source, bucket);
        }
        for (const bucket of bySource.values()) {
            bucket.sort((a, b) => a.name.localeCompare(b.name));
        }
        return SOURCE_GROUPS
            .map(({ source, label }) => ({ source, label, items: bySource.get(source) ?? [] }))
            .filter(group => group.items.length > 0);
    }, [skills]);

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

    if (skills.length === 0) {
        return (
            <Text UNSAFE_className="text-sm text-gray-700" data-testid="ai-skills-empty">
                No skills yet. Regenerate AI files to set them up.
            </Text>
        );
    }

    const toggleGroup = (source: SkillSource) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(source)) {
                next.delete(source);
            } else {
                next.add(source);
            }
            return next;
        });
    };

    return (
        <Flex direction="column" gap="size-100" data-testid="ai-skills-list">
            <Text data-testid="ai-skills-summary" UNSAFE_className="text-sm font-semibold text-gray-800">
                Skills · {skills.length} installed
            </Text>
            {grouped.map(({ source, label, items }) => {
                const isExpanded = expandedGroups.has(source);
                return (
                    <Flex direction="column" gap="size-50" key={source}>
                        <button
                            type="button"
                            data-testid={`ai-skills-group-${source}`}
                            onClick={() => toggleGroup(source)}
                            className={`${BUTTON_RESET} text-xs font-semibold text-gray-600`}
                        >
                            {isExpanded ? '▾' : '▸'} {label} ({items.length})
                        </button>
                        {isExpanded && (
                            <Flex direction="column" gap="size-50" marginStart="size-200">
                                {items.map(skill => (
                                    <Text
                                        key={skill.path}
                                        data-testid="ai-skill-row"
                                        UNSAFE_className="text-sm text-gray-800"
                                    >
                                        {skill.name}
                                    </Text>
                                ))}
                            </Flex>
                        )}
                    </Flex>
                );
            })}
        </Flex>
    );
}
