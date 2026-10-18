/**
 * The one moment a project screen starts its slow reads: all three warm-ups, with the screen's
 * context. Each has its own suite.
 */

const mockWarmCatalog = jest.fn();
const mockWarmSignIn = jest.fn();
const mockWarmOwnership = jest.fn();
jest.mock('@/features/dashboard/handlers/warmOrgServicesCatalog', () => ({
    warmOrgServicesCatalog: (...args: unknown[]) => mockWarmCatalog(...args),
}));
jest.mock('@/features/dashboard/handlers/warmCommerceSignIn', () => ({
    warmCommerceSignIn: (...args: unknown[]) => mockWarmSignIn(...args),
}));
jest.mock('@/features/dashboard/handlers/warmErpOwnershipOptions', () => ({
    warmErpOwnershipOptions: (...args: unknown[]) => mockWarmOwnership(...args),
}));

import { warmProjectReads } from '@/features/dashboard/handlers/warmProjectReads';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

it('starts the API list, the Commerce sign-in and the ERP store read with the same context', () => {
    mockWarmCatalog.mockResolvedValue(undefined);
    mockWarmSignIn.mockResolvedValue(undefined);
    mockWarmOwnership.mockResolvedValue(undefined);
    const context = createMockHandlerContext();

    warmProjectReads(context);

    expect(mockWarmCatalog).toHaveBeenCalledWith(context);
    expect(mockWarmSignIn).toHaveBeenCalledWith(context);
    expect(mockWarmOwnership).toHaveBeenCalledWith(context);
});
