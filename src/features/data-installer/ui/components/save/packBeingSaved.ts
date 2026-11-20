/**
 * The datapack a save starts from: the one the project holds, which Demo Builder installed. Save
 * Changes writes a new version of it; Save As New makes a new datapack of the SC's from it.
 *
 * @module features/data-installer/ui/components/save/packBeingSaved
 */

import type { DatapackId, DatapackStoreName } from '@/types/datapack';

export interface PackBeingSaved {
    id: DatapackId;
    displayName: string;
    source: DatapackStoreName;
}
