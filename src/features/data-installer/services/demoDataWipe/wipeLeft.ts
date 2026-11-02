/**
 * One row of what a wipe leaves: a kind, up to three names and the count, and the one reason. The
 * decision modules (`wipeCompanies.ts`, `wipeCatalogs.ts`, `wipeAttributes.ts`, `wipeSettings.ts`)
 * each say their own rows; `wipePlan.ts` joins them.
 *
 * @module features/data-installer/services/demoDataWipe/wipeLeft
 */

import { named } from '../demoBuilderEngine/saveOutcome';
import type { WipeLeft } from '@/types/demoDataWipe';

export const leftRow = (kind: WipeLeft['kind'], names: string[], why: string): WipeLeft => ({ kind, ...named(names), why });

/** The rows with anything in them. */
export const rowsWithAny = (rows: readonly WipeLeft[]): WipeLeft[] => rows.filter((row) => row.count > 0);
