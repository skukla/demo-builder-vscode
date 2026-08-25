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

export const mockOnMessage = jest.fn(() => () => {});

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
        postMessage: jest.fn(),
        // Returns its unsubscribe, because the shell calls it from a useEffect
        // cleanup — a mock returning undefined crashes on unmount.
        onMessage: (...args: unknown[]) => mockOnMessage(...(args as [])),
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
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
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
    Picker: ({ label, items, selectedKey, onSelectionChange, children, ...props }: any) => (
        <label>
            {label}
            <select
                value={selectedKey ?? ''}
                onChange={(e) => onSelectionChange(e.target.value)}
                {...props}
            >
                <option value="">Choose</option>
                {[...(items ?? [])].map((item: any) => {
                    const rendered = children(item);
                    return (
                        <option key={rendered.key} value={rendered.key}>
                            {rendered.props.children}
                        </option>
                    );
                })}
            </select>
        </label>
    ),
    Item: ({ children }: any) => <>{children}</>,
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

/** A saved prompt as the library returns it. */
export const SAVED_PROMPT = {
    id: 'saved-1',
    title: 'deploy the mesh',
    prompt: 'deploy the mesh',
};

/**
 * Answer each message type in turn, the way the real handlers do.
 *
 * The workbench sends four different messages now, and a single
 * `mockResolvedValue` answers all of them with the same envelope — which quietly
 * makes a test pass for the wrong reason (a picker "populated" by a verdict).
 */
export function respondByType(
    byType: Record<string, unknown>,
    fallback: unknown = { success: true }
): void {
    mockRequest.mockImplementation(async (type: string) =>
        type in byType ? byType[type] : fallback
    );
}

/** userEvent MUST be told about the fake timers (tests/setup/react.ts installs them). */
export function setupUser() {
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

export function renderWorkbench(project: Partial<Project> = {}) {
    return render(<EvaluationWorkbench project={{ ...PROJECT, ...project } as Project} />);
}

export function resetWorkbenchMocks(): void {
    jest.clearAllMocks();
    mockRequest.mockReset();
    mockOnMessage.mockReset();
    mockOnMessage.mockReturnValue(() => {});
}

/** Deliver a push the way the extension does, to whatever the shell subscribed. */
export function pushMessage(type: string, data: unknown): void {
    for (const [subscribedType, handler] of mockOnMessage.mock.calls as unknown as [
        string,
        (d: unknown) => void,
    ][]) {
        if (subscribedType === type) handler(data);
    }
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
            priorRuns: 0,
            threadId: 'thread-1',
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
