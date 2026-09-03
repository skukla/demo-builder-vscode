/**
 * WHAT THE PICKER HANDS THE LIST. The sibling suites mock the hook and read the
 * SCREEN, which is `SelectionStepContent` rendering whatever it was given; so the
 * label fallbacks, the description renderer, the disabled-row list and the
 * org-switch request were never pinned. Here the list is the double, and the
 * assertions are on its ARGUMENTS.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import type { SelectionStepContentProps } from '@/core/ui/components/selection/SelectionStepContent';
import type { AdobeProject, WizardState } from '@/types/webview';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: (...args: unknown[]) => mockRequest(...args),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

const mockSelectionStepContent = jest.fn((_props: SelectionStepContentProps<AdobeProject>) => null);
jest.mock('@/core/ui/components/selection/SelectionStepContent', () => ({
    SelectionStepContent: (props: SelectionStepContentProps<AdobeProject>) =>
        mockSelectionStepContent(props),
}));

// Below the mocks on purpose: they hoist above the imports of THIS module.
import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
import { AdobeProjectPicker } from '@/features/authentication/ui/components/AdobeProjectPicker';
import { baseState, createMockSelectionStep, mockProjects } from './AdobeProjectPicker.testUtils';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

function listProps(
    state: Partial<WizardState> = baseState,
    extra: Partial<React.ComponentProps<typeof AdobeProjectPicker>> = {},
): SelectionStepContentProps<AdobeProject> {
    mockUseSelectionStep.mockReturnValue(createMockSelectionStep({ items: mockProjects }));
    render(
        <Provider theme={defaultTheme}>
            <AdobeProjectPicker state={state as WizardState} updateState={jest.fn()} {...extra} />
        </Provider>,
    );
    const last = mockSelectionStepContent.mock.calls.at(-1);
    if (!last) throw new Error('SelectionStepContent was never rendered');
    return last[0];
}

describe('AdobeProjectPicker — what it hands SelectionStepContent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest.mockResolvedValue(undefined);
    });

    describe('labels', () => {
        it('names the organization in the loading and empty copy', () => {
            const { labels } = listProps();
            expect(labels.loadingSubMessage).toBe('Fetching from organization: Test Organization');
            expect(labels.emptyMessage).toBe(
                'No projects found in organization Test Organization. ' +
                    'Please create a project in Adobe Console first.',
            );
        });

        it('falls back to generic copy when no org is selected', () => {
            const { labels } = listProps({ ...baseState, adobeOrg: undefined });
            expect(labels.loadingSubMessage).toBe('Fetching projects...');
            expect(labels.emptyMessage).toBe(
                'No projects found. Please create a project in Adobe Console first.',
            );
        });
    });

    describe('highlight and disabled rows', () => {
        it('highlights the committed project by default', () => {
            const props = listProps({ ...baseState, adobeProject: mockProjects[1] });
            expect(props.selectedId).toBe('project2');
        });

        it('lets selectedProjectId override the highlight', () => {
            const props = listProps(
                { ...baseState, adobeProject: mockProjects[1] },
                { selectedProjectId: 'project3' },
            );
            expect(props.selectedId).toBe('project3');
        });

        it('disables no rows while no delete is in flight', () => {
            expect(listProps().disabledIds).toEqual([]);
        });
    });

    describe('renderDescription', () => {
        function describe_(item: AdobeProject): React.ReactNode {
            const { renderDescription } = listProps();
            if (!renderDescription) throw new Error('picker handed no renderDescription');
            return renderDescription(item);
        }

        it('shows the description when there is one', () => {
            const node = describe_({ id: 'p', name: 'p', description: 'What it is for' });
            render(<Provider theme={defaultTheme}>{node}</Provider>);
            expect(screen.getByText('What it is for')).toBeInTheDocument();
        });

        it('shows nothing when there is none', () => {
            expect(describe_({ id: 'p', name: 'p' })).toBeNull();
        });
    });

    describe('onSwitchOrg', () => {
        it('requests a forced org switch from the extension', () => {
            const { onSwitchOrg } = listProps();
            if (!onSwitchOrg) throw new Error('picker handed no onSwitchOrg');
            onSwitchOrg();
            expect(mockRequest).toHaveBeenCalledWith('switchOrg');
        });

        it('swallows a rejected switch request', async () => {
            mockRequest.mockRejectedValue(new Error('offline'));
            const { onSwitchOrg } = listProps();
            if (!onSwitchOrg) throw new Error('picker handed no onSwitchOrg');
            expect(() => onSwitchOrg()).not.toThrow();
            await Promise.resolve();
        });
    });
});
