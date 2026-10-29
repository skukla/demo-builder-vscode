/**
 * useRepublishProgress — Configure's progress modal, for the storefront Republish.
 *
 * The Republish is started from the prompt a save raises, so the screen opens the
 * modal on the run's first step (`useShowWhenStartedElsewhere`). The modal's Retry
 * sends `republish-storefront`, which runs the storefront half again.
 *
 * @module features/dashboard/ui/configure/hooks/useRepublishProgress
 */

import { useOperationRunner, type OperationRunnerControls, type StartableOperation } from '@/core/ui/hooks/useOperationRunner';
import { useShowWhenStartedElsewhere } from '@/core/ui/hooks/useShowWhenStartedElsewhere';
import { CONFIGURE_REPUBLISH_OPERATION_ID } from '@/core/utils/operationIds';

/** The Republish as the modal names it; the title is the extension's own. */
export const REPUBLISH_OPERATION: StartableOperation = {
    id: CONFIGURE_REPUBLISH_OPERATION_ID,
    name: 'storefront',
    message: 'republish-storefront',
    title: 'Republishing storefront',
    failureTitle: "Couldn't republish the storefront",
    successTitle: 'Storefront republished',
};

/** The screen's operation runner, opened for a Republish the prompt started. */
export function useRepublishProgress(): OperationRunnerControls {
    const operations = useOperationRunner();
    useShowWhenStartedElsewhere(operations, REPUBLISH_OPERATION);
    return operations;
}
