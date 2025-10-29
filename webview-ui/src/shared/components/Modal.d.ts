import React, { ReactNode } from 'react';
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
export declare function Modal({ title, size, actionButtons, onClose, children }: ModalProps): React.JSX.Element;
export {};
//# sourceMappingURL=Modal.d.ts.map