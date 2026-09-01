/**
 * Shared setup for the StorefrontSetupStep suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/ui/components/feedback/LoadingDisplay, @/core/ui/components/layout/CenteredFeedbackContainer, @/core/ui/components/layout/SingleColumnLayout, @/features/eds/ui/components, @adobe/react-spectrum, @spectrum-icons/workflow/AlertCircle, @spectrum-icons/workflow/CheckmarkCircle
 * Left inline (specs disagree):  @/core/ui/utils/vscode-api
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { StorefrontSetupStep } from '@/features/eds/ui/steps/StorefrontSetupStep';

// ---- Spectrum + icon mocks (only what the tree renders) ----
jest.mock('@adobe/react-spectrum', () => ({
    Text: ({ children }: any) => <span>{children}</span>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Button: ({ children, onPress }: any) => <button onClick={onPress}>{children}</button>,
}));
jest.mock('@spectrum-icons/workflow/AlertCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-alert" />,
}));
jest.mock('@spectrum-icons/workflow/CheckmarkCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-check" />,
}));
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: any) => <div data-testid="loading">{message}</div>,
}));
jest.mock('@/core/ui/components/layout/CenteredFeedbackContainer', () => ({
    CenteredFeedbackContainer: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/core/ui/components/layout/SingleColumnLayout', () => ({
    SingleColumnLayout: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/features/eds/ui/components/GitHubAppInstallDialog', () => ({
    GitHubAppInstallDialog: () => <div data-testid="github-app-dialog" />,
}));

export { StorefrontSetupStep };
