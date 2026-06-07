/**
 * resolveJoinLink — turns a public master storefront link into a typed
 * JoinDescriptor for seeding the content-SC ("Join a shared storefront") wizard.
 *
 * With a public master, joining is a single paste of a link. The master carries a
 * small self-describing marker (written by the starter) at MASTER_MARKER_PATH; this
 * service parses the link and reads that marker. The file reader is injected so the
 * service stays unit-testable and the caller can wire the public (no-auth)
 * GitHubFileOperations read.
 */

import { parseGitHubUrl } from '@/core/utils';
import {
    ACCS_GRAPHQL_ENDPOINT, ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE,
} from '@/features/components/config/envVarKeys';
import type { Project } from '@/types/base';
import type { ComponentConfigs } from '@/types/components';
import { isRecord } from '@/types/typeGuards';

/**
 * Repo path of the master storefront's **shareable descriptor** — committed to the
 * master repo and read remotely by a joiner (packageId + inherited commerce coords).
 *
 * NOTE: this is repo-public join metadata, deliberately **distinct from the local
 * `.demo-builder.json` project manifest** (which is per-project state on the user's
 * filesystem, never committed here).
 */
export const MASTER_MARKER_PATH = 'storefront-share.json';

/** Commerce coordinates a content fork inherits from the master. */
export interface MasterCommerceCoords {
    endpoint?: string;
    websiteCode?: string;
    storeCode?: string;
    storeViewCode?: string;
}

/** The backend component the content satellite inherits (Slice 1: ACCS-first). */
const CONTENT_BACKEND_COMPONENT_ID = 'adobe-commerce-accs';

/**
 * Seed `componentConfigs` from a join descriptor's inherited commerce coords so the
 * Connect-Commerce step is pre-filled and Phase 4 `configGenerator` produces the
 * right `config.json` — without a second network read (the coords are already
 * resolved from the marker). Slice 1 is ACCS-first, so coords map to the `ACCS_*`
 * keys `configGenerator` reads. (PaaS would require the marker to carry the backend
 * type; deferred.) Returns `{}` when nothing is inherited (manual entry fills it).
 */
export function seedComponentConfigsFromCommerce(commerce?: MasterCommerceCoords): ComponentConfigs {
    if (!commerce) return {};
    const cfg: Record<string, string> = {};
    if (commerce.endpoint) cfg[ACCS_GRAPHQL_ENDPOINT] = commerce.endpoint;
    if (commerce.websiteCode) cfg[ACCS_WEBSITE_CODE] = commerce.websiteCode;
    if (commerce.storeCode) cfg[ACCS_STORE_CODE] = commerce.storeCode;
    if (commerce.storeViewCode) cfg[ACCS_STORE_VIEW_CODE] = commerce.storeViewCode;
    return Object.keys(cfg).length > 0 ? { [CONTENT_BACKEND_COMPONENT_ID]: cfg } : {};
}

/** The self-describing marker the starter writes into a shareable master repo. */
export interface MasterMarker {
    packageId: string;
    commerce?: MasterCommerceCoords;
}

/** Resolved join data used to seed the gallery-less joiner wizard. */
export interface JoinDescriptor {
    upstream: { owner: string; repo: string };
    packageId: string;
    commerce?: MasterCommerceCoords;
}

/**
 * Build the marker the starter writes into a shareable master repo so a content
 * fork can resolve it (the write-side pair of resolveJoinLink). Omits `commerce`
 * when no coords are provided.
 */
export function buildMasterMarker(packageId: string, commerce?: MasterCommerceCoords): MasterMarker {
    return commerce ? { packageId, commerce } : { packageId };
}

/** Serialize a marker to the JSON written at MASTER_MARKER_PATH. */
export function serializeMasterMarker(marker: MasterMarker): string {
    return JSON.stringify(marker, null, 2);
}

/** Writes a repo file (create/update); the starter wires GitHubFileOperations.createOrUpdateFile. */
export type MasterFileWriter = (
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
) => Promise<void>;

