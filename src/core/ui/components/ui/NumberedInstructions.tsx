import React from 'react';
import { Flex, Text } from '@adobe/react-spectrum';

export interface Instruction {
    step: string;
    details: string;
    important?: boolean;
}

export interface NumberedInstructionsProps {
    description?: string;
    instructions: Instruction[];
}

/**
 * Styles for inline code snippets (SOP §6 compliance - extracted style object)
 */
const CODE_SNIPPET_STYLES: React.CSSProperties = {
    fontFamily: 'var(--spectrum-alias-body-text-font-family, monospace)',
    fontSize: '0.9em',
    backgroundColor: '#1a1a1a',
    padding: '4px 10px',
    borderRadius: '4px',
    color: 'var(--spectrum-global-color-blue-700)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
};

// Helper function to render text with code highlighting for quoted content
const renderInstructionText = (text: string) => {
    // Split by single quotes to find code snippets
    const parts = text.split(/('.*?')/g);
    
    return (
        <>
            {parts.map((part, i) => {
                // If the part starts and ends with single quotes, it's code
                if (part.startsWith("'") && part.endsWith("'")) {
                    // Remove the quotes and wrap in styled code element
                    return (
                        <code key={i} style={CODE_SNIPPET_STYLES}>
                            {part.slice(1, -1)}
                        </code>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
};

export function NumberedInstructions({ description, instructions }: NumberedInstructionsProps) {
    return (
        <Flex direction="column" gap="size-200">
            {description && <Text>{description}</Text>}
            {instructions.map((instruction, index) => (
                <Flex
                    key={index}
                    direction="row"
                    gap="size-150"
                    UNSAFE_className="instruction-card"
                >
                    {/* Circular number badge */}
                    <div className="number-badge">
                        {index + 1}
                    </div>

                    {/* Content */}
                    <Flex direction="column" gap="size-75" flex={1}>
                        <Text UNSAFE_className="font-semibold instruction-title">
                            {instruction.step}
                        </Text>
                        <Text UNSAFE_className="text-sm text-gray-600 instruction-details">
                            {renderInstructionText(instruction.details)}
                        </Text>
                    </Flex>
                </Flex>
            ))}
        </Flex>
    );
}

