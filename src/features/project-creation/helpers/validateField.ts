/**
 * Simple required-field validator for the project-creation wizard's form fields.
 *
 * Moved out of `helpers/index.ts` on 2026-08-31 (PL-31). That file both
 * re-exported four modules AND declared this function, which is what a re-export
 * index must not do: a file that has to pick which names leave it is holding
 * public and private code together. Splitting the declaration out is the first
 * of the two steps for a MIXED index; retiring the re-exports is the second.
 *
 * NOT the same job as `validateFieldUI` in `@/core/validation/fieldValidation`,
 * which dispatches per-field rules by name. This one asserts only that a value
 * is present, for fields that have no rule of their own.
 */
export function validateField(
    field: string,
    value: string,
): { isValid: boolean; message?: string } {
    if (!value || value.trim().length === 0) {
        return { isValid: false, message: `${field} is required` };
    }
    return { isValid: true };
}
