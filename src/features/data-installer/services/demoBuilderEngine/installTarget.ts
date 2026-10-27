/**
 * Where a pack lands: the website and store view the project chose, as this store's ids, and
 * the root category that store view's store shows (DI-5).
 *
 * The codes come from the project's Business Structure step (`resolveInstallTarget`, the pair
 * the service engine sends too). The ids are read from the store as it is now, through the same
 * `storeScopeOf` the ERP's "Assign products" scopes itself with, so the two can never disagree
 * about which catalog is the project's. The service took the codes and looked the ids up
 * itself (catalog spec §0, "Store scoping").
 *
 * @module features/data-installer/services/demoBuilderEngine/installTarget
 */

import { type CatalogSession, newCatalogSession } from './kindContext';
import { storeScopeOf } from '@/features/app-builder/services/erpAssignSelection';
import type { CommerceGet } from '@/types/commerceWire';

/** The project's chosen website and store view, by code. */
export interface TargetCodes {
    websiteCode: string;
    storeCode: string;
}

/** The same, as this store's ids, with the root category the store view shows. */
export interface EngineTarget extends TargetCodes {
    websiteId: number;
    storeId: number;
    rootCategoryId: number;
}

/** The chosen website and store view are not in the store. */
export class InstallTargetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InstallTargetError';
    }
}

/**
 * The ids for the chosen codes, read from the store.
 *
 * @throws InstallTargetError naming both codes, so the SC can choose again in the Commerce step
 */
export async function resolveEngineTarget(get: CommerceGet, codes: TargetCodes): Promise<EngineTarget> {
    const scope = await storeScopeOf(get, codes.websiteCode, codes.storeCode);
    if (!scope || scope.storeId === undefined) {
        throw new InstallTargetError(
            `The store has no store view ${codes.storeCode} on a website ${codes.websiteCode}. Choose them again in the Commerce step.`,
        );
    }
    return { ...codes, websiteId: scope.websiteId, storeId: scope.storeId, rootCategoryId: Number(scope.rootCategoryId) };
}

/** A fresh install session pointed at the target. */
export function sessionFor(target: EngineTarget): CatalogSession {
    const session = newCatalogSession(target.storeId);
    session.websiteId = target.websiteId;
    session.websiteCode = target.websiteCode;
    session.rootCategory = { id: target.rootCategoryId, name: '' };
    return session;
}
