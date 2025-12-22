# Step 6: DA.live Service (Consolidated)

## Purpose

Create a consolidated DA.live service that handles all Document Authoring (DA.live) Admin API operations including content management, organization access verification, and content copy workflows. This service integrates with the existing AuthenticationService to reuse IMS tokens for DA.live API authentication.

## Prerequisites

- [ ] Step 1 complete: Component registry updated with eds-citisignal-storefront
- [ ] AuthenticationService available for IMS token retrieval
- [ ] Understanding of DA.live Admin API endpoints (admin.da.live)

## Dependencies

**Existing Dependencies (Reused):**
- `@/features/authentication/services/authenticationService.ts` - IMS token access
- `@/core/logging` - Logger, StepLogger
- `@/core/utils/timeoutConfig` - TIMEOUTS constants
- `@/types/errors` - Error handling utilities

**No New npm Packages Required** - Uses native `fetch` API for HTTP calls

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest
- **Mocking:** Mock fetch API, mock AuthenticationService
- **Coverage Target:** 90% (critical API integration)

### Test File Structure

```
tests/unit/features/eds/services/
└── daLiveService.test.ts
```

---

## Tests to Write First

### Unit Tests: DA.live Service

#### Test Group 1: Service Initialization

- [ ] **Test:** Should initialize with AuthenticationService dependency
  - **Given:** AuthenticationService instance provided
  - **When:** DaLiveService is instantiated
  - **Then:** Service is ready to make API calls
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should throw error if AuthenticationService not provided
  - **Given:** No AuthenticationService provided
  - **When:** DaLiveService is instantiated
  - **Then:** Throws descriptive error about missing dependency
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

#### Test Group 2: IMS Token Integration

- [ ] **Test:** Should retrieve IMS token from AuthenticationService
  - **Given:** User is authenticated with valid IMS token
  - **When:** getImsToken() is called
  - **Then:** Returns the current IMS access token
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should throw DaLiveAuthError when not authenticated
  - **Given:** User is not authenticated (no valid token)
  - **When:** Any API operation is attempted
  - **Then:** Throws DaLiveAuthError with clear message
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should handle token expiration during operation
  - **Given:** Token expires mid-operation
  - **When:** API call fails with 401
  - **Then:** Throws DaLiveAuthError indicating re-authentication needed
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

#### Test Group 3: Organization Access Verification

- [ ] **Test:** Should verify user has access to organization
  - **Given:** User is authenticated, org exists
  - **When:** verifyOrgAccess(orgName) is called
  - **Then:** Returns true if user has access
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should return false for inaccessible organization
  - **Given:** User is authenticated, org exists but user lacks access
  - **When:** verifyOrgAccess(orgName) is called
  - **Then:** Returns false with descriptive reason
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should handle non-existent organization
  - **Given:** User is authenticated, org does not exist
  - **When:** verifyOrgAccess(orgName) is called
  - **Then:** Returns false with "organization not found" reason
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

#### Test Group 4: List Directory Contents

- [ ] **Test:** Should list directory contents successfully
  - **Given:** User has access to org/site
  - **When:** listDirectory(org, site, path) is called
  - **Then:** Returns array of DaLiveEntry objects
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should return empty array for empty directory
  - **Given:** Directory exists but is empty
  - **When:** listDirectory(org, site, path) is called
  - **Then:** Returns empty array
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should handle non-existent path gracefully
  - **Given:** Path does not exist
  - **When:** listDirectory(org, site, path) is called
  - **Then:** Returns empty array (not error)
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

#### Test Group 5: Content Copy Operations

- [ ] **Test:** Should copy content from source to destination
  - **Given:** Source exists, destination org accessible
  - **When:** copyContent(source, destination) is called
  - **Then:** Content is copied, returns success status
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should copy entire directory recursively
  - **Given:** Source directory with nested content
  - **When:** copyDirectory(sourceOrg, sourceSite, destOrg, destSite) is called
  - **Then:** All files and subdirectories are copied
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should handle partial copy failure with rollback info
  - **Given:** Copy fails midway through operation
  - **When:** copyDirectory() fails after some files copied
  - **Then:** Returns partial result with list of copied/failed files
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should retry on transient 504 errors
  - **Given:** First copy attempt returns 504
  - **When:** copyContent() is called
  - **Then:** Retries up to 3 times with exponential backoff
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

