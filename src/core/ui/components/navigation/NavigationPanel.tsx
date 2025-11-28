import React, { useCallback } from 'react';
import { Heading, Flex, Text } from '@adobe/react-spectrum';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';

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
 * Get styles for section button (SOP §6 compliance - extracted style object)
 */
function getSectionButtonStyles(isActive: boolean): React.CSSProperties {
    return {
        width: '100%',
        padding: '12px',
        background: isActive ? 'var(--spectrum-global-color-gray-200)' : 'transparent',
        border: '1px solid var(--spectrum-global-color-gray-300)',
        borderLeft: isActive
            ? '3px solid var(--spectrum-global-color-blue-500)'
            : '1px solid var(--spectrum-global-color-gray-300)',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '4px',
        transition: 'all 0.2s ease',
    };
}

/**
 * Get styles for field button (SOP §6 compliance - extracted style object)
 */
function getFieldButtonStyles(isActiveField: boolean): React.CSSProperties {
    return {
        width: '100%',
        padding: '8px 12px',
        background: isActiveField ? 'var(--spectrum-global-color-blue-100)' : 'transparent',
        border: 'none',
        borderLeft: isActiveField ? '2px solid var(--spectrum-global-color-blue-500)' : 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        textAlign: 'left',
        transition: 'all 0.2s',
        borderRadius: '4px',
    };
}

/**
 * Organism Component: NavigationPanel
 *
 * Configuration navigation sidebar with expandable sections and field navigation.
 * Shows completion status and allows jumping to specific fields.
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
    onNavigateToField
}) => {
    const handleToggleSection = useCallback((sectionId: string) => {
        onToggleSection(sectionId);
    }, [onToggleSection]);

    const handleNavigateToField = useCallback((fieldKey: string) => {
        onNavigateToField(fieldKey);
    }, [onNavigateToField]);

    return (
        <div
            style={{
                flex: '1',
                padding: '24px',
                backgroundColor: 'var(--spectrum-global-color-gray-75)',
                borderLeft: '1px solid var(--spectrum-global-color-gray-200)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            <Heading level={3} marginBottom="size-200">
                Sections
            </Heading>

            <Flex direction="column" gap="size-150" UNSAFE_style={{ overflowY: 'auto', flex: 1 }}>
                {sections.map((section) => {
                    const isExpanded = expandedSections.has(section.id);
                    const isActive = activeSection === section.id;

                    return (
                        <div key={section.id} style={{ width: '100%' }}>
                            <button
                                id={`nav-${section.id}`}
                                onClick={() => handleToggleSection(section.id)}
                                tabIndex={-1}
                                style={getSectionButtonStyles(isActive)}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background =
                                            'var(--spectrum-global-color-gray-100)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = 'transparent';
                                    }
                                }}
                            >
                                <Flex width="100%" justifyContent="space-between" alignItems="center">
                                    <Flex gap="size-100" alignItems="center">
                                        {isExpanded ? <ChevronDown size="S" /> : <ChevronRight size="S" />}
                                        <Text
                                            UNSAFE_className={`text-sm ${
                                                isActive ? 'font-bold' : 'font-medium'
                                            }`}
                                        >
                                            {section.label}
                                        </Text>
                                    </Flex>
                                    {section.isComplete ? (
                                        <Text
                                            UNSAFE_className="text-green-600"
                                            UNSAFE_style={{ fontSize: '16px', lineHeight: '16px' }}
                                        >
                                            ✓
                                        </Text>
                                    ) : (
                                        <Text
                                            UNSAFE_className="text-gray-600"
                                            UNSAFE_style={{ fontSize: '14px', lineHeight: '14px' }}
                                        >
                                            {section.totalCount === 0
                                                ? 'Optional'
                                                : `${section.completedCount}/${section.totalCount}`}
                                        </Text>
                                    )}
                                </Flex>
                            </button>

                            {isExpanded && (
                                <div
                                    style={{
                                        marginTop: '4px',
                                        marginLeft: '12px',
                                        paddingLeft: '12px',
                                        borderLeft: '2px solid var(--spectrum-global-color-gray-300)'
                                    }}
                                >
                                    {section.fields.map((field) => {
                                        const isActiveField = activeField === field.key;

                                        return (
                                            <button
                                                key={field.key}
                                                id={`nav-field-${field.key}`}
                                                onClick={() => handleNavigateToField(field.key)}
                                                tabIndex={-1}
                                                style={getFieldButtonStyles(isActiveField)}
                                                onMouseEnter={(e) => {
                                                    if (!isActiveField) {
                                                        e.currentTarget.style.background =
                                                            'var(--spectrum-global-color-gray-100)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isActiveField) {
                                                        e.currentTarget.style.background = 'transparent';
                                                    }
                                                }}
                                            >
                                                <Text
                                                    UNSAFE_className={`text-xs ${
                                                        isActiveField
                                                            ? 'text-blue-600 font-medium'
                                                            : 'text-gray-700'
                                                    }`}
                                                >
                                                    {field.label}
                                                </Text>
                                                {field.isComplete && (
                                                    <Text
                                                        UNSAFE_className="text-green-600"
                                                        UNSAFE_style={{ fontSize: '14px', lineHeight: '14px' }}
                                                    >
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
