/**
 * The one moment a project screen starts its slow reads: both warm-ups, with the screen's
 * context. Each has its own suite.
 */

const mockWarmCatalog = jest.fn();
const mockWarmSignIn = jest.fn();
jest.mock('@/features/dashboard/handlers/warmOrgServicesCatalog', () => ({
    warmOrgServicesCatalog: (...args: unknown[]) => mockWarmCatalog(...args),
}));
jest.mock('@/features/dashboard/handlers/warmCommerceSignIn', () => ({
    warmCommerceSignIn: (...args: unknown[]) => mockWarmSignIn(...args),
}));

import { warmProjectReads } from '@/features/dashboard/handlers/warmProjectReads';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

it('starts the API list and the Commerce sign-in with the same context', () => {
    mockWarmCatalog.mockResolvedValue(undefined);
    mockWarmSignIn.mockResolvedValue(undefined);
    const context = createMockHandlerContext();

    warmProjectReads(context);

    expect(mockWarmCatalog).toHaveBeenCalledWith(context);
    expect(mockWarmSignIn).toHaveBeenCalledWith(context);
});
