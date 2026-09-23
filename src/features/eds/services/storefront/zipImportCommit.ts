/**
 * The one commit a zip import pushes. Its own module so Remove can read it back
 * (as proof a repository added from "Add it from that repository" is one an
 * earlier import made) without loading the zip reader and its dependencies.
 *
 * @module features/eds/services/storefront/zipImportCommit
 */

export const ZIP_COMMIT_MESSAGE = 'Add storefront from a zip file';
