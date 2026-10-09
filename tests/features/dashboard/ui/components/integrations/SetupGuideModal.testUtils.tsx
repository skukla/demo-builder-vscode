/**
 * The SetupGuideModal family's shared setup: the Spectrum and Modal stubs, and the subject,
 * imported HERE below the mocks so every suite gets the stubbed tree (a suite importing the
 * component itself could bind it to real Spectrum before these mocks run).
 */

import React from 'react';

jest.mock('@adobe/react-spectrum', () => ({
    Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
    Button: ({ children, onPress, isDisabled, variant: _v, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} {...props}>
            {children}
        </button>
    ),
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Heading: ({ children }: any) => <h3>{children}</h3>,
    ProgressCircle: ({ 'aria-label': label }: any) => <span role="progressbar" aria-label={label} />,
    Link: ({ children, onPress, isQuiet: _quiet, UNSAFE_className, ...props }: any) => (
        <span role="link" tabIndex={0} onClick={onPress} className={UNSAFE_className} {...props}>
            {children}
        </span>
    ),
    Text: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], onClose, closeLabel, children }: any) => (
        <div role="dialog" aria-label={title}>
            {children}
            <button onClick={onClose}>{closeLabel ?? 'Close'}</button>
            {actionButtons.map((b: any) => (
                <button key={b.label} onClick={b.onPress} disabled={b.isDisabled}>
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

// Below the mocks on purpose: jest.mock hoists above this file's imports.
export {
    FIX_COPY,
    SetupGuideModal,
    setupNextStep,
} from '@/features/dashboard/ui/components/integrations/SetupGuideModal';
