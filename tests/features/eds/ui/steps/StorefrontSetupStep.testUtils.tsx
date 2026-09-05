/**
 * Shared setup for the StorefrontSetupStep suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/ui/components/feedback/LoadingDisplay, @/core/ui/components/layout/CenteredFeedbackContainer, @/core/ui/components/layout/SingleColumnLayout, @/features/eds/ui/components, @adobe/react-spectrum
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
// No icon mocks here. jest.config.js maps EVERY '@spectrum-icons/workflow/*'
// specifier to one file (tests/__mocks__/@spectrum-icons/workflow.tsx), so a
// per-icon jest.mock does not scope to that icon — it replaces the shared
// module for all of them, and the last one registered wins. The pair that used
// to sit here rendered `icon-check` for BOTH the checkmark and the alert, which
// is worse than no mock at all: an assertion on the alert icon passed or failed
// for reasons unrelated to the component.
// Every prop the step hands this component is surfaced as a data attribute:
// `helperText`, `subMessage` and `progress` are decisions the step makes per
// phase, and a stub that rendered only `message` made them unobservable.
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message, subMessage, helperText, progress, size }: any) => (
        <div
            data-testid="loading"
            data-sub-message={subMessage ?? ''}
            data-helper-text={helperText ?? ''}
            data-progress={String(progress)}
            data-size={size ?? ''}
        >
            {message}
        </div>
    ),
}));
jest.mock('@/core/ui/components/layout/CenteredFeedbackContainer', () => ({
    CenteredFeedbackContainer: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/core/ui/components/layout/SingleColumnLayout', () => ({
    SingleColumnLayout: ({ children }: any) => <div>{children}</div>,
}));
// Same reason: the step forwards five fields of the github-app-required payload
// into this dialog and wires its `onInstallDetected` callback. The stub exposes
// the forwarded values and offers a button that fires the callback.
jest.mock('@/features/eds/ui/components/GitHubAppInstallDialog', () => ({
    GitHubAppInstallDialog: ({
        owner,
        repo,
        installUrl,
        message,
        siteUnregistered,
        onInstallDetected,
    }: any) => (
        <div
            data-testid="github-app-dialog"
            data-owner={owner ?? ''}
            data-repo={repo ?? ''}
            data-install-url={installUrl ?? ''}
            data-message={message ?? ''}
            data-site-unregistered={String(siteUnregistered)}
        >
            <button onClick={onInstallDetected}>Simulate install detected</button>
        </div>
    ),
}));

export { StorefrontSetupStep };
