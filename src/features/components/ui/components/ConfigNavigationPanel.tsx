import { Heading, Flex, Text } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React from 'react';
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
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Heading level={3} marginBottom="size-200">Configuration</Heading>

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
                                onClick={() => onToggleSection(group.id)}
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
                                <div style={{
                                    marginTop: '4px',
                                    marginLeft: '12px',
                                    paddingLeft: '12px',
                                    borderLeft: '2px solid var(--spectrum-global-color-gray-300)',
                                }}>
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
                                                {isComplete && <Text UNSAFE_className="text-green-600" UNSAFE_style={{ fontSize: '14px', lineHeight: '14px' }}>✓</Text>}
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
}
