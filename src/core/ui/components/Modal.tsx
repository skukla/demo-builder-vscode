import React, { ReactNode } from 'react';
import { Dialog, Heading, Content, Divider, ButtonGroup, Button } from '@adobe/react-spectrum';

interface ActionButton {
    label: string;
    variant: 'primary' | 'secondary' | 'accent' | 'negative';
    onPress: () => void;
}

interface ModalProps {
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
    children 
}: ModalProps) {
    return (
        <Dialog size={size}>
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

