/**
 * Prerequisites Versioning Utilities
 *
 * Extracted from PrerequisitesManager.ts for better modularity:
 * - NodeVersionParser: Parse Node version information from fnm output
 * - VersionSatisfactionChecker: Check version satisfaction using semver
 * - MultiVersionDetector: Detect and manage multiple Node versions
 * - DependencyResolver: Resolve prerequisite dependencies
 */

export {
    parseInstalledVersions,
    parseMajorVersions,
    buildMajorToFullVersionMap,
    isValidVersionFamily,
} from './NodeVersionParser';

export {
    checkVersionSatisfaction,
} from './VersionSatisfactionChecker';

export {
    checkMultipleNodeVersions,
    getInstalledNodeVersions,
    getLatestInFamily,
} from './MultiVersionDetector';
export type { NodeVersionStatus } from './MultiVersionDetector';

export {
    resolveDependencies,
} from './DependencyResolver';
