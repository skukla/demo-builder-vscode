/**
 * Credential types for the file-based MCP project tools.
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23) so the
 * domain handler modules can share them without importing the registration
 * module. `mcp-server.ts` re-exports both — its public API is unchanged.
 *
 * @module mcp/credentials
 */

/**
 * Credentials a tool invocation may use, resolved from the live extension
 * session. Both nullable — absent when the user isn't signed in.
 *
 * The in-extension server resolves these from `DaLiveAuthService` /
 * `GitHubTokenService` and threads them in (see `registerProjectTools`). They
 * replaced the former `DA_LIVE_IMS_TOKEN` / `GITHUB_TOKEN` env vars, which were
 * only ever populated by the now-retired standalone process.
 */
export interface McpToolCredentials {
    daLiveToken?: string | null;
    githubToken?: string | null;
}

/**
 * Per-call credential resolver injected by the (vscode-aware) in-extension
 * server. Kept as a plain async-string interface so this module stays
 * vscode-free. Resolved fresh on each tool call so token expiry is respected.
 */
export interface McpCredentialProvider {
    getDaLiveToken(): Promise<string | null>;
    getGitHubToken(): Promise<string | null>;
}
