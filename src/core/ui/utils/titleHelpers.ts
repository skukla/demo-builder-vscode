/**
 * Title Validation Helpers
 *
 * Shared utilities for validating and hydrating title fields on Adobe entities
 * (projects, workspaces). Used when copying/importing projects where the title
 * may have fallen back to the auto-generated name (e.g., "833BronzeShark").
 */

/**
 * Item with optional title and name properties.
 */
interface TitleableItem {
    title?: string;
    name?: string;
}

/**
 * Check if an item has a valid title (exists and differs from name).
 * When copying old projects, title may have fallen back to name.
 *
 * @param item - Item to check (project, workspace, etc.)
 * @returns true if item has a meaningful title distinct from its name
 */
export function hasValidTitle(item: TitleableItem | null | undefined): boolean {
    if (!item) return false;
    return Boolean(item.title && item.title !== item.name);
}

/**
 * Determine if selected item should be hydrated with data from API.
 * Returns true when: selected item lacks valid title, but API item has one.
 *
 * @param selectedItem - Currently selected item (may have incomplete data)
 * @param apiItem - Matching item from API (has complete data)
 * @returns true if selectedItem should be updated with apiItem's title
 */
export function needsTitleHydration(
    selectedItem: TitleableItem | null | undefined,
    apiItem: TitleableItem | null | undefined,
): boolean {
    return !hasValidTitle(selectedItem) && hasValidTitle(apiItem);
}
