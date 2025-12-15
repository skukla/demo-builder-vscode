import { Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { CopyableText } from './CopyableText';

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
 * Helper function to render text with copyable code for quoted content
 * Text wrapped in single quotes becomes clickable to copy
 */
const renderInstructionText = (text: string) => {
    // Split by single quotes to find code snippets
    const parts = text.split(/('.*?')/g);

    return (
        <>
            {parts.map((part, i) => {
                // If the part starts and ends with single quotes, it's copyable
                if (part.startsWith("'") && part.endsWith("'")) {
                    // Remove the quotes and wrap in CopyableText
                    return (
                        <CopyableText key={i}>
                            {part.slice(1, -1)}
                        </CopyableText>
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

