/**
 * The module wall three of the four dashboardHandlers suites share.
 *
 * WHY THIS EXISTS, AND WHY THE LINE COUNT SAID IT DID NOT. The convergence
 * ranking scored this family at ZERO removable lines, so it read as a family
 * split correctly for size with nothing to lift. Its four suites in fact mock
 * the same five modules — three of them mock exactly this set — and one 32-line
 * `vscode` factory was duplicated verbatim. The ranking counts duplicated LINES,
 * and two mock factories that differ by a line of formatting are not duplicated
 * lines while being entirely the same setup. Reading the mock SETS is what found
 * it (2026-09-02).
 *
 * THE FOURTH SUITE IS NOT COVERED. `dashboardHandlers-dalive-auth` mocks
 * thirteen EDS modules and shares none of these; its overlap with the other
 * three is nothing at all. Extracting a union would hand every suite a wall it
 * does not use, which is the failure this file is meant to avoid.
 *
 * Suites import the handlers FROM HERE. `jest.mock` hoists above the imports of
 * the module it appears in — this one — so a suite that imported the handlers
 * itself could bind them before these mocks were registered.
 */

jest.mock('@/core/state/appBuilderComponentState', () => ({
    ...jest.requireActual('@/core/state/appBuilderComponentState'),
    hasMeshDeploymentRecord: jest.fn().mockReturnValue(false),
}));

jest.mock('@/features/mesh/services/meshStatusResolver', () => ({
    determineMeshStatus: jest.fn().mockResolvedValue('deployed'),
}));

/**
 * Make filesystem path-safety checks deterministic and independent of the host.
 * `validateProjectPath()` canonicalizes via `fs.realpathSync`; an identity
 * `realpathSync` keeps the security prefix check intact while letting valid
 * in-tree project paths through regardless of what exists on disk.
 */
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn((p: string) => p),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    detectMeshChanges: jest.fn().mockResolvedValue({ hasChanges: false }),
}));


// Below the mocks on purpose — see the note above about hoisting.
export {
    handleOpenAdminPanel,
    handleGetProjects,
    handleSelectProject,
    handleCreateProject,
    handleOpenAiForProject,
    handleOpenLiveSite,
    handleOpenDaLive,
} from '@/features/projects-dashboard/handlers/dashboardHandlers';
