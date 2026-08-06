/**
 * AiSkillsList
 *
 * Skills are infrastructure (Claude auto-discovers them from descriptions),
 * but the user still wants to confirm what's installed. Layout:
 *
 *   Skills · N installed                       ← static summary
 *   ┌─────────────────────────────┐
 *   │ DEMO BUILDER · 12           │            ← sticky group header
 *   │   add-component             │
 *   │   …                         │            ← every skill visible; the
 *   │ ADOBE AEM · 13              │              LIST scrolls, the modal
 *   │   …                         │              never resizes
 *   └─────────────────────────────┘
 *
 * Flat by design (2026-07-09, replacing the collapsible groups): expanding
 * accordions resized the modal and made it jump. A fixed-height scroll region
 * with sticky headers shows everything at rest — no interaction, no jump.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React, { useMemo } from 'react';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import type { SkillInventoryEntry, SkillSource } from '@/types/ai';

export interface AiSkillsListProps {
    skills: SkillInventoryEntry[];
    /** True when the skill inspector errored — list is replaced by a warning row. */
    hasError?: boolean;
    /**
     * The verify has not produced a result yet. Distinct from an empty list:
     * without it, \"not asked yet\" rendered as \"none exist\" and told the user to
     * regenerate files nothing had looked at.
     */
    isLoading?: boolean;
}

/** Display labels for each source, in canonical render order. */
const SOURCE_GROUPS: ReadonlyArray<{ source: SkillSource; label: string }> = [
    { source: 'demo-builder', label: 'Demo Builder' },
    { source: 'adobe', label: 'Adobe AEM' },
    { source: 'unknown', label: 'Custom' },
];

export function AiSkillsList({ skills, hasError = false, isLoading = false }: AiSkillsListProps): React.ReactElement {
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
        return SOURCE_GROUPS.map(({ source, label }) => ({
            source,
            label,
            items: bySource.get(source) ?? [],
        })).filter((group) => group.items.length > 0);
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

    // Error first: an inspector failure is a settled answer, so "checking" would
    // be a lie. Loading second: only claim emptiness once something has looked.
    if (isLoading) {
        return (
            <Flex gap="size-100" alignItems="center" data-testid="ai-skills-loading">
                <Spinner size="S" aria-label="Checking" />
                <Text UNSAFE_className="text-sm text-gray-700">Checking the project's skills…</Text>
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

    return (
        <Flex direction="column" gap="size-100" data-testid="ai-skills-list">
            <Text
                data-testid="ai-skills-summary"
                UNSAFE_className="text-sm font-semibold text-gray-800"
            >
                Skills · {skills.length} installed
            </Text>
            {/* Fixed-height scroll region — the modal frame never resizes. */}
            <div className="ai-skills-scroll">
                {grouped.map(({ source, label, items }) => (
                    <div key={source}>
                        <div
                            className="ai-skills-group-header"
                            data-testid={`ai-skills-group-${source}`}
                        >
                            {label} · {items.length}
                        </div>
                        <Flex direction="column" gap="size-50" marginStart="size-150">
                            {items.map((skill) => (
                                <Text
                                    key={skill.path}
                                    data-testid="ai-skill-row"
                                    UNSAFE_className="text-sm text-gray-800"
                                >
                                    {skill.name}
                                </Text>
                            ))}
                        </Flex>
                    </div>
                ))}
            </div>
        </Flex>
    );
}
