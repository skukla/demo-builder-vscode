/**
 * A full Git commit id: 40 lowercase hex characters, as GitHub's API and `git rev-parse` give it.
 * One copy (walk F254): five modules each held their own, and a sixth was about to be added.
 * The update checks' looser `COMMIT_SHA` (7 to 40, any case, `templateSyncMessages.ts`) accepts a
 * short id a person may type; this one is for ids the extension recorded itself.
 *
 * @module core/utils/commitSha
 */

export const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