#### Test Group 6: Create Source (Document Creation)

- [ ] **Test:** Should create new document at path
  - **Given:** Valid HTML content, destination path available
  - **When:** createSource(org, site, path, content) is called
  - **Then:** Document is created, returns success
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should overwrite existing document
  - **Given:** Document already exists at path
  - **When:** createSource() with overwrite=true
  - **Then:** Existing document is replaced
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should fail if document exists and overwrite=false
  - **Given:** Document already exists at path
  - **When:** createSource() with overwrite=false (default)
  - **Then:** Returns error indicating file exists
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

#### Test Group 7: CitiSignal Content Copy Workflow

- [ ] **Test:** Should copy citisignal variation content
  - **Given:** Source: demo-system-stores/accs-citisignal, destination org accessible
  - **When:** copyCitisignalContent(destOrg, destSite) is called
  - **Then:** All citisignal content copied to destination
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should report progress during citisignal copy
  - **Given:** Large content set being copied
  - **When:** copyCitisignalContent() with progress callback
  - **Then:** Callback invoked with progress updates
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should fetch content index before copy
  - **Given:** Citisignal source has full-index.json
  - **When:** copyCitisignalContent() is called
  - **Then:** Fetches index first to determine content list
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

#### Test Group 8: Error Handling

- [ ] **Test:** Should handle network timeout gracefully
  - **Given:** Network timeout occurs during API call
  - **When:** Any API operation times out
  - **Then:** Throws DaLiveNetworkError with timeout details
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should handle rate limiting (429 response)
  - **Given:** API returns 429 Too Many Requests
  - **When:** Any API operation hits rate limit
  - **Then:** Respects retry-after header, retries automatically
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

- [ ] **Test:** Should format errors with user-friendly messages
  - **Given:** API returns error response
  - **When:** Error is caught and processed
  - **Then:** Error has userMessage, technicalDetails, and recoveryHint
  - **File:** `tests/unit/features/eds/services/daLiveService.test.ts`

---

## Files to Create/Modify

### New Files

- [ ] `src/features/eds/services/daLiveService.ts` - Consolidated DA.live service (~300 lines)
- [ ] `tests/unit/features/eds/services/daLiveService.test.ts` - Unit tests (~400 lines)

### Types to Add (in types.ts from Step 1)

```typescript
// DA.live API Types
export interface DaLiveEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  lastModified?: string;
  size?: number;
}

export interface DaLiveSourceResult {
  success: boolean;
  path: string;
  error?: string;
}

export interface DaLiveCopyResult {
  success: boolean;
  copiedFiles: string[];
  failedFiles: Array<{ path: string; error: string }>;
  totalFiles: number;
}

export interface DaLiveOrgAccess {
  hasAccess: boolean;
  reason?: string;
  orgName: string;
}

export type DaLiveProgressCallback = (progress: {
  current: number;
  total: number;
  currentFile: string;
}) => void;

// Error Types
export class DaLiveError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly userMessage: string,
    public readonly recoveryHint?: string
  ) {
    super(message);
    this.name = 'DaLiveError';
  }
}

export class DaLiveAuthError extends DaLiveError {
  constructor(message: string, recoveryHint?: string) {
    super(message, 'AUTH_FAILED', 'DA.live authentication failed', recoveryHint);
    this.name = 'DaLiveAuthError';
  }
}

export class DaLiveNetworkError extends DaLiveError {
  constructor(message: string, public readonly statusCode?: number) {
    super(
      message,
      'NETWORK_ERROR',
      'Unable to connect to DA.live',
      'Check your internet connection and try again'
    );
    this.name = 'DaLiveNetworkError';
  }
}
```

---

## Implementation Details

