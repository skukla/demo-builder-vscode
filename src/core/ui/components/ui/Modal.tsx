import React, { ReactNode } from 'react';
import { Dialog, DialogAction } from '@/core/ui/components/aria';

export interface ActionButton {
    label: string;
    variant: 'primary' | 'secondary' | 'accent' | 'negative';
    onPress: () => void;
}

export interface ModalProps {
    /** Whether the modal is open */
    isOpen?: boolean;
    title: string;
    size?: 'S' | 'M' | 'L' | 'fullscreen' | 'fullscreenTakeover';
    actionButtons?: ActionButton[];
    onClose: () => void;
    children: ReactNode;
}

/**
 * Modal Component
 *
 * A modal dialog wrapper that uses the React Aria Dialog component.
 * Provides backwards compatibility with the old Modal API while using
 * the new accessible Dialog implementation.
 */
export function Modal({
    isOpen = true,
    title,
    size = 'M',
    actionButtons = [],
    onClose,
    children,
}: ModalProps) {
    // Map custom sizes to Dialog-compatible sizes
    const dialogSize: 'S' | 'M' | 'L' =
        size === 'fullscreen' || size === 'fullscreenTakeover' ? 'L' : size;

    // Map ActionButton to DialogAction (handle 'primary' variant mapping)
    const dialogActions: DialogAction[] = actionButtons.map(button => ({
        label: button.label,
        variant: button.variant === 'primary' ? 'accent' : button.variant,
        onPress: button.onPress,
    }));

    return (
        <Dialog
            isOpen={isOpen}
            title={title}
            size={dialogSize}
            actionButtons={dialogActions}
            onClose={onClose}
            isDismissable
        >
            {children}
        </Dialog>
    );
}

