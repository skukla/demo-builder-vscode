/**
 * The one assembly of what the storefront report reads, shared by Diagnostics and the
 * agent tool so the two cannot read different things (EDS-13f decision 8). The report's
 * own window and command were removed on 2026-10-23 (EDS-64).
 *
 * It used to carry two actions beside the reads: applying Demo Builder's fixes to an
 * added demo, and merging the template into a fork. Both left the report on 2026-10-23
 * (EDS-64): creation and reset apply every fix that fits, and Check for Updates keeps the
 * fork sync.
 *
 * @module features/eds/services/storefront/storefrontReportDeps
 */

import type * as vscode from 'vscode';
import { readLkgSha } from '../patches/lkgReader';
import type { StorefrontReportDeps } from './storefrontReport';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { createBoilerplateGitHub } from '@/features/updates/services/boilerplateGitHub';
import type { Logger } from '@/types/logger';

/** The readers the report needs, from the signed-in GitHub clients. */
export function createStorefrontReportDeps(secrets: vscode.SecretStorage, logger: Logger): StorefrontReportDeps {
    const { fileOperations, repoOperations } = getGitHubServices(secrets);
    return {
        fileOps: fileOperations,
        repoOps: repoOperations,
        readLkg: (source) => readLkgSha(source, logger),
        boilerplateGitHub: createBoilerplateGitHub(secrets),
        logger,
    };
}
