/**
 * The shared integration-card vocabulary.
 *
 * Presentation and shape only. Every DERIVATION lives with its producer — the
 * dashboard derives live cards from deployed state, the wizard derives
 * pre-build cards from wizard selections — because the two read entirely
 * different sources and neither may import the other.
 *
 * @module core/ui/components/integrations
 */

export { IntegrationCard, type IntegrationCardProps } from './IntegrationCard';
export {
    IntegrationActionsMenu,
    type IntegrationActionsMenuProps,
} from './IntegrationActionsMenu';
export type {
    CardAction,
    CardStatus,
    CommerceScopePart,
    IntegrationCardModel,
} from './integrationCardModel.types';
