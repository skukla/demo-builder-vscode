/**
 * AiSkillsList
 *
 * Skills are infrastructure (Claude auto-discovers them from descriptions),
 * but the user still wants to confirm what's installed. Layout:
 *
 *   Skills · N installed                       ← static summary
 *   ┌─────────────────────────────┐
 *   │ DEMO BUILDER · 13           │            ← sticky group header
 *   │   add-component             │
 *   │   …                         │            ← every skill visible; the
 *   │ ADOBE APP BUILDER · 7       │              LIST scrolls, the modal
 *   │   …                         │              never resizes
 *   └─────────────────────────────┘
 *
 * One group per Adobe BUNDLE, not one for "Adobe". Each bundle arrives in its
 * own `<prefix>-<skill>/` directory, and grouping on `source: 'adobe'` alone
 * filed App Builder skills under an "Adobe AEM" heading.
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
    /**
     * ADR-013: user-edited bundle files (project-relative posix paths). A skill
     * whose file appears here gets an "edited — kept your version" flag on its
     * row; non-skill entries are the modal note's job and are ignored here.
     */
    editedFiles?: string[];
}

/**
 * Does this skill's on-disk file appear in the edited list? Suffix match:
 * inventory paths are absolute while edited entries are project-relative, so
 * anchor on a separator to avoid partial-name collisions. Backslashes are
 * normalized for win32 inventory paths (edited keys are always posix).
 */
function isEditedSkill(skill: SkillInventoryEntry, editedFiles: string[]): boolean {
    const normalized = skill.path.replace(/\\/g, '/');
    return editedFiles.some((relPath) => normalized.endsWith(`/${relPath}`));
}

/**
 * Display labels for the Adobe bundles we ship, keyed by the directory prefix
 * `skillInspector` reads off disk.
 *
 * Every nested skill used to render under one hardcoded "Adobe AEM" heading,
 * because the group was keyed on `source: 'adobe'` — which only ever meant
 * "arrived in a bundle". App Builder skills were therefore listed as AEM. An
 * unrecognised bundle falls back to a plain "Adobe" rather than borrowing a
 * name that would be wrong.
 */
const BUNDLE_LABELS: Readonly<Record<string, string>> = {
    aem: 'Adobe AEM',
    appbuilder: 'Adobe App Builder',
};

/** Rank for the canonical render order: Demo Builder → Adobe bundles → Custom. */
const SOURCE_ORDER: Readonly<Record<SkillSource, number>> = {
    'demo-builder': 0,
    adobe: 1,
    unknown: 2,
};

const SOURCE_LABELS: Readonly<Record<SkillSource, string>> = {
    'demo-builder': 'Demo Builder',
    adobe: 'Adobe',
    unknown: 'Custom',
};

/**
 * The group a skill belongs to. Adobe skills split per bundle so two bundles
 * never share a heading; everything else groups by source alone.
 */
function groupKeyOf(skill: SkillInventoryEntry): string {
    return skill.source === 'adobe' && skill.bundle
        ? `${skill.source}-${skill.bundle}`
        : skill.source;
}

function groupLabelOf(skill: SkillInventoryEntry): string {
    if (skill.source !== 'adobe' || !skill.bundle) return SOURCE_LABELS[skill.source];
    return BUNDLE_LABELS[skill.bundle] ?? SOURCE_LABELS.adobe;
}

export function AiSkillsList({
    skills,
    hasError = false,
    isLoading = false,
    editedFiles,
}: AiSkillsListProps): React.ReactElement {
    const grouped = useMemo(() => {
        const byKey = new Map<
            string,
            { key: string; label: string; source: SkillSource; items: SkillInventoryEntry[] }
        >();
        for (const skill of skills) {
            const key = groupKeyOf(skill);
            const group = byKey.get(key) ?? {
                key,
                label: groupLabelOf(skill),
                source: skill.source,
                items: [],
            };
            group.items.push(skill);
            byKey.set(key, group);
        }
        for (const group of byKey.values()) {
            group.items.sort((a, b) => a.name.localeCompare(b.name));
        }
        // Source rank first, then label — so two Adobe bundles sit together and
        // in a stable order rather than in Map insertion order.
        return Array.from(byKey.values()).sort(
            (a, b) =>
                SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.label.localeCompare(b.label),
        );
    }, [skills]);

    if (hasError) {
        return (
            <Flex gap="size-100" alignItems="center" data-testid="ai-skills-error">
                <AlertCircle size="S" UNSAFE_className="text-yellow-600" />
                <Text UNSAFE_className="text-gray-700">
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
                <Text UNSAFE_className="text-gray-700">Checking the project's skills…</Text>
            </Flex>
        );
    }

    if (skills.length === 0) {
        return (
            <Text UNSAFE_className="text-gray-700" data-testid="ai-skills-empty">
                No skills yet. Regenerate AI files to set them up.
            </Text>
        );
    }

    return (
        <Flex direction="column" gap="size-100" data-testid="ai-skills-list">
            {/* Counted the same way as the MCP section heading. One said
                "Skills · N installed" and the other just "MCP servers", so two
                parallel lists were labelled by two different rules. */}
            <Text data-testid="ai-skills-summary" UNSAFE_className="ai-section-heading">
                Skills · {skills.length}
            </Text>
            {/* Fixed-height scroll region — the modal frame never resizes. */}
            <div className="ai-skills-scroll">
                {grouped.map(({ key, label, items }) => (
                    <div key={key}>
                        <div
                            className="ai-skills-group-header"
                            data-testid={`ai-skills-group-${key}`}
                        >
                            {label} · {items.length}
                        </div>
                        {/* Flush with the group header, matching the MCP list.
                            The skills were indented and the MCP rows were not,
                            so two lists in one modal read as two systems. */}
                        <Flex direction="column" gap="size-50">
                            {items.map((skill) => (
                                <Text
                                    key={skill.path}
                                    data-testid="ai-skill-row"
                                    UNSAFE_className="text-gray-800"
                                >
                                    {skill.name}
                                    {isEditedSkill(skill, editedFiles ?? []) && (
                                        <span
                                            data-testid="ai-skill-edited-flag"
                                            className="text-gray-600"
                                        >
                                            {' '}
                                            · edited — kept your version
                                        </span>
                                    )}
                                </Text>
                            ))}
                        </Flex>
                    </div>
                ))}
            </div>
        </Flex>
    );
}
