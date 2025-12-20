/**
 * StackSelector Component
 *
 * Compact stack selection cards for the Welcome step.
 */

import { Text } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { Stack } from '@/types/stacks';

export interface StackSelectorProps {
    stacks: Stack[];
    selectedStack?: string;
    onSelect: (stackId: string) => void;
}

interface StackCardProps {
    stack: Stack;
    isSelected: boolean;
    onSelect: (stackId: string) => void;
}

const StackCard: React.FC<StackCardProps> = ({ stack, isSelected, onSelect }) => {
    const handleClick = useCallback(() => {
        onSelect(stack.id);
    }, [stack.id, onSelect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(stack.id);
            }
        },
        [stack.id, onSelect],
    );

    const requiresSetup = stack.requiresGitHub || stack.requiresDaLive;

    return (
        <div
            role="button"
            tabIndex={0}
            data-testid="stack-card"
            data-selected={isSelected ? 'true' : 'false'}
            data-requires-setup={requiresSetup ? 'true' : 'false'}
            aria-selected={isSelected ? 'true' : 'false'}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="selector-card"
            aria-pressed={isSelected}
            aria-label={`${stack.name}: ${stack.description}`}
        >
            <Text UNSAFE_className="selector-card-name">
                {stack.name}
            </Text>
            <Text UNSAFE_className="selector-card-description">
                {stack.description}
            </Text>
            {stack.features && stack.features.length > 0 && (
                <ul className="selector-card-features">
                    {stack.features.map((feature, index) => (
                        <li key={index}>{feature}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export const StackSelector: React.FC<StackSelectorProps> = ({
    stacks,
    selectedStack,
    onSelect,
}) => {
    return (
        <div className="selector-grid">
            {stacks.map((stack) => (
                <StackCard
                    key={stack.id}
                    stack={stack}
                    isSelected={selectedStack === stack.id}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
};
