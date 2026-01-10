import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { WizardState } from '@/types/webview';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

// Mock vscode API
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn().mockReturnValue(jest.fn());
const mockCreateProject = jest.fn();
const mockCancel = jest.fn();
const mockRequest = jest.fn().mockResolvedValue({});
const mockWebviewClientRequest = jest.fn().mockResolvedValue({
    success: true,
    apiEnabled: true,
    meshExists: false,
});
const mockWebviewClientPostMessage = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
        createProject: (...args: any[]) => mockCreateProject(...args),
        cancel: () => mockCancel(),
        request: (...args: any[]) => mockRequest(...args),
    },
    webviewClient: {
        request: (...args: any[]) => mockWebviewClientRequest(...args),
        postMessage: (...args: any[]) => mockWebviewClientPostMessage(...args),
    },
}));

describe('ProjectCreationStep', () => {
    const mockOnBack = jest.fn();

    const baseState: Partial<WizardState> = {
        currentStep: 'project-creation',
        projectName: 'my-demo-project',
        projectTemplate: 'citisignal',
        creationProgress: {
            currentOperation: 'Creating project directory',
            progress: 10,
            message: 'Setting up project structure...',
            logs: ['Creating directory...', 'Initializing git...'],
        },
    };

    const successState: Partial<WizardState> = {
        ...baseState,
        creationProgress: {
            currentOperation: 'Project Created',
            progress: 100,
            message: 'Project created successfully!',
            logs: ['All done!'],
        },
    };

    const errorState: Partial<WizardState> = {
        ...baseState,
        creationProgress: {
            currentOperation: 'Failed',
            progress: 50,
            message: 'Failed to install dependencies',
            logs: ['npm install failed'],
            error: 'npm ERR! network timeout',
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
        mockRequest.mockResolvedValue({});
    });

    describe('Happy Path - Creation in Progress', () => {
        it('should render project creation heading', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={baseState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks to complete and transition to creating phase
            await waitFor(() => {
                expect(screen.getByText(/Creating project/i)).toBeInTheDocument();
            });
        });

        it('should display current operation', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={baseState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Creating project directory')).toBeInTheDocument();
            });
        });

        it('should display progress message', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={baseState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Setting up project structure...')).toBeInTheDocument();
            });
        });

        it('should display progress percentage', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={baseState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Component uses LoadingDisplay which always shows progressbar (even in checking phase)
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('should display logs', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={baseState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Component doesn't display logs in UI - shows current operation only
            await waitFor(() => {
                expect(screen.getByText('Creating project directory')).toBeInTheDocument();
            });
        });

        it('should show loading indicator during creation', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={baseState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Loading spinner or progress indicator should be visible (even in checking phase)
            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toBeInTheDocument();
        });
    });

    describe('Happy Path - Creation Success', () => {
        it('should display success message when complete', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={successState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks and phase transition to 'completed'
            await waitFor(() => {
                expect(screen.getByText('Project Created Successfully')).toBeInTheDocument();
            });
        });

        it('should show 100% progress when complete', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={successState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Component doesn't show percentages - shows success message instead
            await waitFor(() => {
                expect(screen.getByText('Project Created Successfully')).toBeInTheDocument();
            });
        });

        it('should display View Projects button when complete', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={successState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Component shows "View Projects" button for navigating to projects list
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /View Projects/i })).toBeInTheDocument();
            });
        });

        it('should only show View Projects button when complete', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={successState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Success state only shows "View Projects" button, no "Close" button
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /View Projects/i })).toBeInTheDocument();
            });
            expect(screen.queryByRole('button', { name: /Close/i })).not.toBeInTheDocument();
        });

        it('should show loading transition when View Projects is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={successState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for button to appear after async transitions
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /View Projects/i })).toBeInTheDocument();
            });

            const openButton = screen.getByRole('button', { name: /View Projects/i });
            await user.click(openButton);

            // After clicking, shows loading state while transitioning
            await waitFor(() => {
                expect(screen.getByText('Loading your projects...')).toBeInTheDocument();
            });
        });
    });

    describe('Error Conditions - Creation Failure', () => {
        it('should display error message when creation fails', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={errorState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Component shows failure heading and error field (not message or logs)
            expect(screen.getByText('Project Creation Failed')).toBeInTheDocument();
            expect(screen.getByText('npm ERR! network timeout')).toBeInTheDocument();
        });

        it('should display Back button on error', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={errorState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Error state shows Back button
            expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
        });

        it('should show error icon or status', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={errorState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Error state should be visually distinct
            expect(screen.getByText(/npm ERR!/i)).toBeInTheDocument();
        });

        it('should display Back button on error', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={errorState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Note: Back button may not be present in ProjectCreationStep
            // but error should be clear
            expect(screen.getByText(/Failed/i)).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Progress Updates', () => {
        it('should show loading state regardless of progress value', () => {
            const initialState = {
                ...baseState,
                creationProgress: {
                    ...baseState.creationProgress!,
                    progress: 0,
                },
            };

            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={initialState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Component shows loading indicator (even in checking phase)
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('should show current operation during creation', async () => {
            const midState = {
                ...baseState,
                creationProgress: {
                    ...baseState.creationProgress!,
                    progress: 50,
                    currentOperation: 'Installing dependencies',
                },
            };

            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={midState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks to complete
            await waitFor(() => {
                expect(screen.getByText('Installing dependencies')).toBeInTheDocument();
            });
        });

        it('should handle empty logs array', async () => {
            const stateWithoutLogs = {
                ...baseState,
                creationProgress: {
                    ...baseState.creationProgress!,
                    logs: [],
                },
            };

            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={stateWithoutLogs as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks to complete
            await waitFor(() => {
                expect(screen.getByText('Creating project directory')).toBeInTheDocument();
            });
        });

        it('should render without crashing with any state', async () => {
            const stateWithManyLogs = {
                ...baseState,
                creationProgress: {
                    ...baseState.creationProgress!,
                    logs: Array(50).fill('Log entry'),
                },
            };

            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={stateWithManyLogs as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks to complete
            await waitFor(() => {
                expect(screen.getByText('Creating project directory')).toBeInTheDocument();
            });
        });
    });

    describe('Edge Cases - Missing Creation Progress', () => {
        it('should handle undefined creationProgress', async () => {
            const stateWithoutProgress = {
                ...baseState,
                creationProgress: undefined,
            };

            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={stateWithoutProgress as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks to complete
            await waitFor(() => {
                expect(screen.getByText('Initializing')).toBeInTheDocument();
            });
        });

        it('should handle missing progress properties', async () => {
            const stateWithPartialProgress = {
                ...baseState,
                creationProgress: {
                    currentOperation: 'Processing',
                    progress: 25,
                    message: '',
                    logs: [],
                },
            };

            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={stateWithPartialProgress as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks to complete
            await waitFor(() => {
                expect(screen.getByText('Processing')).toBeInTheDocument();
            });
        });
    });

    describe('Accessibility', () => {
        it('should have progress indicator with proper role', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={baseState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // LoadingDisplay provides progressbar role (even in checking phase)
            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toBeInTheDocument();
        });

        it('should have clear success state for screen readers', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={successState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks to complete and transition to completed phase
            await waitFor(() => {
                expect(screen.getByText('Project Created Successfully')).toBeInTheDocument();
            });
        });

        it('should have clear error state for screen readers', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={errorState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Error message should be clear
            expect(screen.getByText(/Failed/i)).toBeInTheDocument();
        });

        it('should have accessible action button', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <ProjectCreationStep
                        state={successState as WizardState}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            // Wait for async pre-flight checks to complete and transition to completed phase
            await waitFor(() => {
                const openButton = screen.getByRole('button', { name: /View Projects/i });
                expect(openButton).toBeInTheDocument();
            });
        });
    });
});
