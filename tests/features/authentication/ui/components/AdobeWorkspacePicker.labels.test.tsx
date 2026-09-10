/**
 * WHAT THE PICKER HANDS THE LIST. The sibling suite mocks the hook and reads the
 * SCREEN, which is `SelectionStepContent` rendering whatever it was given; so the
 * label fallbacks and the description renderer were never pinned — the mutation run
 * of 2026-09-03 flipped every branch in them with the suite green. Here the list is
 * the double, and the assertions are on its ARGUMENTS.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import type { SelectionStepContentProps } from '@/core/ui/components/selection/SelectionStepContent';
import type { WizardState, Workspace } from '@/types/webview';

jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

const mockSelectionStepContent = jest.fn((_props: SelectionStepContentProps<Workspace>) => null);
jest.mock('@/core/ui/components/selection/SelectionStepContent', () => ({
    SelectionStepContent: (props: SelectionStepContentProps<Workspace>) =>
        mockSelectionStepContent(props),
}));

// Below the mocks on purpose: they hoist above the imports of THIS module.
import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
import { AdobeWorkspacePicker } from '@/features/authentication/ui/components/AdobeWorkspacePicker';
import { baseState, createMockUseSelectionStepReturn } from './AdobeWorkspacePicker.testUtils';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

function listProps(state: Partial<WizardState> = baseState): SelectionStepContentProps<Workspace> {
    mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());
    render(
        <Provider theme={defaultTheme}>
            <AdobeWorkspacePicker state={state as WizardState} updateState={jest.fn()} />
        </Provider>,
    );
    return mockSelectionStepContent.mock.calls[0][0];
}

describe('AdobeWorkspacePicker — what it hands SelectionStepContent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('labels', () => {
        it('names the project by title in the loading and empty copy', () => {
            const { labels } = listProps();
            expect(labels.loadingSubMessage).toBe('Fetching from project: Test Project');
            expect(labels.emptyMessage).toBe(
                'No workspaces found in project Test Project. ' +
                    'Please create a workspace in Adobe Console first.',
            );
        });

        it('falls back to the project name when it has no title', () => {
            const { labels } = listProps({
                ...baseState,
                adobeProject: { id: 'project1', name: 'test-project' },
            });
            expect(labels.loadingSubMessage).toBe('Fetching from project: test-project');
            expect(labels.emptyMessage).toContain('in project test-project.');
        });

        it('omits the loading sub-message when no project is selected', () => {
            const { labels } = listProps({ ...baseState, adobeProject: undefined });
            expect(labels.loadingSubMessage).toBeUndefined();
        });
    });

    describe('renderDescription', () => {
        function describe_(item: Workspace): React.ReactNode {
            const { renderDescription } = listProps();
            if (!renderDescription) throw new Error('picker handed no renderDescription');
            return renderDescription(item);
        }

        it('shows the name under a title that differs from it', () => {
            const node = describe_({ id: 'w', name: 'stage-eu', title: 'Stage Environment' });
            render(<Provider theme={defaultTheme}>{node}</Provider>);
            expect(screen.getByText('stage-eu')).toBeInTheDocument();
        });

        it('shows nothing when the title merely repeats the name', () => {
            expect(describe_({ id: 'w', name: 'Stage', title: 'Stage' })).toBeNull();
        });

        it('shows nothing when there is no title to differ from', () => {
            expect(describe_({ id: 'w', name: 'Stage' })).toBeNull();
        });
    });
});
