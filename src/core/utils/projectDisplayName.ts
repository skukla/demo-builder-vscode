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
export function getProjectDisplayName(project: ProjectNameParts): string {
    const title = project.title?.trim();
    return title ? title : project.name;
}
