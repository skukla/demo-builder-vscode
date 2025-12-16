/**
 * TemplateCardGrid Component
 *
 * Displays demo templates in a responsive card grid for selection.
 * Used in WelcomeStep to allow users to choose a pre-configured template.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { DemoTemplate } from '@/types/templates';

export interface TemplateCardGridProps {
    /** Available templates to display */
    templates: DemoTemplate[];
    /** Currently selected template ID */
    selectedTemplateId?: string;
    /** Callback when a template is selected or deselected */
    onSelect: (templateId: string | undefined) => void;
}

/**
 * TemplateCardGrid - Displays templates as selectable cards
 *
 * Features:
 * - Responsive grid layout
 * - Selection highlighting with data-selected attribute
 * - Toggle selection (click same card to deselect)
 * - Keyboard accessible (Enter/Space to select)
 */
export const TemplateCardGrid: React.FC<TemplateCardGridProps> = ({
    templates,
    selectedTemplateId,
    onSelect,
}) => {
    const handleCardClick = useCallback(
        (templateId: string) => {
            // Toggle selection: if already selected, deselect; otherwise select
            onSelect(selectedTemplateId === templateId ? undefined : templateId);
        },
        [selectedTemplateId, onSelect],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent, templateId: string) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick(templateId);
            }
        },
        [handleCardClick],
    );

    if (templates.length === 0) {
        return (
            <Text UNSAFE_className="text-gray-600">
                No templates available
            </Text>
        );
    }

    return (
        <div className="template-card-grid">
            {templates.map((template) => {
                const isSelected = selectedTemplateId === template.id;

                return (
                    <div
                        key={template.id}
                        role="button"
                        tabIndex={0}
                        data-selected={isSelected ? 'true' : 'false'}
                        onClick={() => handleCardClick(template.id)}
                        onKeyDown={(e) => handleKeyDown(e, template.id)}
                        className={`template-card ${isSelected ? 'template-card-selected' : ''}`}
                        aria-pressed={isSelected}
                        aria-label={`${template.name}: ${template.description}`}
                    >
                        <Flex direction="column" gap="size-100">
                            <Text UNSAFE_className="template-card-name">
                                {template.name}
                            </Text>
                            <Text UNSAFE_className="template-card-description">
                                {template.description}
                            </Text>
                        </Flex>
                    </div>
                );
            })}
        </div>
    );
};
