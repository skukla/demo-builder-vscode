import { Dialog, Heading, Content, Divider, ButtonGroup, Button } from '@adobe/react-spectrum';
import React, { ReactNode } from 'react';

export interface ActionButton {
    label: string;
    variant: 'primary' | 'secondary' | 'accent' | 'negative';
    onPress: () => void;
}

export interface ModalProps {
    title: string;
    size?: 'S' | 'M' | 'L' | 'fullscreen' | 'fullscreenTakeover';
    actionButtons?: ActionButton[];
    onClose: () => void;
    children: ReactNode;
}

export function Modal({
    title,
    size = 'M',
    actionButtons = [],
    onClose,
    children,
}: ModalProps) {
    // Map custom sizes to Dialog-compatible sizes
    const dialogSize: 'S' | 'M' | 'L' =
        size === 'fullscreen' || size === 'fullscreenTakeover' ? 'L' : size;

    return (
        <Dialog size={dialogSize}>
            <Heading>{title}</Heading>
            <Divider />
            <Content>
                {children}
            </Content>
            <ButtonGroup>
                {actionButtons.map((button, index) => (
                    <Button 
                        key={index}
                        variant={button.variant} 
                        onPress={button.onPress}
                    >
                        {button.label}
                    </Button>
                ))}
                <Button variant="secondary" onPress={onClose}>
                    Close
                </Button>
            </ButtonGroup>
        </Dialog>
    );
}

