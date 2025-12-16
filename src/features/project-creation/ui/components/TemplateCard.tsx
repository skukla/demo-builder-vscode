/**
 * TemplateCard Component
 *
 * Enhanced template card for grid view display with icon, tags, and featured badge.
 * Part of the Template Gallery system.
 */

import { Flex, Text, Badge } from '@adobe/react-spectrum';
import Star from '@spectrum-icons/workflow/Star';
import React, { useCallback } from 'react';
import { DemoTemplate } from '@/types/templates';

export interface TemplateCardProps {
    /** Template data to display */
    template: DemoTemplate;
    /** Whether this card is currently selected */
    isSelected: boolean;
    /** Callback when card is selected */
    onSelect: (templateId: string) => void;
}

/**
 * TemplateCard - Displays a single template as a selectable card
 *
 * Features:
 * - Icon display (optional)
 * - Name and description
 * - Tags as small chips
 * - Featured badge
 * - Selection state styling
 * - Keyboard accessible
 */
export const TemplateCard: React.FC<TemplateCardProps> = ({
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

    const hasIcon = Boolean(template.icon);
    const hasTags = template.tags && template.tags.length > 0;

    return (
        <div
            role="button"
            tabIndex={0}
            data-selected={isSelected ? 'true' : 'false'}
            data-has-icon={hasIcon ? 'true' : 'false'}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={`template-card ${isSelected ? 'template-card-selected' : ''}`}
            aria-pressed={isSelected}
            aria-label={`${template.name}: ${template.description}`}
        >
            <Flex direction="column" gap="size-100">
                {/* Header with icon and featured badge */}
                <Flex justifyContent="space-between" alignItems="center">
                    <Flex alignItems="center" gap="size-100">
                        {hasIcon && (
                            <Star size="S" UNSAFE_className="text-gray-600" />
                        )}
                        <Text UNSAFE_className="template-card-name">
                            {template.name}
                        </Text>
                    </Flex>
                    {template.featured && (
                        <Badge variant="positive" UNSAFE_className="template-featured-badge">
                            Featured
                        </Badge>
                    )}
                </Flex>

                {/* Description */}
                <Text UNSAFE_className="template-card-description">
                    {template.description}
                </Text>

                {/* Tags */}
                {hasTags && (
                    <Flex gap="size-75" wrap>
                        {template.tags!.map((tag) => (
                            <span key={tag} className="template-tag">
                                {tag}
                            </span>
                        ))}
                    </Flex>
                )}
            </Flex>
        </div>
    );
};
