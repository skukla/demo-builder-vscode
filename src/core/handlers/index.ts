/**
 * Core Handler Infrastructure
 */

export {
    createErrorResponse,
    wrapHandler,
    type ErrorResponse,
} from './errorHandling';

export { executeCommandForProject } from './projectCommandHelper';

// Handler dispatch utilities (Step 3: Handler Registry Simplification)
export {
    dispatchHandler,
    hasHandler,
    getRegisteredTypes,
} from './dispatchHandler';
