import { handleValidate } from '@/features/project-creation/handlers/validateHandler';
import { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';
import * as helpers from '@/features/project-creation/helpers';

// Mock dependencies
jest.mock('@/features/project-creation/helpers');

describe('Project Creation - Validate Handler', () => {
    let mockContext: jest.Mocked<HandlerContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    function createMockContext(): jest.Mocked<HandlerContext> {
        return {
            sendMessage: jest.fn().mockResolvedValue(undefined),
            logger: {
                error: jest.fn(),
            } as any,
        } as any;
    }

    describe('happy path', () => {
        it('should validate valid project name', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: true,
                message: '',
            });

            const result = await handleValidate(mockContext, {
                field: 'projectName',
                value: 'my-project',
            });

            expect(result.success).toBe(true);
            expect(helpers.validateField).toHaveBeenCalledWith('projectName', 'my-project');
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'projectName',
                isValid: true,
                message: '',
            });
        });

        it('should validate valid commerce URL', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: true,
                message: '',
            });

            const result = await handleValidate(mockContext, {
                field: 'commerceUrl',
                value: 'https://example.com',
            });

            expect(result.success).toBe(true);
            expect(helpers.validateField).toHaveBeenCalledWith('commerceUrl', 'https://example.com');
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'commerceUrl',
                isValid: true,
                message: '',
            });
        });

        it('should validate empty optional field', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: true,
                message: '',
            });

            const result = await handleValidate(mockContext, {
                field: 'commerceUrl',
                value: '',
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'commerceUrl',
                isValid: true,
                message: '',
            });
        });

        it('should validate unknown field type', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: true,
                message: '',
            });

            const result = await handleValidate(mockContext, {
                field: 'customField',
                value: 'some value',
            });

            expect(result.success).toBe(true);
            expect(helpers.validateField).toHaveBeenCalledWith('customField', 'some value');
        });
    });

    describe('validation failures', () => {
        it('should return invalid for project name with spaces', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: false,
                message: 'Project name can only contain letters, numbers, hyphens, and underscores',
            });

            const result = await handleValidate(mockContext, {
                field: 'projectName',
                value: 'my project',
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'projectName',
                isValid: false,
                message: 'Project name can only contain letters, numbers, hyphens, and underscores',
            });
        });

        it('should return invalid for empty required project name', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: false,
                message: 'Project name is required',
            });

            const result = await handleValidate(mockContext, {
                field: 'projectName',
                value: '',
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'projectName',
                isValid: false,
                message: 'Project name is required',
            });
        });

        it('should return invalid for project name too long', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: false,
                message: 'Project name must be 50 characters or less',
            });

            const result = await handleValidate(mockContext, {
                field: 'projectName',
                value: 'a'.repeat(51),
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'projectName',
                isValid: false,
                message: 'Project name must be 50 characters or less',
            });
        });

        it('should return invalid for malformed URL', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: false,
                message: 'Invalid URL format',
            });

            const result = await handleValidate(mockContext, {
                field: 'commerceUrl',
                value: 'not-a-url',
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'commerceUrl',
                isValid: false,
                message: 'Invalid URL format',
            });
        });

        it('should return invalid for URL without http/https', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: false,
                message: 'URL must start with http:// or https://',
            });

            const result = await handleValidate(mockContext, {
                field: 'commerceUrl',
                value: 'ftp://example.com',
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'commerceUrl',
                isValid: false,
                message: 'URL must start with http:// or https://',
            });
        });
    });

    describe('error handling', () => {
        it('should handle validation helper throwing error', async () => {
            (helpers.validateField as jest.Mock).mockImplementation(() => {
                throw new Error('Validation crashed');
            });

            const result = await handleValidate(mockContext, {
                field: 'projectName',
                value: 'test',
            });

            expect(result.success).toBe(true); // Handler doesn't fail
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Validation failed:',
                expect.any(Error)
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'projectName',
                isValid: false,
                message: 'Validation error',
            });
        });

        it('should handle sendMessage failure gracefully', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: true,
                message: '',
            });
            (mockContext.sendMessage as jest.Mock).mockRejectedValue(
                new Error('WebView not ready')
            );

            await expect(
                handleValidate(mockContext, {
                    field: 'projectName',
                    value: 'test',
                })
            ).rejects.toThrow('WebView not ready');

            expect(helpers.validateField).toHaveBeenCalled();
        });

        it('should handle unexpected validation result structure', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue(null);

            const result = await handleValidate(mockContext, {
                field: 'projectName',
                value: 'test',
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle empty field name', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: true,
                message: '',
            });

            const result = await handleValidate(mockContext, {
                field: '',
                value: 'test',
            });

            expect(result.success).toBe(true);
            expect(helpers.validateField).toHaveBeenCalledWith('', 'test');
        });

        it('should handle special characters in field value', async () => {
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: false,
                message: 'Invalid characters',
            });

            const result = await handleValidate(mockContext, {
                field: 'projectName',
                value: 'test!@#$%',
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'projectName',
                isValid: false,
                message: 'Invalid characters',
            });
        });

        it('should handle very long validation messages', async () => {
            const longMessage = 'a'.repeat(500);
            (helpers.validateField as jest.Mock).mockReturnValue({
                isValid: false,
                message: longMessage,
            });

            const result = await handleValidate(mockContext, {
                field: 'projectName',
                value: 'test',
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('validationResult', {
                field: 'projectName',
                isValid: false,
                message: longMessage,
            });
        });
    });
});
