import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useCallback } from 'react';
import { Heading, Flex, Text } from '@/core/ui/components/aria';
import { cn } from '@/core/ui/utils/classNames';

export interface NavigationField {
    key: string;
    label: string;
    isComplete: boolean;
}

export interface NavigationSection {
    id: string;
    label: string;
    fields: NavigationField[];
    isComplete: boolean;
    completedCount: number;
    totalCount: number;
}

export interface NavigationPanelProps {
    /** Section data */
    sections: NavigationSection[];
    /** Currently active section ID */
    activeSection: string | null;
    /** Currently active field key */
    activeField: string | null;
    /** Expanded section IDs */
    expandedSections: Set<string>;
    /** Toggle section expansion */
    onToggleSection: (sectionId: string) => void;
    /** Navigate to field */
    onNavigateToField: (fieldKey: string) => void;
}

/**
 * Organism Component: NavigationPanel
 *
 * Configuration navigation sidebar with expandable sections and field navigation.
 * Shows completion status and allows jumping to specific fields.
 *
 * SOP §11: Uses CSS classes from custom-spectrum.css instead of inline styles
 *
 * @example
 * ```tsx
 * <NavigationPanel
 *   sections={sections}
 *   activeSection={activeSection}
 *   activeField={activeField}
 *   expandedSections={expandedSections}
 *   onToggleSection={toggleSection}
 *   onNavigateToField={navigateToField}
 * />
 * ```
 */
export const NavigationPanel = React.memo<NavigationPanelProps>(({
    sections,
    activeSection,
    activeField,
    expandedSections,
    onToggleSection,
    onNavigateToField,
}) => {
    const handleToggleSection = useCallback((sectionId: string) => {
        onToggleSection(sectionId);
    }, [onToggleSection]);

    const handleNavigateToField = useCallback((fieldKey: string) => {
        onNavigateToField(fieldKey);
    }, [onNavigateToField]);

    return (
        <div className="nav-panel-container">
            <Heading level={3} marginBottom="size-200">
                Sections
            </Heading>

            <Flex direction="column" gap="size-150" className="nav-panel-scroll">
                {sections.map((section) => {
                    const isExpanded = expandedSections.has(section.id);
                    const isActive = activeSection === section.id;

                    return (
                        <div key={section.id} className="w-full">
                            <button
                                id={`nav-${section.id}`}
                                onClick={() => handleToggleSection(section.id)}
                                tabIndex={-1}
                                className={cn(
                                    'nav-section-button',
                                    isActive && 'nav-section-button-active',
                                )}
                            >
                                <Flex justifyContent="space-between" alignItems="center" style={{ width: '100%' }}>
                                    <Flex gap="size-100" alignItems="center">
                                        {isExpanded ? <ChevronDown size="S" /> : <ChevronRight size="S" />}
                                        <Text
                                            className={`text-sm ${
                                                isActive ? 'font-bold' : 'font-medium'
                                            }`}
                                        >
                                            {section.label}
                                        </Text>
                                    </Flex>
                                    {section.isComplete ? (
                                        <Text className="text-green-600 status-icon-md">
                                            ✓
                                        </Text>
                                    ) : (
                                        <Text className="text-gray-600 status-icon-sm">
                                            {section.totalCount === 0
                                                ? 'Optional'
                                                : `${section.completedCount}/${section.totalCount}`}
                                        </Text>
                                    )}
                                </Flex>
                            </button>

                            {isExpanded && (
                                <div className="nav-section-fields">
                                    {section.fields.map((field) => {
                                        const isActiveField = activeField === field.key;

                                        return (
                                            <button
                                                key={field.key}
                                                id={`nav-field-${field.key}`}
                                                onClick={() => handleNavigateToField(field.key)}
                                                tabIndex={-1}
                                                className={cn(
                                                    'nav-field-button',
                                                    isActiveField && 'nav-field-button-active',
                                                )}
                                            >
                                                <Text
                                                    className={`text-xs ${
                                                        isActiveField
                                                            ? 'text-blue-600 font-medium'
                                                            : 'text-gray-700'
                                                    }`}
                                                >
                                                    {field.label}
                                                </Text>
                                                {field.isComplete && (
                                                    <Text className="text-green-600 status-icon-sm">
                                                        ✓
                                                    </Text>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </Flex>
        </div>
    );
});

NavigationPanel.displayName = 'NavigationPanel';
