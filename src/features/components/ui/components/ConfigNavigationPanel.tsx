/**
 * ConfigNavigationPanel - Configuration-specific navigation wrapper
 *
 * Adapts ServiceGroup data to the shared NavigationPanel component.
 * Transforms feature-specific data shape while preserving all behavior.
 */
import React, { useMemo } from 'react';
import { NavigationPanel, NavigationSection } from '@/core/ui/components/navigation/NavigationPanel';
import { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';

interface SectionCompletion {
    total: number;
    completed: number;
    isComplete: boolean;
}

interface ConfigNavigationPanelProps {
    serviceGroups: ServiceGroup[];
    expandedNavSections: Set<string>;
    activeSection: string | null;
    activeField: string | null;
    onToggleSection: (sectionId: string) => void;
    onNavigateToField: (fieldKey: string) => void;
    getSectionCompletion: (group: ServiceGroup) => SectionCompletion;
    isFieldComplete: (field: UniqueField) => boolean;
}

/**
 * Transform a ServiceGroup to NavigationSection (SOP §6 compliance)
 *
 * Extracts callback body for improved readability and testability.
 */
function toNavigationSection(
    group: ServiceGroup,
    getSectionCompletion: (group: ServiceGroup) => SectionCompletion,
    isFieldComplete: (field: UniqueField) => boolean,
): NavigationSection {
    const completion = getSectionCompletion(group);
    return {
        id: group.id,
        label: group.label,
        isComplete: completion.isComplete,
        completedCount: completion.completed,
        totalCount: completion.total,
        fields: group.fields.map((field) => ({
            key: field.key,
            label: field.label,
            isComplete: isFieldComplete(field),
        })),
    };
}

/**
 * ConfigNavigationPanel
 *
 * Thin wrapper that transforms ServiceGroup data into NavigationSection format
 * and delegates rendering to the shared NavigationPanel component.
 */
export function ConfigNavigationPanel({
    serviceGroups,
    expandedNavSections,
    activeSection,
    activeField,
    onToggleSection,
    onNavigateToField,
    getSectionCompletion,
    isFieldComplete,
}: ConfigNavigationPanelProps) {
    // SOP §6: Using extracted transformation function
    const sections: NavigationSection[] = useMemo(() =>
        serviceGroups.map((group) => toNavigationSection(group, getSectionCompletion, isFieldComplete)),
        [serviceGroups, getSectionCompletion, isFieldComplete],
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <NavigationPanel
                sections={sections}
                activeSection={activeSection}
                activeField={activeField}
                expandedSections={expandedNavSections}
                onToggleSection={onToggleSection}
                onNavigateToField={onNavigateToField}
            />
        </div>
    );
}
