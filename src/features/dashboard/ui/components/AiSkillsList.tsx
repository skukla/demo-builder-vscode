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
import { BUNDLE_LABELS } from './aiSurfaceNames';
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
    /**
     * Tool-driving skills this project qualifies for but does not have, with
     * why. Rendered as muted rows AFTER the installed groups — an absence with
     * a stated reason instead of a silent omission (third-party-tooling item,
     * step 4).
     */
    gatedSkills?: Array<{
        file: string;
        toolId: string;
        reason: 'setting-disabled' | 'tool-missing';
    }>;
    /**
     * Rendered INSIDE an integration section (see `aiIntegrations`), where the
     * section already carries the heading and the modal body already scrolls.
     * Drops this list's own "Skills · N" summary and its fixed-height scroll
     * region; the group header stays, because within a section it names the
     * skill set ("Storefront skills · 6") rather than repeating the section.
     */
    flat?: boolean;
}

/** Human copy per gated reason. */
function gatedReasonLabel(reason: 'setting-disabled' | 'tool-missing'): string {
    return reason === 'setting-disabled'
        ? 'requires Playwright — disabled by the third-party tooling setting'
        : 'requires Playwright — tool not installed; Regenerate AI Files installs it';
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
/*
 * Adobe pairs each MCP server with a skill set and names the pair on one line
 * (developer.adobe.com/commerce/extensibility/developer-agent/dropins-mcp-server):
 * "installs the @dropins/mcp server and a set of storefront-specific agent
 * skills, alongside the standard commerce-extensibility MCP server and App
 * Builder skills." Those two headings — Storefront skills / App Builder skills
 * — are the parallel pair, and they sit next to the matching MCP rows in this
 * same modal.
 *
 * Experience League titles the storefront page "Boilerplate skills" and calls
 * the thing you install the "AEM Boilerplate Commerce skill set"; both are
 * real, and "Storefront skills" is the one that reads as a peer of "App
 * Builder skills". The starter-kit ids (`aem-boilerplate-commerce`) are CLI
 * arguments, not names.
 */
// Bundle labels + provenance live in `aiSurfaceNames` — shared with the coherence suite.

/**
 * Row titles as Adobe's own docs write them, keyed by the skill name with its
 * bundle prefix stripped.
 *
 * Only the cases `titleFromSlug` gets WRONG are listed — the rest derive
 * correctly and an entry here would just be another thing to keep in sync.
 *
 * Storefront six: the "What the skills provide" table at
 * experienceleague.adobe.com/developer/commerce/storefront/ai/boilerplate-skills/
 * — sentence case, and "Drop-in developer" hyphenated even though the skill id
 * is `dropin-developer`.
 *
 * App Builder seven: the titled table in the `commerce-extensibility-tools`
 * README, which is the only place Adobe writes display titles for them (the
 * docs list slash commands instead). It uses Title Case; we render sentence
 * case so one list does not mix two conventions, keeping DevOps as the proper
 * noun it is. Both read 2026-08-26.
 */
const SKILL_TITLE_OVERRIDES: Readonly<Record<string, string>> = {
    'dropin-developer': 'Drop-in developer',
    'devops-engineer': 'DevOps engineer',
};

/**
 * `add-component` → `Add component`. Sentence case, matching how the docs
 * write their skill titles ("Block developer", not "Block Developer").
 */
function titleFromSlug(slug: string): string {
    const spaced = slug.replace(/-/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The title a user can match against Adobe's documentation. On disk a bundled
 * skill is `aem-block-developer` — we prefix the directory so two bundles that
 * both ship a `tester` stay distinct, and Claude requires the `name:` to match
 * that directory. Neither constraint applies to a catalog a person reads, and
 * the prefixed slug appears nowhere in the docs. The literal name still renders
 * beside the title, muted, because this modal doubles as a debugging surface.
 */
function displayTitleOf(skill: SkillInventoryEntry): string {
    const bare =
        skill.bundle && skill.name.startsWith(`${skill.bundle}-`)
            ? skill.name.slice(skill.bundle.length + 1)
            : skill.name;
    return SKILL_TITLE_OVERRIDES[bare] ?? titleFromSlug(bare);
}

/** Rank for the canonical render order: Demo Builder → Adobe bundles → Custom. */
const SOURCE_ORDER: Readonly<Record<SkillSource, number>> = {
    'demo-builder': 0,
    adobe: 1,
    unknown: 2,
};

/*
 * "…skills", so a group reads as a SET beside its MCP server inside an
 * integration section ("Demo Builder · 107 tools" / "Demo Builder skills · 15")
 * rather than repeating the section heading back at the reader.
 */
const SOURCE_LABELS: Readonly<Record<SkillSource, string>> = {
    'demo-builder': 'Demo Builder skills',
    adobe: 'Adobe skills',
    unknown: 'Custom skills',
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
    return BUNDLE_LABELS[skill.bundle]?.label ?? SOURCE_LABELS.adobe;
}

export function AiSkillsList({
    skills,
    hasError = false,
    isLoading = false,
    editedFiles,
    gatedSkills,
    flat = false,
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
            // Sort by the DISPLAYED title, not the on-disk name — the list
            // renders titles (same rule AiMcpsList follows for its labels).
            group.items.sort((a, b) => displayTitleOf(a).localeCompare(displayTitleOf(b)));
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

    // Nothing to show means NEITHER installed skills nor gated ones. Testing only
    // `skills` broke the modal twice over (2026-09-02): the capabilities modal
    // mounts one of these purely to carry the gated list, with `skills` hard-wired
    // empty, so this early return fired every time — printing "No skills yet"
    // directly under sections that were listing the project's skills and MCP
    // servers, and swallowing the gated list, which could therefore never render
    // at all.
    const hasGated = (gatedSkills?.length ?? 0) > 0;
    if (skills.length === 0 && !hasGated) {
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
            {!flat && (
                <Text data-testid="ai-skills-summary" UNSAFE_className="ai-section-heading">
                    Skills · {skills.length}
                </Text>
            )}
            {/* Fixed-height scroll region — the modal frame never resizes.
                Inside a section the modal body owns the scrolling, so a nested
                one would trap the wheel in a short inner box. */}
            <div className={flat ? undefined : 'ai-skills-scroll'}>
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
                                    {displayTitleOf(skill)}
                                    <span
                                        data-testid="ai-skill-literal-name"
                                        className="text-gray-600"
                                    >
                                        {' '}
                                        · {skill.name}
                                    </span>
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
                {gatedSkills && gatedSkills.length > 0 && (
                    <div>
                        <div className="ai-skills-group-header" data-testid="ai-skills-group-gated">
                            Not available · {gatedSkills.length}
                        </div>
                        <Flex direction="column" gap="size-50">
                            {gatedSkills.map((g) => (
                                <Text
                                    key={g.file}
                                    data-testid="ai-skill-gated-row"
                                    UNSAFE_className="text-gray-600"
                                >
                                    {g.file} · {gatedReasonLabel(g.reason)}
                                </Text>
                            ))}
                        </Flex>
                    </div>
                )}
            </div>
        </Flex>
    );
}
