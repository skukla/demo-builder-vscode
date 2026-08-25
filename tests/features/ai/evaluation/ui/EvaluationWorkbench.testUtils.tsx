/**
 * Mocks + render helper for the EvaluationWorkbench suite.
 *
 * THE SUT IS IMPORTED HERE, not in the spec. `babel-plugin-jest-hoist` lifts
 * `jest.mock` above the imports of the module it appears in, not across
 * modules — so a spec importing the component directly would bind it to REAL
 * Spectrum, and fail as confusing assertion noise rather than a clear error.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

export const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
        postMessage: jest.fn(),
    },
}));

// Only what the tree renders. `...props` LAST so a data-testid the component
// passes overrides anything the stub hardcodes.
jest.mock('@adobe/react-spectrum', () => ({
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>
            {children}
        </button>
    ),
    ButtonGroup: ({ children }: any) => <div>{children}</div>,
    Flex: ({ children }: any) => <div>{children}</div>,
    View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Heading: ({ children }: any) => <h3>{children}</h3>,
    Text: ({ children }: any) => <span>{children}</span>,
    TextArea: ({ label, value, onChange, isDisabled, placeholder }: any) => (
        <label>
            {label}
            <textarea
                value={value}
                placeholder={placeholder}
                disabled={isDisabled}
                onChange={(e) => onChange(e.target.value)}
            />
        </label>
    ),
    Disclosure: ({ children }: any) => <div>{children}</div>,
    DisclosureTitle: ({ children }: any) => <div>{children}</div>,
    DisclosurePanel: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/core/ui/components/layout', () => ({
    PageLayout: ({ header, children }: any) => (
        <div>
            {header}
            {children}
        </div>
    ),
    PageHeader: ({ title, subtitle }: any) => (
        <div>
            <h1>{title}</h1>
            <h2>{subtitle}</h2>
        </div>
    ),
}));

jest.mock('@/core/ui/components/feedback', () => ({
    InlineNotice: ({ title, children, testId }: any) => (
        <div data-testid={testId}>
            {title}: {children}
        </div>
    ),
}));

// Below the mocks on purpose — see the file note. `import/first` is not a
// registered rule in this repo, so there is nothing to disable.
import { EvaluationWorkbench } from '@/features/ai/evaluation/ui/EvaluationWorkbench';
import type { Project } from '@/types/base';

const PROJECT = { name: 'bodea', path: '/tmp/bodea' } as unknown as Project;

/** userEvent MUST be told about the fake timers (tests/setup/react.ts installs them). */
export function setupUser() {
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

export function renderWorkbench() {
    return render(<EvaluationWorkbench project={PROJECT} />);
}

export function resetWorkbenchMocks(): void {
    jest.clearAllMocks();
    mockRequest.mockReset();
}

/** A verdict envelope shaped exactly as the handler returns it. */
export function verdictResponse(overrides: Record<string, unknown> = {}) {
    return {
        success: true,
        data: {
            prompt: 'deploy the mesh',
            costUSD: 0.21,
            numTurns: 5,
            durationMs: 38_000,
            isError: false,
            trace: [step('get_current_project'), step('deploy_mesh', 'blocked-by-dry-run')],
            repeats: [step('get_current_project')],
            blocked: [step('deploy_mesh', 'blocked-by-dry-run')],
            suggestions: [
                {
                    text: 'Say which project you mean, so it does not have to work it out.',
                    evidence: 'It looked up which project you meant twice.',
                    append: ' for bodea',
                },
            ],
            ...overrides,
        },
    };
}

function step(tool: string, outcome: 'ok' | 'error' | 'blocked-by-dry-run' = 'ok') {
    return {
        tool,
        readOnly: outcome === 'ok',
        argumentKeys: [],
        argumentFingerprint: 'none',
        resultBytes: 10,
        durationMs: 3,
        outcome,
        at: 0,
    };
}

export { screen };
