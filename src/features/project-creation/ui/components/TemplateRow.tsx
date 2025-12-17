/**
 * TemplateRow Component
 *
 * Template row for list view display with horizontal layout.
 * Part of the Template Gallery system.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { DemoTemplate } from '@/types/templates';

export interface TemplateRowProps {
    /** Template data to display */
    template: DemoTemplate;
    /** Whether this row is currently selected */
    isSelected: boolean;
    /** Callback when row is selected */
    onSelect: (templateId: string) => void;
}

/**
 * TemplateRow - Displays a single template as a selectable row
 *
 * Features:
 * - Horizontal layout: Name → Description
 * - Full-width clickable area
 * - Selection state styling
 * - Keyboard accessible
 */
export const TemplateRow: React.FC<TemplateRowProps> = ({
    template,
    isSelected,
    onSelect,
}) => {
    const handleClick = useCallback(() => {
        onSelect(template.id);
    }, [template.id, onSelect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(template.id);
            }
        },
        [template.id, onSelect],
    );

    return (
        <div
            role="button"
            tabIndex={0}
            data-selected={isSelected ? 'true' : 'false'}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={`template-row ${isSelected ? 'template-row-selected' : ''}`}
            aria-pressed={isSelected}
            aria-label={`${template.name}: ${template.description}`}
        >
            <Flex alignItems="center" gap="size-200" width="100%">
                {/* Name */}
                <Text UNSAFE_className="template-row-name flex-shrink-0">
                    {template.name}
                </Text>

                {/* Description - flexible width */}
                <Text UNSAFE_className="template-row-description flex-grow truncate">
                    {template.description}
                </Text>
            </Flex>
        </div>
    );
};