/**
 * Publish the self-describing marker into a master repo so content forks can resolve
 * it. The writer is injected so this stays unit-testable.
 */
export async function writeMasterMarker(
    target: { owner: string; repo: string; packageId: string; commerce?: MasterCommerceCoords },
    writeFile: MasterFileWriter,
): Promise<void> {
    const content = serializeMasterMarker(buildMasterMarker(target.packageId, target.commerce));
    await writeFile(target.owner, target.repo, MASTER_MARKER_PATH, content, 'chore: add Demo Builder storefront marker');
}

/** Extract commerce coordinates from a project's componentConfigs (backend-agnostic). */
function extractCommerceCoords(configs: Project['componentConfigs']): MasterCommerceCoords | undefined {
    if (!configs) return undefined;
    const out: MasterCommerceCoords = {};
    for (const cfg of Object.values(configs)) {
        for (const [key, value] of Object.entries(cfg)) {
            if (typeof value !== 'string' || value.length === 0) continue;
            if (key.endsWith('GRAPHQL_ENDPOINT')) out.endpoint ??= value;
            else if (key.endsWith('STORE_VIEW_CODE')) out.storeViewCode ??= value;
            else if (key.endsWith('STORE_CODE')) out.storeCode ??= value;
            else if (key.endsWith('WEBSITE_CODE')) out.websiteCode ??= value;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Publish the marker into a created (master) storefront so a content fork can join
 * it. Builds packageId + commerce coords from the project; no-ops (returns false)
 * when the project has no package identity. The writer is injected (the starter
 * wires GitHubFileOperations.createOrUpdateFile).
 */
export async function publishMasterMarkerForProject(
    target: { owner: string; repo: string; project: Project },
    writeFile: MasterFileWriter,
): Promise<boolean> {
    const packageId = target.project.selectedPackage;
    if (!packageId) return false;
    const commerce = extractCommerceCoords(target.project.componentConfigs);
    await writeMasterMarker({ owner: target.owner, repo: target.repo, packageId, commerce }, writeFile);
    return true;
}

/** Reads a file from a public master repo; resolves null when absent (404). */
export type MasterFileReader = (owner: string, repo: string, path: string) => Promise<string | null>;

export type ResolveJoinResult =
    | { ok: true; descriptor: JoinDescriptor }
    | { ok: false; error: string };

/**
 * Resolve a pasted master storefront link into a JoinDescriptor.
 *
 * @param link - Public GitHub repo URL of the master storefront.
 * @param readFile - Reads a repo file (returns null when missing). Public reads need no auth.
 */
export async function resolveJoinLink(link: string, readFile: MasterFileReader): Promise<ResolveJoinResult> {
    const repoInfo = parseGitHubUrl(link);
    if (!repoInfo) {
        return { ok: false, error: 'Enter a valid GitHub storefront link (https://github.com/owner/repo).' };
    }

    const raw = await readFile(repoInfo.owner, repoInfo.repo, MASTER_MARKER_PATH);
    if (raw === null) {
        return { ok: false, error: 'That repository is not a shareable storefront (no storefront marker found).' };
    }

    const marker = parseMarker(raw);
    if (!marker) {
        return { ok: false, error: 'The storefront marker could not be read (invalid format).' };
    }

    return {
        ok: true,
        descriptor: {
            upstream: { owner: repoInfo.owner, repo: repoInfo.repo },
            packageId: marker.packageId,
            commerce: marker.commerce,
        },
    };
}

/** Parse + validate the marker JSON; null on malformed or missing packageId. */
function parseMarker(raw: string): MasterMarker | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed) || typeof parsed.packageId !== 'string' || parsed.packageId.length === 0) {
        return null;
    }
    const commerce = isRecord(parsed.commerce) ? (parsed.commerce as MasterCommerceCoords) : undefined;
    return { packageId: parsed.packageId, commerce };
}
