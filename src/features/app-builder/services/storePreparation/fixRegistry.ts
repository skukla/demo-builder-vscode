/**
 * Which `StepFix` a catalog step's `fix` names (AB-77): settings become `configFix` over
 * the declared items, with no code of their own; a `handler` fix is looked up here. Adding a
 * handler fix means a row here and a value in `SetupFixHandler`; a config fix needs neither.
 *
 * @module features/app-builder/services/storePreparation/fixRegistry
 */

import { configFix } from './configFix';
import { erpAttributesFix } from './erpAttributesFix';
import type { StepFix } from './fixContract';
import { sharedCatalogsFix } from './sharedCatalogsFix';
import { warehouseFix } from './warehouseFix';
import type { SetupFix, SetupFixHandler } from '@/types/appBuilderComponents';

const HANDLERS: Record<SetupFixHandler, StepFix> = {
    'create-erp-attributes': erpAttributesFix,
    'erp-warehouse-in-website-stock': warehouseFix,
    'company-shared-catalogs': sharedCatalogsFix,
};

/** The fix behind a step's declaration. */
export function fixFor(fix: SetupFix): StepFix {
    return fix.kind === 'config' ? configFix(fix) : HANDLERS[fix.handler];
}
