/**
 * Shared setup for the CommerceStep suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/ui/utils/vscode-api, @/features/authentication/ui/steps/AdobeAuthStep, @/features/components/services/blockLibraryLoader, @/features/components/services/demoPackageLoader
 * Left inline (specs disagree):  @/features/project-creation/ui/components/ConnectStoreStepContent
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));
jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: jest.fn(() => []),
    getNativeBlockLibraries: jest.fn(() => []),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getPackageDefaultBlockLibraryIds: jest.fn(() => []),
}));
jest.mock('@/features/components/services/demoPackageLoader', () => ({
    // Default: mesh NOT required (non-mesh package) → optional deps reset to [].
    getResolvedMeshRequirement: jest.fn(() => false),
}));
jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: (props: { setCanProceed: (v: boolean) => void }) => (
        <div data-testid="adobe-auth-panel">
            <button type="button" data-testid="auth-noop" onClick={() => props.setCanProceed(true)}>
                ping setCanProceed
            </button>
        </div>
    ),
}));

