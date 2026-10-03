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
