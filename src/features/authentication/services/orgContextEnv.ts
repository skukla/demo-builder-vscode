/**
 * orgContextEnv (feature re-export).
 *
 * The canonical implementation lives in `@/core/shell` because the command
 * executor consumes it and core must not depend on features. This thin
 * re-export gives authentication-feature code (ensureOrgContext, handlers) a
 * feature-local import surface without duplicating logic.
 */
export {
    buildAioConsoleEnv,
    buildOrgTargetFromProjectAdobe,
    withOrgContext,
    getActiveOrgContext,
} from '@/core/shell/orgContextEnv';
export type {
    OrgContextTarget,
    ProjectAdobeRef,
    CachedOrgRef,
} from '@/core/shell/orgContextEnv';
