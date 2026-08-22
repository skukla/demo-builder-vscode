/**
 * CtaEmptyState — the "nothing here yet, start here" screen.
 *
 * The Projects dashboard's first-run look (bold centered title, one muted
 * sentence, a primary CTA with optional siblings), extracted 2026-08-22 when
 * the Integrations surface asked for the same look — the extract-at-two rule
 * for demonstrated cross-surface demand. Distinct from `EmptyState`, which is
 * the icon-in-a-well INLINE notice for "no results in this list"; this one
 * owns a whole region and carries the actions.
 *
 * @module core/ui/components/feedback/CtaEmptyState
 */

import { Flex, Text, Button } from '@adobe/react-spectrum';
import type { FocusableRefValue } from '@react-types/shared';
import React, { useCallback } from 'react';

/** One action button — the same shape StatusDisplay's actions use. */
export interface CtaEmptyStateAction {
    label: string;
    /** Spectrum button variant; the first action is usually 'cta'/'accent'. */
    variant: 'cta' | 'accent' | 'primary' | 'secondary';
    onPress: () => void;
    /** Optional leading icon element. */
    icon?: React.ReactNode;
}

export interface CtaEmptyStateProps {
    /** Bold centered headline, e.g. "No projects yet". */
    title: string;
    /** One muted sentence under the title. */
    description: string;
    /** Action buttons, rendered in order; the first can receive auto-focus. */
    actions: CtaEmptyStateAction[];
    /** Auto-focus the first action button (first-run keyboard flow). */
    autoFocus?: boolean;
}

export const CtaEmptyState: React.FC<CtaEmptyStateProps> = ({
    title,
    description,
    actions,
    autoFocus = false,
}) => {
    const focusRef = useCallback(
        (node: FocusableRefValue<HTMLElement, HTMLElement> | null) => {
            if (autoFocus && node) {
                const domNode = node.UNSAFE_getDOMNode?.() ?? (node as unknown as HTMLElement);
                domNode?.focus();
            }
        },
        [autoFocus],
    );

    return (
        <Flex justifyContent="center" alignItems="center" height="100%" minHeight="350px">
            <Flex
                direction="column"
                alignItems="center"
                gap="size-300"
                UNSAFE_className="centered-content-narrow"
            >
                <Text UNSAFE_className="text-lg">
                    <strong>{title}</strong>
                </Text>
                <Text UNSAFE_className="description-text">{description}</Text>
                <Flex gap="size-200" alignItems="center">
                    {actions.map((action, index) => (
                        <Button
                            key={action.label}
                            ref={index === 0 ? focusRef : undefined}
                            variant={action.variant}
                            onPress={action.onPress}
                        >
                            {action.icon}
                            <Text>{action.label}</Text>
                        </Button>
                    ))}
                </Flex>
            </Flex>
        </Flex>
    );
};
