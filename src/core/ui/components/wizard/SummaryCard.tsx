/**
 * SummaryCard + LabelValue — the codebase's read-only "review what will happen"
 * presentation, shown before a terminal action (ReviewStep before Create, the
 * Join confirmation before Join). Extracted from ReviewStep so both reuse it.
 */

import { View, Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

/**
 * LabelValue - a single read-only row: a fixed-width label and a value column.
 * Supports an optional inline icon and a secondary sub-items line.
 */
export function LabelValue({ label, value, icon, subItems }: {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    subItems?: string[];
}) {
    return (
        <Flex gap="size-200" alignItems="start">
            <Text
                UNSAFE_className="review-label"
                UNSAFE_style={{
                    width: '120px',
                    flexShrink: 0,
                }}
            >
                {label}
            </Text>
            <Flex direction="column" gap="size-50" flex={1}>
                <Flex gap="size-100" alignItems="center">
                    {icon}
                    {typeof value === 'string' ? (
                        <Text UNSAFE_className="text-md">{value}</Text>
                    ) : (
                        value
                    )}
                </Flex>
                {subItems && subItems.length > 0 && (
                    <Text UNSAFE_className="description-text">
                        {subItems.join(' · ')}
                    </Text>
                )}
            </Flex>
        </Flex>
    );
}

/**
 * SummaryCard - a titled group of read-only LabelValue rows in a subtle card.
 * Uses a background tint (not dividers) for clean visual separation.
 */
export function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View
            padding="size-200"
            borderRadius="medium"
            UNSAFE_style={{
                backgroundColor: 'var(--spectrum-gray-75)',
            }}
        >
            <Text UNSAFE_className={cn('text-sm', 'font-semibold', 'text-gray-600', 'text-uppercase', 'letter-spacing-05')}>
                {title}
            </Text>
            <Flex direction="column" gap="size-150" marginTop="size-150">
                {children}
            </Flex>
        </View>
    );
}
