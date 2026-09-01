/**
 * Installation-step shapes shared by the prerequisites feature and core's progress engine.
 *
 * WHY THESE LIVE HERE RATHER THAN WITH THE FEATURE.
 *
 * `InstallStep` is declared by the prerequisites feature but CONSUMED by
 * `core/utils/progressUnifier`, which reads all nine of its fields to decide how
 * to report progress for a running command. That made `core/` import from
 * `@/features`, the one direction the layering forbids — core is what features are
 * built on, so core knowing a feature exists is how the dependency graph closes
 * into a cycle and "move it to core" stops being a safe answer.
 *
 * It was the last remaining entry of its kind in the architecture ledger and was
 * annotated there as "likely fixable with `import type` alone". It is not: the
 * check matches any `@/features` import from `core/`, deliberately, because a
 * type-only import still means core names a feature.
 *
 * Narrowing the parameter to what the consumer uses — the fix applied elsewhere in
 * this codebase — does not apply either. `ProgressUnifier` reads every field, so a
 * narrowed type would be a second declaration of the same nine, free to drift.
 *
 * So there is one declaration, and it lives in the vocabulary both layers may
 * import. The feature still owns what a step MEANS and builds them; core only
 * knows their shape.
 *
 * @module types/prerequisites
 */

/**
 * A point in a command's output that signals known progress.
 *
 * `pattern` is matched against the running command's stdout/stderr; when it hits,
 * progress jumps to `progress` and `message` (if given) is shown.
 */
export interface ProgressMilestone {
    /** Regular-expression source matched against the command's output. */
    pattern: string;
    /** Percentage to report when the pattern matches, 0-100. */
    progress: number;
    /** Optional text to show alongside the jump. */
    message?: string;
}

/** Individual installation step configuration. */
export interface InstallStep {
    name: string;
    message: string;
    commands?: string[];
    commandTemplate?: string;
    estimatedDuration?: number;
    progressStrategy?: 'exact' | 'milestones' | 'synthetic' | 'immediate';
    milestones?: ProgressMilestone[];
    progressParser?: string;
    continueOnError?: boolean;
}