### RED Phase (Write Failing Tests First)

```typescript
// tests/unit/features/eds/services/daLiveService.test.ts

import { DaLiveService } from '@/features/eds/services/daLiveService';
import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { DaLiveAuthError, DaLiveNetworkError } from '@/features/eds/services/types';

// Mock dependencies
jest.mock('@/features/authentication/services/authenticationService');
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DaLiveService', () => {
  let service: DaLiveService;
  let mockAuthService: jest.Mocked<AuthenticationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthService = {
      getTokenManager: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-ims-token-abc123'),
      }),
      isAuthenticated: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<AuthenticationService>;

    service = new DaLiveService(mockAuthService);
  });

  describe('initialization', () => {
    it('should initialize with AuthenticationService dependency', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(DaLiveService);
    });

    it('should throw error if AuthenticationService not provided', () => {
      expect(() => new DaLiveService(null as any)).toThrow(
        'AuthenticationService is required for DaLiveService'
      );
    });
  });

  describe('IMS token integration', () => {
    it('should retrieve IMS token from AuthenticationService', async () => {
      const token = await service.getImsToken();
      expect(token).toBe('mock-ims-token-abc123');
      expect(mockAuthService.getTokenManager).toHaveBeenCalled();
    });

    it('should throw DaLiveAuthError when not authenticated', async () => {
      mockAuthService.getTokenManager().getAccessToken.mockResolvedValue(undefined);

      await expect(service.verifyOrgAccess('test-org')).rejects.toThrow(DaLiveAuthError);
    });
  });

  describe('verifyOrgAccess', () => {
    it('should verify user has access to organization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ name: 'test-site' }]),
      });

      const result = await service.verifyOrgAccess('test-org');

      expect(result.hasAccess).toBe(true);
      expect(result.orgName).toBe('test-org');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://admin.da.live/list/test-org/',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-ims-token-abc123',
          }),
        })
      );
    });

    it('should return false for inaccessible organization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const result = await service.verifyOrgAccess('private-org');

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('access denied');
    });
  });

  describe('listDirectory', () => {
    it('should list directory contents successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { name: 'index.html', path: '/index.html', ext: '.html' },
          { name: 'nav', path: '/nav', ext: '' },
        ]),
      });

      const entries = await service.listDirectory('test-org', 'test-site', '/');

      expect(entries).toHaveLength(2);
      expect(entries[0].name).toBe('index.html');
      expect(entries[0].type).toBe('file');
      expect(entries[1].type).toBe('directory');
    });

    it('should return empty array for non-existent path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const entries = await service.listDirectory('org', 'site', '/nonexistent');
      expect(entries).toEqual([]);
    });
  });

  describe('copyContent', () => {
    it('should copy content from source to destination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const result = await service.copyContent(
        { org: 'source-org', site: 'source-site', path: '/doc.html' },
        { org: 'dest-org', site: 'dest-site', path: '/doc.html' }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://admin.da.live/copy/dest-org/dest-site/doc.html',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      );
    });

    it('should retry on transient 504 errors', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 504 })
        .mockResolvedValueOnce({ ok: false, status: 504 })
        .mockResolvedValueOnce({ ok: true, status: 201 });

      const result = await service.copyContent(
        { org: 'src', site: 'site', path: '/doc.html' },
        { org: 'dst', site: 'site', path: '/doc.html' }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('copyCitisignalContent', () => {
    it('should copy citisignal variation content', async () => {
      // Mock index fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { path: '/index.html' },
            { path: '/about.html' },
          ],
        }),
      });

      // Mock individual copy operations
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 201 })
        .mockResolvedValueOnce({ ok: true, status: 201 });

      const progressCalls: any[] = [];
      const result = await service.copyCitisignalContent(
        'dest-org',
        'dest-site',
        (progress) => progressCalls.push(progress)
      );

      expect(result.success).toBe(true);
      expect(result.copiedFiles).toHaveLength(2);
      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle network timeout gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network timeout'));

      await expect(
        service.listDirectory('org', 'site', '/')
      ).rejects.toThrow(DaLiveNetworkError);
    });

    it('should handle rate limiting with retry-after', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: () => '2' },
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

      const entries = await service.listDirectory('org', 'site', '/');

      expect(entries).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
```

