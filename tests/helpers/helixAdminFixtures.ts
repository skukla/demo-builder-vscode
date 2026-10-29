/**
 * Live-captured AEM admin API (admin.hlx.page) answers.
 *
 * Every string here was READ from a real response, not written from memory —
 * a made-up reason would test the classifier against a string Helix never sends.
 */

/**
 * The `x-error` header on `POST admin.hlx.page/code/{owner}/{repo}/main/config.json`
 * → 400, when the AEM Code Sync App does not cover the repository.
 *
 * Captured 2026-09-30 on skukla/kukla-justrite (EDS-23), on every attempt across
 * two republishes, while `/status` answered an uninformative inner `code.status: 400`.
 */
export const CODE_ENDPOINT_APP_NOT_ON_REPO_X_ERROR =
    '[admin] github bot not installed on repository.';

/**
 * The error `HelixService.previewCode` throws for that answer: its final-attempt
 * format is `Failed to preview code: <status> <statusText> — <x-error>`.
 */
export const PREVIEW_CODE_APP_NOT_ON_REPO_ERROR =
    `Failed to preview code: 400 Bad Request — ${CODE_ENDPOINT_APP_NOT_ON_REPO_X_ERROR}`;

/**
 * What `previewCode` threw for `POST admin.hlx.page/code/skukla/scratch-1022/main/*` on a
 * brand-new repository whose site the Configuration Service did not have yet.
 *
 * Read from Debug Logs 2026-10-22 (10:12:13.506), creating skukla/scratch-1022: the
 * code publish ran first and got this, and `PUT config/skukla/sites/scratch-1022.json`
 * answered 201 one second later. Nothing published the code again, so the project was
 * marked ready while its site served no scripts.
 */
export const PREVIEW_CODE_SITE_NOT_FOUND_ERROR =
    'Failed to preview code: 404 Not Found — [admin] config for site not found: ' +
    'skukla/scratch-1022';
