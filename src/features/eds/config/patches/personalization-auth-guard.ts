/**
 * Patch: personalization-auth-guard
 *
 * Prevents "Authorization header missing or empty" errors for anonymous users.
 * The personalization dropin makes GraphQL queries (customerGroup, customerSegments)
 * that require authentication. Without this patch, these queries fail for guest users
 * after cart updates, causing console errors.
 *
 * This patch delays personalization initialization until the user is authenticated.
 */

export const searchPattern = `import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-personalization/api.js';
import { initializeDropin } from './index.js';
import { CORE_FETCH_GRAPHQL } from '../commerce.js';

await initializeDropin(async () => {
  // Set Fetch GraphQL (Catalog Service)
  setEndpoint(CORE_FETCH_GRAPHQL);

  // Initialize personalization
  return initializers.mountImmediately(initialize, {});
})();`;

export const replacement = /* js */ `import { initializers } from '@dropins/tools/initializer.js';
import { events } from '@dropins/tools/event-bus.js';
import { initialize, setEndpoint } from '@dropins/storefront-personalization/api.js';
import { initializeDropin } from './index.js';
import { CORE_FETCH_GRAPHQL, checkIsAuthenticated } from '../commerce.js';

let personalizationInitialized = false;

const initPersonalization = async () => {
  if (personalizationInitialized) return;

  // Set Fetch GraphQL endpoint
  setEndpoint(CORE_FETCH_GRAPHQL);

  // Initialize personalization
  await initializers.mountImmediately(initialize, {});
  personalizationInitialized = true;
};

await initializeDropin(async () => {
  // Only initialize personalization for authenticated users
  // This prevents "Authorization header missing" errors for guests
  if (checkIsAuthenticated()) {
    await initPersonalization();
  }

  // Initialize when user logs in
  events.on('authenticated', async (isAuthenticated) => {
    if (isAuthenticated && !personalizationInitialized) {
      await initPersonalization();
    }
  });
})();`;
