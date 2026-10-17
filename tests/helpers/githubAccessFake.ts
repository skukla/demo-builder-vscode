/**
 * GitHub access for a template sync, built from a fake secret store: the real token
 * service and file operations, so the shape is the one the service declares
 * (`GitHubAccess`) and nothing is cast. No network call is made until something is
 * read or written, and the suites that use this fake those calls where they happen.
 */

import type * as vscode from 'vscode';
import { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { GitHubAccess } from '@/features/updates/services/templateSyncTypes';
import type { Logger } from '@/types/logger';

export function githubAccessFor(secrets: vscode.SecretStorage, logger: Logger): GitHubAccess {
    const tokenService = new GitHubTokenService(secrets, logger);
    return { tokenService, fileOperations: new GitHubFileOperations(tokenService, logger) };
}
