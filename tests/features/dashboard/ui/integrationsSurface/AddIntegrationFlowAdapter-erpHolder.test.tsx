/**
 * AddIntegrationFlowAdapter — one Commerce instance runs one ERP integration (AB-78).
 *
 * The dashboard's add journey asks whether another project already runs an ERP
 * integration on this project's instance, and hands the modal what to grey out. The
 * modal is stubbed (see the harness); the gallery's greying is the wizard suite's.
 */

import { act } from '@testing-library/react';
import { mockRequest } from '../../../../helpers/webviewClientMock';
import { modalProps, renderAdapter, resetCaptured } from './AddIntegrationFlowAdapter.testUtils';

const NOTE = 'justrite already has one on this Commerce instance';

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockReset();
    resetCaptured();
});

describe('AddIntegrationFlowAdapter — an instance that already has an ERP integration', () => {
    it('asks about the open project while the add journey is open, and greys out the ERP integration', async () => {
        mockRequest.mockResolvedValue({
            success: true,
            data: { holder: 'justrite', message: 'held', note: NOTE },
        });

        renderAdapter({ isOpen: true, mode: 'add' });
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledWith('check-erp-integration-holder', {});
        expect(modalProps().unavailable).toEqual({ 'erp-integration': NOTE });
    });

    it('greys out nothing when no project holds the instance — control', async () => {
        mockRequest.mockResolvedValue({ success: true, data: {} });

        renderAdapter({ isOpen: true, mode: 'add' });
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledWith('check-erp-integration-holder', {});
        expect(modalProps().unavailable).toBeUndefined();
    });

    it('asks nothing while closed, or when only changing the destination', async () => {
        renderAdapter({ isOpen: false, mode: 'add' });
        renderAdapter({ isOpen: true, mode: 'destination' });
        await act(async () => {});

        expect(mockRequest).not.toHaveBeenCalledWith('check-erp-integration-holder', expect.anything());
    });
});
