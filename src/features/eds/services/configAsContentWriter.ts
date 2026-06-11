/**
 * Config-as-content writer (Slice 2, Step 06)
 *
 * For an AEM-Sites satellite, commerce wiring travels as CONTENT instead of a
 * repo-side config.json: this writer authors the three commerce-config nodes
 * (`configs` + `configs-stage` + `configs-dev`, per the CitiSignal paths.json
 * mapping) into the joiner's AEM content tree via the authoring API.
 *
 * Values are derived through the existing configGenerator functions — only the
 * destination changes (AEM content tree, not GitHub). Note config.json content
 * is PUBLIC storefront config (served to browsers); the secret here is the IMS
 * token, which is never logged.
 *
 * Auth: the write reuses the EXISTING Adobe IMS identity the extension already
 * holds (verified dual-token model — JCR write-back uses the author's own IMS
 * token). No new credential, secret, or wizard auth field.
 *
 * R2 manual fallback (PM-accepted): on a missing IMS token or a 401/403 write,
 * the writer stops cleanly and returns `manualFallbackRequired` with the exact
 * paths + JSON payloads so the user can author the nodes by hand — setup still
 * completes green. Any other write failure takes the same non-fatal path (the
 * fallback instructions unblock the F5 either way).
 *
 * NOTE: the exact authoring write call (PUT of the JSON document to the author
 * path) is a live-test item confirmed at the Step 08 F5 — the port isolates it.
 *
 * @module features/eds/services/configAsContentWriter
 */

import { extractConfigParams, generateConfigJson } from './configGenerator';
import type { Logger, Project } from '@/types';

// ==========================================================
// Types
// ==========================================================

/** Environments authored from day one (multi-env locked decision #4). */
export const CONFIG_CONTENT_ENVIRONMENTS = ['prod', 'stage', 'dev'] as const;
export type ConfigContentEnvironment = (typeof CONFIG_CONTENT_ENVIRONMENTS)[number];

/** One config node write: the authoring path and the JSON document. */
export interface ConfigContentWrite {
    path: string;
    payload: string;
}

export type ContentWriteResult =
    | { ok: true }
    | { ok: false; status?: number; error: string };

/**
 * Content-write port. The AEM authoring API is the real target
 * (`createAemAuthoringWritePort`); any destination that can persist a JSON
 * document at a path satisfies it.
 */
export interface ContentWritePort {
    writeConfig(path: string, payload: string): Promise<ContentWriteResult>;
}

/** Site identity feeding value derivation — same inputs as the repo-side config.json path. */
export interface ConfigContentCoords {
    githubOwner: string;
    repoName: string;
    daLiveOrg: string;
    daLiveSite: string;
}

export interface ConfigAsContentParams {
    /** Project carrying the commerce wiring (componentConfigs + meshState, post-Phase-4). */
    project: Project;
    coords: ConfigContentCoords;
    /** Authored AEM content tree root, e.g. `/content/<site>`. */
    contentPath: string;
    writePort: ContentWritePort;
    logger: Logger;
    environments?: readonly ConfigContentEnvironment[];
}

export type ConfigAsContentResult =
    | { success: true; writtenPaths: string[] }
    | { success: false; manualFallbackRequired: true; reason: string; writes: ConfigContentWrite[] };

// ==========================================================
// Path mapping
// ==========================================================

/**
 * CitiSignal paths.json mapping: prod reads `<root>/configs`, stage/dev read
 * `<root>/configs-<env>`.
 */
export function configContentNodePath(contentPath: string, env: ConfigContentEnvironment): string {
    const root = contentPath.replace(/\/+$/, '');
    return env === 'prod' ? `${root}/configs` : `${root}/configs-${env}`;
}

// ==========================================================
// Writer
// ==========================================================

/**
 * Author the commerce-config nodes into the content tree.
 *
 * Derives the config document once (value parity with the repo-side
 * config.json) and writes it to each env node — the n=3 case of one primitive.
 *
 * @throws Error only when config GENERATION fails (a local derivation bug, not
 *   a live-write failure — callers treat it as non-fatal for setup).
 */
export async function writeConfigAsContent(params: ConfigAsContentParams): Promise<ConfigAsContentResult> {
    const { project, coords, contentPath, writePort, logger } = params;
    const environments = params.environments ?? CONFIG_CONTENT_ENVIRONMENTS;

    const generated = generateConfigJson({ ...coords, ...extractConfigParams(project) }, logger);
    if (!generated.success || !generated.content) {
        throw new Error(`Config-as-content generation failed: ${generated.error ?? 'no content produced'}`);
    }

    const writes: ConfigContentWrite[] = environments.map((env) => ({
        path: configContentNodePath(contentPath, env),
        payload: generated.content as string,
    }));

    const writtenPaths: string[] = [];
    for (const write of writes) {
        const result = await writePort.writeConfig(write.path, write.payload);
        if (!result.ok) {
            const statusPart = result.status !== undefined ? ` (HTTP ${result.status})` : '';
            const reason = `Config-as-content write to ${write.path} failed${statusPart}: ${result.error}`;
            logger.warn(`[ConfigAsContent] ${reason} — returning manual-author fallback`);
            return { success: false, manualFallbackRequired: true, reason, writes };
        }
        writtenPaths.push(write.path);
        logger.info(`[ConfigAsContent] Authored ${write.path}`);
    }

    return { success: true, writtenPaths };
}

// ==========================================================
// AEM authoring write port
// ==========================================================

interface ImsTokenProvider {
    getAccessToken(): Promise<string | null>;
}

/**
 * ContentWritePort against the AEM author instance, authenticated with the
 * existing IMS identity (Bearer). A missing token surfaces as a 401-shaped
 * result so the writer's R2 fallback triggers without a network call.
 */
export function createAemAuthoringWritePort(
    authorUrl: string,
    tokenProvider: ImsTokenProvider,
    logger: Logger,
): ContentWritePort {
    const origin = authorUrl.replace(/\/+$/, '');

    return {
        async writeConfig(path: string, payload: string): Promise<ContentWriteResult> {
            const token = await tokenProvider.getAccessToken();
            if (!token) {
                return { ok: false, status: 401, error: 'No Adobe IMS token available — sign in to Adobe first' };
            }

            const url = `${origin}${path}`;
            try {
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: payload,
                });
                if (!response.ok) {
                    logger.warn(`[ConfigAsContent] AEM authoring write to ${url} returned HTTP ${response.status}`);
                    return { ok: false, status: response.status, error: `AEM authoring write failed (HTTP ${response.status})` };
                }
                return { ok: true };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`[ConfigAsContent] AEM authoring write to ${url} failed: ${message}`);
                return { ok: false, error: message };
            }
        },
    };
}
