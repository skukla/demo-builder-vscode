/**
 * Project Creation Handlers - Validate Handler
 *
 * Handles field validation for project creation form.
 */

import { validateField as validateFieldHelper } from '../../../commands/helpers';
import { HandlerContext } from '../../../commands/handlers/HandlerContext';

/**
 * Handler: validate
 *
 * Validate field values
 */
export async function handleValidate(
    context: HandlerContext,
    payload: { field: string; value: string },
): Promise<{
    success: boolean;
}> {
    const { field, value } = payload;

    try {
        const validationResult = validateFieldHelper(field, value);

        await context.sendMessage('validationResult', {
            field,
            isValid: validationResult.isValid,
            message: validationResult.message,
        });

        return { success: true };
    } catch (error) {
        context.logger.error('Validation failed:', error as Error);
        await context.sendMessage('validationResult', {
            field,
            isValid: false,
            message: 'Validation error',
        });
        return { success: true }; // Don't fail the handler, just return validation result
    }
}
