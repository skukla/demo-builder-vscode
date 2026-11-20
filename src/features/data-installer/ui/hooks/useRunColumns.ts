/**
 * How many columns the import's data types take (`runColumns`), from the editor's width as it was
 * when the window opened (owner, 2026-11-10, walk F135): the window picks its width once and never
 * changes it on its own, so a later resize of the editor moves nothing.
 *
 * @module features/data-installer/ui/hooks/useRunColumns
 */

import { useState } from 'react';
import { runColumns } from '../components/importModalJob';

export function useRunColumns(typeCount: number): 1 | 2 {
    const [viewportWidth] = useState(() => window.innerWidth);
    return runColumns(typeCount, viewportWidth);
}
