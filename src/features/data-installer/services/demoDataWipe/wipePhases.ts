/**
 * The reads the clearing's check makes before it removes anything (`decideAll`, through
 * `planWipe`), in order, each as the data types it reads: what "Verifying demo data" counts
 * through, as an install counts through its kinds (`phaseLine`, owner 2026-11-04).
 *
 * @module features/data-installer/services/demoDataWipe/wipePhases
 */

import { STORE_CONFIG_KIND } from '../datapackCatalog';

export const WIPE_PHASES: readonly (readonly string[])[] = [
    ['categories'],
    ['products'],
    ['cart_rules'],
    ['customers'],
    ['b2b_companies', 'b2b_shared_catalogs', 'customer_groups'],
    ['product_attributes', 'attribute_sets'],
    [STORE_CONFIG_KIND],
    ['orders'],
];
