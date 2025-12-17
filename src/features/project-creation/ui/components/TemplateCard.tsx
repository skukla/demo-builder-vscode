/**
 * TemplateCard Component
 *
 * Template card matching ProjectCard styling for visual consistency.
 */

import { Text } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { DemoTemplate } from '@/types/templates';

export interface TemplateCardProps {
    template: DemoTemplate;
    isSelected: boolean;
    onSelect: (templateId: string) => void;
}

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

    return (
        <div
            role="button"
            tabIndex={0}
            data-selected={isSelected ? 'true' : 'false'}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={`project-card-spectrum ${isSelected ? 'template-card-selected' : ''}`}
            aria-pressed={isSelected}
            aria-label={`${template.name}: ${template.description}`}
        >
            <Text UNSAFE_className="project-card-spectrum-name">
                {template.name}
            </Text>
            <Text UNSAFE_className="project-card-spectrum-components">
                {template.description}
            </Text>
        </div>
    );
};
