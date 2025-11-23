import React from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import { ServiceGroup, UniqueField } from '../ComponentConfigStep';

interface ConfigNavigationPanelProps {
    serviceGroups: ServiceGroup[];
    expandedNavSections: Set<string>;
    activeSection: string | null;
    activeField: string | null;
    onNavigateToSection: (sectionId: string) => void;
    onNavigateToField: (fieldKey: string) => void;
    onToggleNavSection: (sectionId: string) => void;
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
}

const SCROLL_MARGIN = '24px';
const FIELD_LIST_STYLES = {
    marginTop: '4px',
    marginLeft: '12px',
    paddingLeft: '12px',
    borderLeft: '2px solid var(--spectrum-global-color-gray-300)',
} as const;

export function ConfigNavigationPanel({
    serviceGroups,
    expandedNavSections,
    activeSection,
    activeField,
    onNavigateToSection,
    onNavigateToField,
    onToggleNavSection,
    getFieldValue,
}: ConfigNavigationPanelProps) {
    const getSectionCompletion = (group: ServiceGroup) => {
        const requiredFields = group.fields.filter(f => f.required);

        // If no required fields, section is optional (not "complete")
        if (requiredFields.length === 0) {
            return {
                total: 0,
                completed: 0,
                isComplete: false,
            };
        }

        const completedFields = requiredFields.filter(f => {
            // MESH_ENDPOINT is auto-filled later, so consider it complete if it's deferred
            if (f.key === 'MESH_ENDPOINT') {
                return true; // Mark as complete since it's auto-populated
            }

            const value = getFieldValue(f);
            return value !== undefined && value !== '';
        });

        return {
            total: requiredFields.length,
            completed: completedFields.length,
            isComplete: completedFields.length === requiredFields.length,
        };
    };

    const isFieldComplete = (field: UniqueField): boolean => {
        if (field.key === 'MESH_ENDPOINT') return true; // Auto-populated
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    };

    return (
        <Flex direction="column" gap="size-150" UNSAFE_style={{ overflowY: 'auto', flex: 1 }}>
            {serviceGroups.map((group) => {
                const completion = getSectionCompletion(group);
                const isExpanded = expandedNavSections.has(group.id);
                const isActive = activeSection === group.id;

                return (
                    <div key={group.id} style={{ width: '100%' }}>
                        {/* Section Header */}
                        <button
                            id={`nav-${group.id}`}
                            onClick={() => onToggleNavSection(group.id)}
                            tabIndex={-1}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: isActive ? 'var(--spectrum-global-color-gray-200)' : 'transparent',
                                border: '1px solid var(--spectrum-global-color-gray-300)',
                                borderLeft: isActive ? '3px solid var(--spectrum-global-color-blue-500)' : '1px solid var(--spectrum-global-color-gray-300)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: '4px',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'var(--spectrum-global-color-gray-100)';
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
                                    <Text UNSAFE_className={`text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>{group.label}</Text>
                                </Flex>
                                {completion.isComplete ? (
                                    <Text UNSAFE_className="text-green-600" UNSAFE_style={{ fontSize: '16px', lineHeight: '16px' }}>✓</Text>
                                ) : (
                                    <Text UNSAFE_className="text-gray-600" UNSAFE_style={{ fontSize: '14px', lineHeight: '14px' }}>
                                        {completion.total === 0 ? 'Optional' : `${completion.completed}/${completion.total}`}
                                    </Text>
                                )}
                            </Flex>
                        </button>

                        {/* Expandable Field List */}
                        {isExpanded && (
                            <div style={FIELD_LIST_STYLES}>
                                {group.fields.map((field) => {
                                    const isComplete = isFieldComplete(field);
                                    const isActiveField = activeField === field.key;

                                    return (
                                        <button
                                            key={field.key}
                                            id={`nav-field-${field.key}`}
                                            onClick={() => onNavigateToField(field.key)}
                                            tabIndex={-1}
                                            style={{
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
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isActiveField) {
                                                    e.currentTarget.style.background = 'var(--spectrum-global-color-gray-100)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isActiveField) {
                                                    e.currentTarget.style.background = 'transparent';
                                                }
                                            }}
                                        >
                                            <Text UNSAFE_className={`text-xs ${isActiveField ? 'text-blue-600 font-medium' : 'text-gray-700'}`}>{field.label}</Text>
                                            {isComplete && (
                                                <Text
                                                    data-testid="field-complete-checkmark"
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
    );
}