### GREEN Phase (Minimal Implementation)

```typescript
// src/features/eds/services/daLiveService.ts

import { getLogger, Logger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type {
  DaLiveEntry,
  DaLiveSourceResult,
  DaLiveCopyResult,
  DaLiveOrgAccess,
  DaLiveProgressCallback,
} from './types';
import { DaLiveAuthError, DaLiveNetworkError } from './types';

/**
 * DA.live Admin API base URL
 */
const DA_LIVE_ADMIN_URL = 'https://admin.da.live';

/**
 * CitiSignal source configuration
 */
const CITISIGNAL_SOURCE = {
  org: 'demo-system-stores',
  site: 'accs-citisignal',
  indexUrl: 'https://main--accs-citisignal--demo-system-stores.aem.live/full-index.json',
};

/**
 * Consolidated DA.live service for content management operations.
 * Handles Admin API interactions, content copy, and organization access.
 *
 * Reuses AuthenticationService for IMS token management.
 */
export class DaLiveService {
  private logger: Logger;
  private readonly maxRetries = 3;
  private readonly retryDelay = 3000; // 3 seconds base delay

  constructor(private readonly authService: AuthenticationService) {
    if (!authService) {
      throw new Error('AuthenticationService is required for DaLiveService');
    }
    this.logger = getLogger();
  }

  /**
   * Get IMS token from AuthenticationService
   */
  async getImsToken(): Promise<string> {
    const tokenManager = this.authService.getTokenManager();
    const token = await tokenManager.getAccessToken();

    if (!token) {
      throw new DaLiveAuthError(
        'No IMS token available',
        'Please authenticate with Adobe first'
      );
    }

    return token;
  }

  /**
   * Build authorization headers for DA.live API calls
   */
  private async buildHeaders(): Promise<HeadersInit> {
    const token = await this.getImsToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Execute fetch with retry logic for transient failures
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = this.maxRetries
  ): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          TIMEOUTS.DA_LIVE_API
        );

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '2');
          this.logger.warn(`[DA.live] Rate limited, waiting ${retryAfter}s`);
          await this.delay(retryAfter * 1000);
          continue;
        }

        // Retry on transient errors (504, 503)
        if ((response.status === 504 || response.status === 503) && attempt < retries) {
          this.logger.warn(`[DA.live] Transient error ${response.status}, retry ${attempt}/${retries}`);
          await this.delay(this.retryDelay * attempt);
          continue;
        }

        return response;
      } catch (error) {
        if (attempt === retries) {
          throw new DaLiveNetworkError(`Network error after ${retries} attempts: ${error}`);
        }
        this.logger.warn(`[DA.live] Fetch failed, retry ${attempt}/${retries}`);
        await this.delay(this.retryDelay * attempt);
      }
    }

    throw new DaLiveNetworkError('Max retries exceeded');
  }

  /**
   * Verify user has access to a DA.live organization
   */
  async verifyOrgAccess(orgName: string): Promise<DaLiveOrgAccess> {
    try {
      const headers = await this.buildHeaders();
      const response = await this.fetchWithRetry(
        `${DA_LIVE_ADMIN_URL}/list/${orgName}/`,
        { method: 'GET', headers }
      );

      if (response.ok) {
        return { hasAccess: true, orgName };
      }

      if (response.status === 403) {
        return {
          hasAccess: false,
          orgName,
          reason: 'access denied - you may not have permissions for this organization',
        };
      }

      if (response.status === 404) {
        return {
          hasAccess: false,
          orgName,
          reason: 'organization not found',
        };
      }

      return {
        hasAccess: false,
        orgName,
        reason: `unexpected status: ${response.status}`,
      };
    } catch (error) {
      if (error instanceof DaLiveAuthError) {
        throw error;
      }
      this.logger.error('[DA.live] Org access check failed', error as Error);
      return {
        hasAccess: false,
        orgName,
        reason: `error checking access: ${error}`,
      };
    }
  }

  /**
   * List directory contents at a path
   */
  async listDirectory(
    org: string,
    site: string,
    path: string
  ): Promise<DaLiveEntry[]> {
    try {
      const headers = await this.buildHeaders();
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      const url = `${DA_LIVE_ADMIN_URL}/list/${org}/${site}/${cleanPath}`;

      const response = await this.fetchWithRetry(url, { method: 'GET', headers });

      if (!response.ok) {
        if (response.status === 404) {
          return []; // Non-existent path returns empty array
        }
        throw new DaLiveNetworkError(`List failed: ${response.status}`, response.status);
      }

      const data = await response.json();

      return (Array.isArray(data) ? data : []).map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.ext === '' ? 'directory' : 'file',
        lastModified: item.lastModified,
        size: item.size,
      }));
    } catch (error) {
      if (error instanceof DaLiveAuthError || error instanceof DaLiveNetworkError) {
        throw error;
      }
      throw new DaLiveNetworkError(`List directory failed: ${error}`);
    }
  }

  /**
   * Copy content from source to destination
   */
  async copyContent(
    source: { org: string; site: string; path: string },
    destination: { org: string; site: string; path: string }
  ): Promise<DaLiveSourceResult> {
    try {
      const token = await this.getImsToken();
      const cleanDestPath = destination.path.startsWith('/')
        ? destination.path.slice(1)
        : destination.path;

      const formData = new FormData();
      formData.append(
        'source',
        `https://content.da.live/${source.org}/${source.site}${source.path}`
      );

      const response = await this.fetchWithRetry(
        `${DA_LIVE_ADMIN_URL}/copy/${destination.org}/${destination.site}/${cleanDestPath}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!response.ok) {
        return {
          success: false,
          path: destination.path,
          error: `Copy failed with status ${response.status}`,
        };
      }

      return { success: true, path: destination.path };
    } catch (error) {
      return {
        success: false,
        path: destination.path,
        error: String(error),
      };
    }
  }

  /**
   * Create a new document at path
   */
  async createSource(
    org: string,
    site: string,
    path: string,
    content: string,
    overwrite = false
  ): Promise<DaLiveSourceResult> {
    try {
      const token = await this.getImsToken();
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;

      // Check if file exists (if overwrite is false)
      if (!overwrite) {
        const entries = await this.listDirectory(org, site, cleanPath);
        if (entries.length > 0) {
          return {
            success: false,
            path,
            error: 'File already exists. Use overwrite=true to replace.',
          };
        }
      }

      const formData = new FormData();
      const blob = new Blob([content], { type: 'text/html' });
      formData.append('file', blob, path.split('/').pop() || 'index.html');

      const response = await this.fetchWithRetry(
        `${DA_LIVE_ADMIN_URL}/source/${org}/${site}/${cleanPath}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!response.ok) {
        return {
          success: false,
          path,
          error: `Create failed with status ${response.status}`,
        };
      }

      return { success: true, path };
    } catch (error) {
      return {
        success: false,
        path,
        error: String(error),
      };
    }
  }

  /**
   * Copy CitiSignal variation content to destination
   * Uses the demo-system-stores/accs-citisignal source
   */
  async copyCitisignalContent(
    destOrg: string,
    destSite: string,
    progressCallback?: DaLiveProgressCallback
  ): Promise<DaLiveCopyResult> {
    const copiedFiles: string[] = [];
    const failedFiles: Array<{ path: string; error: string }> = [];

    try {
      // Fetch content index
      this.logger.info('[DA.live] Fetching CitiSignal content index...');
      const indexResponse = await fetch(CITISIGNAL_SOURCE.indexUrl);

      if (!indexResponse.ok) {
        throw new DaLiveNetworkError(
          `Failed to fetch content index: ${indexResponse.status}`,
          indexResponse.status
        );
      }

      const indexData = await indexResponse.json();
      const contentPaths: string[] = (indexData.data || []).map((item: any) => item.path);

      this.logger.info(`[DA.live] Found ${contentPaths.length} files to copy`);

      // Copy each file
      for (let i = 0; i < contentPaths.length; i++) {
        const path = contentPaths[i];

        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: contentPaths.length,
            currentFile: path,
          });
        }

        const result = await this.copyContent(
          { org: CITISIGNAL_SOURCE.org, site: CITISIGNAL_SOURCE.site, path },
          { org: destOrg, site: destSite, path }
        );

        if (result.success) {
          copiedFiles.push(path);
        } else {
          failedFiles.push({ path, error: result.error || 'Unknown error' });
        }
      }

      return {
        success: failedFiles.length === 0,
        copiedFiles,
        failedFiles,
        totalFiles: contentPaths.length,
      };
    } catch (error) {
      this.logger.error('[DA.live] CitiSignal content copy failed', error as Error);
      return {
        success: false,
        copiedFiles,
        failedFiles,
        totalFiles: 0,
      };
    }
  }

  /**
   * Utility delay function for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### REFACTOR Phase

1. **Extract retry logic** to shared utility if similar patterns emerge in GitHubService
2. **Add request/response logging** for debugging
3. **Consider connection pooling** if performance issues arise
4. **Add unit tests for edge cases** as discovered during integration

---

## Expected Outcome

After completing this step:

- [ ] DaLiveService class fully implemented with all API operations
- [ ] IMS token integration working via AuthenticationService
- [ ] Organization access verification functional
- [ ] Content copy operations working (single file and directory)
- [ ] CitiSignal content copy workflow operational
- [ ] Comprehensive error handling with user-friendly messages
- [ ] Unit tests passing with 90%+ coverage

**What can be demonstrated:**
- Verify DA.live org access programmatically
- List directory contents from DA.live
- Copy content between organizations
- Copy CitiSignal variation to new site

---

## Acceptance Criteria

- [ ] All unit tests passing for DaLiveService
- [ ] Code follows project style guide (ESLint passing)
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 90% for daLiveService.ts
- [ ] Error messages are user-friendly
- [ ] IMS token reused from existing AuthenticationService
- [ ] Retry logic handles transient failures (504, 503)
- [ ] Rate limiting (429) handled gracefully

---

## Estimated Time

**4-6 hours**

- Test writing: 2 hours
- Implementation: 2-3 hours
- Refactoring and edge cases: 1 hour

---

## Notes

### DA.live Admin API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/list/{org}/{site}/{path}` | List directory contents |
| GET | `/source/{org}/{site}/{path}` | Retrieve content |
| POST | `/source/{org}/{site}/{path}` | Create/update content |
| POST | `/copy/{org}/{site}/{path}` | Copy content |
| DELETE | `/source/{org}/{site}/{path}` | Delete content |

### CitiSignal Source Configuration

- **Organization:** `demo-system-stores`
- **Site:** `accs-citisignal`
- **Index URL:** `https://main--accs-citisignal--demo-system-stores.aem.live/full-index.json`
- **Content URL:** `https://content.da.live/demo-system-stores/accs-citisignal/`

### Integration with AuthenticationService

The service reuses the existing IMS token from AuthenticationService rather than implementing separate DA.live authentication. This is based on research findings that DA.live uses Adobe IMS as identity provider.

```typescript
// Token access pattern
const tokenManager = authService.getTokenManager();
const token = await tokenManager.getAccessToken();
```

### Timeout Configuration

Add to `src/core/utils/timeoutConfig.ts`:

```typescript
export const TIMEOUTS = {
  // ... existing timeouts
  DA_LIVE_API: 30000, // 30 seconds for DA.live API calls
};
```

---

## Related Steps

- **Step 1:** Component registry (provides component definitions)
- **Step 2:** GitHub Service (similar patterns for OAuth/API)
- **Step 4:** EDS Project Service (orchestrates this service)
- **Step 6:** Wizard UI (consumes this service)
