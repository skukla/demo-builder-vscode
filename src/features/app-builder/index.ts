/**
 * App Builder Feature
 *
 * Deploys and manages App Builder components (Runtime apps, API
 * subscriptions) on the shared Adobe I/O Console project.
 *
 * Public API for OTHER features (house rule: cross-feature imports go through
 * the feature index, never feature internals). Deliberately minimal — export
 * more from `./services` only as cross-feature consumers appear.
 */

export { BASELINE_API } from './services/apiSubscriber';
