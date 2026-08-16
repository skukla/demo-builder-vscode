/**
 * The Demo Builder projects root — the single home for the
 * `DEMO_BUILDER_PROJECTS_DIR ?? ~/.demo-builder/projects` expression, which
 * had been hand-copied at six call sites (2026-08-14 review, Rule of Three
 * doubly exceeded). An identifier-bearing constant rots by copy: one site
 * changing the env-var name or the default path silently forks the root.
 */

import * as os from 'os';
import * as path from 'path';

/** Resolve the projects root (env override first, then the home default). */
export function resolveProjectsRoot(): string {
    return (
        process.env.DEMO_BUILDER_PROJECTS_DIR ??
        path.join(os.homedir(), '.demo-builder', 'projects')
    );
}
