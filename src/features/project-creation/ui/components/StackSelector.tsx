/**
 * StackSelector Component
 *
 * Compact stack selection cards for the Welcome step.
 * Supports keyboard navigation with arrow keys.
 */

import { Text } from '@adobe/react-spectrum';
import React, { useCallback, useRef } from 'react';
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
    onNavigate: (direction: 'prev' | 'next' | 'first' | 'last') => void;
    cardRef: React.RefObject<HTMLDivElement>;
}

const StackCard: React.FC<StackCardProps> = ({ stack, isSelected, onSelect, onNavigate, cardRef }) => {
    const handleClick = useCallback(() => {
        onSelect(stack.id);
    }, [stack.id, onSelect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    onSelect(stack.id);
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    onNavigate('prev');
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                    e.preventDefault();
                    onNavigate('next');
                    break;
                case 'Home':
                    e.preventDefault();
                    onNavigate('first');
                    break;
                case 'End':
                    e.preventDefault();
                    onNavigate('last');
                    break;
            }
        },
        [stack.id, onSelect, onNavigate],
    );

    const requiresSetup = stack.requiresGitHub || stack.requiresDaLive;

    return (
        <div
            ref={cardRef}
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
    // Create refs for each card to manage focus
    const cardRefs = useRef<Array<React.RefObject<HTMLDivElement>>>([]);

    // Ensure we have refs for all stacks
    if (cardRefs.current.length !== stacks.length) {
        cardRefs.current = stacks.map(() => React.createRef<HTMLDivElement>());
    }

    // Handle keyboard navigation between cards
    const handleNavigate = useCallback((currentIndex: number, direction: 'prev' | 'next' | 'first' | 'last') => {
        let targetIndex: number;

        switch (direction) {
            case 'prev':
                targetIndex = currentIndex > 0 ? currentIndex - 1 : stacks.length - 1;
                break;
            case 'next':
                targetIndex = currentIndex < stacks.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'first':
                targetIndex = 0;
                break;
            case 'last':
                targetIndex = stacks.length - 1;
                break;
        }

        // Focus the target card
        cardRefs.current[targetIndex]?.current?.focus();
    }, [stacks.length]);

    return (
        <div className="selector-grid" role="listbox" aria-label="Architecture selection">
            {stacks.map((stack, index) => (
                <StackCard
                    key={stack.id}
                    stack={stack}
                    isSelected={selectedStack === stack.id}
                    onSelect={onSelect}
                    onNavigate={(direction) => handleNavigate(index, direction)}
                    cardRef={cardRefs.current[index]}
                />
            ))}
        </div>
    );
};
