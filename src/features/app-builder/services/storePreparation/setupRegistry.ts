/**
 * Which `StepSetup` a catalog step's `setup` names (AB-77): settings become `configSetup` over
 * the declared items, with no code of their own; a `handler` setup is looked up here. Adding a
 * handler setup means a row here and a value in `SetupHandler`; a config setup needs neither.
 *
 * @module features/app-builder/services/storePreparation/setupRegistry
 */

import { configSetup } from './configSetup';
import { erpAttributesSetup } from './erpAttributesSetup';
import type { StepSetup } from './setupContract';
import { sharedCatalogsSetup } from './sharedCatalogsSetup';
import { warehouseSetup } from './warehouseSetup';
import type { SetupSpec, SetupHandler } from '@/types/appBuilderComponents';

const HANDLERS: Record<SetupHandler, StepSetup> = {
    'create-erp-attributes': erpAttributesSetup,
    'erp-warehouse-in-website-stock': warehouseSetup,
    'company-shared-catalogs': sharedCatalogsSetup,
};

/** The setup behind a step's declaration. */
export function setupFor(spec: SetupSpec): StepSetup {
    return spec.kind === 'config' ? configSetup(spec) : HANDLERS[spec.handler];
}
