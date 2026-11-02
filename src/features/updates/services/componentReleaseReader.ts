/**
 * Reads a component's newest release on this user's channel: the one lookup behind the update
 * check and the update of a mesh or App Builder component.
 *
 * @module features/updates/services/componentReleaseReader
 */

import * as vscode from 'vscode';
import { resolveEffectiveChannel } from './effectiveChannel';
import { buildGitHubHeaders } from './githubApiClient';
import { readNewestComponentRelease } from '@/core/releases/readNewestRelease';
import type { Logger } from '@/types/logger';
import type { UpdateChannel } from '@/types/releases';

export function componentReleaseReader(secrets: vscode.SecretStorage, logger: Logger) {
    return async (repo: string): Promise<{ tag: string; version: string } | null> => {
        const configured = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<UpdateChannel>('updateChannel', 'stable');
        const channel = await resolveEffectiveChannel(configured, secrets, logger);
        const headers = await buildGitHubHeaders(secrets);
        const release = await readNewestComponentRelease(repo, channel, { headers, logger });
        return release && { tag: release.tag_name, version: release.tag_name.replace(/^v/, '') };
    };
}
