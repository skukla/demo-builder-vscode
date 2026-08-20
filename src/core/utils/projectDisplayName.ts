/**
 * What a project is CALLED on screen.
 *
 * A project carries two names and they answer different questions:
 *
 * - `name` is the SLUG. It is the folder under `~/.demo-builder/projects/`, the
 *   key `createHandler` dedupes on, and the path `renameProjectCore` moves. It
 *   must stay `[a-z][a-z0-9-]*` because a filesystem and a shell have opinions.
 * - `title` is what the user typed. It exists only to be read.
 *
 * Every surface rendering a project to a human calls this, so a surface that
 * was missed is one grep away instead of one screenshot away. That matters more
 * than it sounds: the failure mode is two screens showing different names for
 * the same project, which looks like data corruption rather than a missed edit.
 *
 * `title` is optional forever. Projects created before it existed have only a
 * slug and must render exactly as they always have — which is why there is no
 * migration and no backfill.
 *
 * @module core/utils/projectDisplayName
 */

/**
 * A string that is safe to show a human as a project's name.
 *
 * Branded, and that is the entire point. `getProjectDisplayName` existed before
 * this type did and was still missed four times -- the dashboard heading, the
 * wizard's edit mode, and two payload producers -- because nothing STOPPED a
 * caller writing `name: project.name`. A helper you have to remember to call is
 * a convention; a type you cannot bypass is a constraint.
 *
 * The brand is phantom: at runtime this is an ordinary string, so rendering,
 * template literals and `.toUpperCase()` all work untouched. It only exists at
 * compile time, where it makes a slug fail to assign.
 *
 * Two ways to get one: derive it from a project, or say `asDisplayName` and mean
 * it.
 */
export type ProjectDisplayName = string & { readonly __projectDisplayName: unique symbol };

/**
 * Declare a string display-safe when it does not come from a project.
 *
 * The escape hatch, deliberately verbose: an empty placeholder for "no project
 * open", or a name that arrived already resolved from elsewhere. Spelling it out
 * is the difference between a decision and an accident -- if you are reaching
 * for this with a `project` in scope, use {@link getProjectDisplayName} instead.
 *
 * @param value - a string already known to be safe to render
 * @returns the same string, branded
 */
export function asDisplayName(value: string): ProjectDisplayName {
    return value as ProjectDisplayName;
}

/** The parts of a project this needs. Deliberately narrow, so tests need no fixture. */
export interface ProjectNameParts {
    /** The slug: folder name, dedupe key, path component. */
    name: string;
    /** What the user typed, if they have set one. */
    title?: string;
}

/**
 * The name to show a human for this project.
 *
 * @param project - anything carrying `name` and optionally `title`
 * @returns the trimmed title when there is a usable one, else the slug
 */
export function getProjectDisplayName(project: ProjectNameParts): ProjectDisplayName {
    const title = project.title?.trim();
    return asDisplayName(title ? title : project.name);
}
