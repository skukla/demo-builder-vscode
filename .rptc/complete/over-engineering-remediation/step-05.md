# Step 5: Authentication Service Consolidation

## Purpose

Consolidate 20 authentication service files (~5,300+ LOC) into 5 focused modules (~1,000 LOC target, 80%+ reduction). The current structure has 3+ layers of indirection for simple CLI calls and tightly coupled services that provide no actual polymorphism benefit.

**Why This Matters:** Authentication is a critical path for all Adobe I/O operations. The current structure makes debugging difficult (must trace through 4+ files), adds cognitive overhead (which service handles what?), and creates unnecessary coupling (god constructor with 7+ dependencies).

## Current State Analysis

### Problem: Service Explosion

```
src/features/authentication/services/ (20 files, ~5,300 LOC)
├── authenticationService.ts       (606 lines) - orchestrates 7+ services
├── adobeEntityFetcher.ts          (331 lines) - fetches orgs/projects/workspaces
├── adobeEntitySelector.ts         (423 lines) - UI selection logic
├── adobeEntityService.ts          (197 lines) - entity operations facade
├── adobeContextResolver.ts        (323 lines) - context resolution
├── adobeSDKClient.ts              (151 lines) - SDK wrapper
├── tokenManager.ts                (279 lines) - token operations
├── authCacheManager.ts            (316 lines) - auth caching
├── organizationValidator.ts       (230 lines) - org validation
├── organizationOperations.ts      (365 lines) - org CRUD
├── projectOperations.ts           (321 lines) - project CRUD
├── workspaceOperations.ts         (250 lines) - workspace CRUD
├── contextOperations.ts           (159 lines) - context CRUD
├── performanceTracker.ts          (95 lines)  - perf tracking
├── authPredicates.ts              (30 lines)  - type predicates
├── authenticationErrorFormatter.ts (90 lines) - error formatting
├── entityMappers.ts               (30 lines)  - entity mapping
└── types.ts                       (50 lines)  - type definitions
```

### Root Cause: Over-Abstracted Layers

**Current Call Path (3+ layers of indirection):**
```typescript
authService.getOrgs()
  → entityFetcher.getOrgs()
    → entityService.getOrgs()
      → contextOps.getConsoleWhere()
        → commandManager.execute('aio console where')
```

**Should Be:**
```typescript
authService.getOrgs()
  → commandManager.execute('aio console org list')
```

### Target State

```
src/features/authentication/services/ (5 files, ~1,000 LOC)
├── authenticationService.ts       (~300 lines) - main orchestrator, token validation
├── organizationService.ts         (~200 lines) - get, select, validate orgs
├── projectService.ts              (~200 lines) - get, select, validate projects
├── workspaceService.ts            (~200 lines) - get, select, validate workspaces
├── authCache.ts                   (~100 lines) - unified caching
└── types.ts                       (~50 lines)  - type definitions (preserve)
```

## Prerequisites

- [ ] All 267 tests passing before starting
- [ ] Understand authentication flow from UI to CLI
- [ ] Map current dependencies between services
- [ ] Identify which services are actually used externally

## Tests to Write First (RED Phase)

### Test Scenario 1: Organization Operations

**Given:** Simplified organizationService
**When:** Calling getOrganizations, selectOrganization, validateOrganization
**Then:** All operations work with single service

```typescript
// tests/features/authentication/services/organizationService.test.ts
describe('OrganizationService - Simplified', () => {
  let orgService: OrganizationService;
  let mockCommandExecutor: jest.Mocked<CommandExecutor>;

  beforeEach(() => {
    mockCommandExecutor = createMockCommandExecutor();
    orgService = new OrganizationService(mockCommandExecutor);
  });

  describe('getOrganizations', () => {
    it('should fetch organizations directly via CLI', async () => {
      mockCommandExecutor.execute.mockResolvedValue({
        stdout: '[{"id": "org1", "name": "Test Org"}]',
        exitCode: 0
      });

      const orgs = await orgService.getOrganizations();

      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'aio', ['console', 'org', 'list', '--json'],
        expect.any(Object)
      );
      expect(orgs).toHaveLength(1);
      expect(orgs[0].id).toBe('org1');
    });

    it('should use cache when available', async () => {
      // First call - populates cache
      mockCommandExecutor.execute.mockResolvedValue({
        stdout: '[{"id": "org1", "name": "Test Org"}]',
        exitCode: 0
      });
      await orgService.getOrganizations();

      // Second call - should use cache
      await orgService.getOrganizations();

      expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('selectOrganization', () => {
    it('should select organization via CLI', async () => {
      mockCommandExecutor.execute.mockResolvedValue({
        stdout: 'Selected organization: org1',
        exitCode: 0
      });

      await orgService.selectOrganization('org1');

      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'aio', ['console', 'org', 'select', 'org1'],
        expect.any(Object)
      );
    });
  });

  describe('validateOrganization', () => {
    it('should validate org exists and is accessible', async () => {
      mockCommandExecutor.execute.mockResolvedValue({
        stdout: '{"id": "org1", "name": "Test Org"}',
        exitCode: 0
      });

      const result = await orgService.validateOrganization('org1');

      expect(result.valid).toBe(true);
      expect(result.organization).toBeDefined();
    });
  });
});
```

### Test Scenario 2: Project Operations

**Given:** Simplified projectService
**When:** Calling getProjects, selectProject, validateProject
**Then:** All operations work with single service

```typescript
// tests/features/authentication/services/projectService.test.ts
describe('ProjectService - Simplified', () => {
  let projectService: ProjectService;
  let mockCommandExecutor: jest.Mocked<CommandExecutor>;

  describe('getProjects', () => {
    it('should fetch projects for organization', async () => {
      mockCommandExecutor.execute.mockResolvedValue({
        stdout: '[{"id": "proj1", "title": "Test Project"}]',
        exitCode: 0
      });

      const projects = await projectService.getProjects('org1');

      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'aio', ['console', 'project', 'list', '--orgId', 'org1', '--json'],
        expect.any(Object)
      );
    });
  });

  describe('selectProject', () => {
    it('should select project via CLI', async () => {
      await projectService.selectProject('org1', 'proj1');

      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'aio', ['console', 'project', 'select', 'proj1', '--orgId', 'org1'],
        expect.any(Object)
      );
    });
  });
});
```

### Test Scenario 3: Workspace Operations

**Given:** Simplified workspaceService
**When:** Calling getWorkspaces, selectWorkspace, validateWorkspace
**Then:** All operations work with single service

```typescript
// tests/features/authentication/services/workspaceService.test.ts
describe('WorkspaceService - Simplified', () => {
  let workspaceService: WorkspaceService;

  describe('getWorkspaces', () => {
    it('should fetch workspaces for project', async () => {
      const workspaces = await workspaceService.getWorkspaces('org1', 'proj1');

      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'aio', ['console', 'workspace', 'list', '--orgId', 'org1', '--projectId', 'proj1', '--json'],
        expect.any(Object)
      );
    });
  });
});
```

### Test Scenario 4: Token Management

**Given:** Token validation in authenticationService
**When:** Checking token validity
**Then:** Uses simplified token check

```typescript
// tests/features/authentication/services/authenticationService.test.ts
describe('AuthenticationService - Token Validation', () => {
  describe('isAuthenticated', () => {
    it('should check token validity via CLI', async () => {
      mockCommandExecutor.execute.mockResolvedValue({
        stdout: 'Token valid',
        exitCode: 0
      });

      const result = await authService.isAuthenticated();

      expect(result).toBe(true);
      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'aio', ['auth', 'check'],
        expect.any(Object)
      );
    });
  });
});
```

### Test Scenario 5: Unified Cache

**Given:** Simplified authCache
**When:** Caching auth-related data
**Then:** Single cache service handles all auth caching

```typescript
// tests/features/authentication/services/authCache.test.ts
describe('AuthCache - Simplified', () => {
  let cache: AuthCache;

  beforeEach(() => {
    cache = new AuthCache({ ttlMs: 300000, jitterPercent: 10 });
  });

  it('should cache organizations', () => {
    const orgs = [{ id: 'org1', name: 'Test Org' }];
    cache.setOrganizations(orgs);

    expect(cache.getOrganizations()).toEqual(orgs);
  });

  it('should cache projects by org', () => {
    const projects = [{ id: 'proj1', title: 'Test Project' }];
    cache.setProjects('org1', projects);

    expect(cache.getProjects('org1')).toEqual(projects);
    expect(cache.getProjects('org2')).toBeUndefined();
  });

  it('should invalidate cache on org change', () => {
    cache.setOrganizations([{ id: 'org1' }]);
    cache.setProjects('org1', [{ id: 'proj1' }]);

    cache.invalidateForOrg('org1');

    expect(cache.getProjects('org1')).toBeUndefined();
    expect(cache.getOrganizations()).toBeDefined(); // Orgs not cleared
  });
});
```

## Files to Modify

### Files to Delete (15 files, ~3,500 LOC)

```
src/features/authentication/services/
├── adobeEntityFetcher.ts          (DELETE - inline to services)
├── adobeEntitySelector.ts         (DELETE - inline to services)
├── adobeEntityService.ts          (DELETE - unnecessary facade)
├── adobeContextResolver.ts        (DELETE - inline to services)
├── adobeSDKClient.ts              (DELETE - inline to authenticationService)
├── tokenManager.ts                (DELETE - inline to authenticationService)
├── organizationValidator.ts       (DELETE - inline to organizationService)
├── organizationOperations.ts      (DELETE - merge into organizationService)
├── projectOperations.ts           (DELETE - merge into projectService)
├── workspaceOperations.ts         (DELETE - merge into workspaceService)
├── contextOperations.ts           (DELETE - inline to services)
├── performanceTracker.ts          (DELETE - inline or remove if unused)
├── authPredicates.ts              (DELETE - inline to types.ts)
├── authenticationErrorFormatter.ts (DELETE - inline to authenticationService)
└── entityMappers.ts               (DELETE - inline to services)
```

### Files to Create (3 new focused services)

```
src/features/authentication/services/
├── organizationService.ts         (NEW - ~200 lines)
├── projectService.ts              (NEW - ~200 lines)
└── workspaceService.ts            (NEW - ~200 lines)
```

### Files to Refactor (3 files)

```
src/features/authentication/services/
├── authenticationService.ts       (REFACTOR - 606 → ~300 lines)
├── authCacheManager.ts            (REFACTOR → authCache.ts - 316 → ~100 lines)
└── types.ts                       (KEEP - add type predicates from authPredicates.ts)
```

## Implementation Details

### RED Phase

1. Create test files for new simplified services
2. Tests will fail (services don't exist yet)

### GREEN Phase

**Step 1: Create OrganizationService**

```typescript
// src/features/authentication/services/organizationService.ts
import { getCommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Organization } from './types';
import { AuthCache } from './authCache';

export class OrganizationService {
    private cache: AuthCache;
    private executor = getCommandExecutor();

    constructor(cache: AuthCache) {
        this.cache = cache;
    }

    async getOrganizations(): Promise<Organization[]> {
        // Check cache first
        const cached = this.cache.getOrganizations();
        if (cached) return cached;

        // Fetch from CLI
        const result = await this.executor.execute(
            'aio', ['console', 'org', 'list', '--json'],
            { timeout: TIMEOUTS.NORMAL }
        );

        const orgs = this.parseOrganizations(result.stdout);
        this.cache.setOrganizations(orgs);
        return orgs;
    }

    async selectOrganization(orgId: string): Promise<void> {
        await this.executor.execute(
            'aio', ['console', 'org', 'select', orgId],
            { timeout: TIMEOUTS.NORMAL }
        );

        // Invalidate project/workspace cache on org change
        this.cache.invalidateForOrg(orgId);
    }

    async validateOrganization(orgId: string): Promise<ValidationResult> {
        const orgs = await this.getOrganizations();
        const org = orgs.find(o => o.id === orgId);

        if (!org) {
            return { valid: false, error: `Organization ${orgId} not found` };
        }

        return { valid: true, organization: org };
    }

    private parseOrganizations(stdout: string): Organization[] {
        try {
            return JSON.parse(stdout);
        } catch {
            return [];
        }
    }
}
```

**Step 2: Create ProjectService**

```typescript
// src/features/authentication/services/projectService.ts
import { getCommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Project } from './types';
import { AuthCache } from './authCache';

export class ProjectService {
    private cache: AuthCache;
    private executor = getCommandExecutor();

    constructor(cache: AuthCache) {
        this.cache = cache;
    }

    async getProjects(orgId: string): Promise<Project[]> {
        const cached = this.cache.getProjects(orgId);
        if (cached) return cached;

        const result = await this.executor.execute(
            'aio', ['console', 'project', 'list', '--orgId', orgId, '--json'],
            { timeout: TIMEOUTS.NORMAL }
        );

        const projects = this.parseProjects(result.stdout);
        this.cache.setProjects(orgId, projects);
        return projects;
    }

    async selectProject(orgId: string, projectId: string): Promise<void> {
        await this.executor.execute(
            'aio', ['console', 'project', 'select', projectId, '--orgId', orgId],
            { timeout: TIMEOUTS.NORMAL }
        );

        // Invalidate workspace cache on project change
        this.cache.invalidateForProject(orgId, projectId);
    }

    async validateProject(orgId: string, projectId: string): Promise<ValidationResult> {
        const projects = await this.getProjects(orgId);
        const project = projects.find(p => p.id === projectId);

        if (!project) {
            return { valid: false, error: `Project ${projectId} not found` };
        }

        return { valid: true, project };
    }

    private parseProjects(stdout: string): Project[] {
        try {
            return JSON.parse(stdout);
        } catch {
            return [];
        }
    }
}
```

**Step 3: Create WorkspaceService**

```typescript
// src/features/authentication/services/workspaceService.ts
import { getCommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Workspace } from './types';
import { AuthCache } from './authCache';

export class WorkspaceService {
    private cache: AuthCache;
    private executor = getCommandExecutor();

    constructor(cache: AuthCache) {
        this.cache = cache;
    }

    async getWorkspaces(orgId: string, projectId: string): Promise<Workspace[]> {
        const cached = this.cache.getWorkspaces(orgId, projectId);
        if (cached) return cached;

        const result = await this.executor.execute(
            'aio', ['console', 'workspace', 'list', '--orgId', orgId, '--projectId', projectId, '--json'],
            { timeout: TIMEOUTS.NORMAL }
        );

        const workspaces = this.parseWorkspaces(result.stdout);
        this.cache.setWorkspaces(orgId, projectId, workspaces);
        return workspaces;
    }

    async selectWorkspace(orgId: string, projectId: string, workspaceId: string): Promise<void> {
        await this.executor.execute(
            'aio', ['console', 'workspace', 'select', workspaceId, '--orgId', orgId, '--projectId', projectId],
            { timeout: TIMEOUTS.NORMAL }
        );
    }

    async validateWorkspace(orgId: string, projectId: string, workspaceId: string): Promise<ValidationResult> {
        const workspaces = await this.getWorkspaces(orgId, projectId);
        const workspace = workspaces.find(w => w.id === workspaceId);

        if (!workspace) {
            return { valid: false, error: `Workspace ${workspaceId} not found` };
        }

        return { valid: true, workspace };
    }

    private parseWorkspaces(stdout: string): Workspace[] {
        try {
            return JSON.parse(stdout);
        } catch {
            return [];
        }
    }
}
```

**Step 4: Simplify AuthCache**

```typescript
// src/features/authentication/services/authCache.ts
import { getCacheTTLWithJitter, CacheConfig } from '@/core/cache/AbstractCacheManager';
import { Organization, Project, Workspace } from './types';

interface CacheEntry<V> {
    value: V;
    expiresAt: number;
}

/**
 * Unified auth cache - no abstraction, just maps.
 */
export class AuthCache {
    private orgs: CacheEntry<Organization[]> | null = null;
    private projects: Map<string, CacheEntry<Project[]>> = new Map();
    private workspaces: Map<string, CacheEntry<Workspace[]>> = new Map();

    private readonly ttlMs: number;
    private readonly jitterPercent: number;

    constructor(config: CacheConfig) {
        this.ttlMs = config.ttlMs;
        this.jitterPercent = config.jitterPercent ?? 0;
    }

    private getTTL(): number {
        if (this.jitterPercent === 0) return this.ttlMs;
        return getCacheTTLWithJitter(this.ttlMs, this.jitterPercent);
    }

    private isExpired(entry: CacheEntry<unknown>): boolean {
        return Date.now() > entry.expiresAt;
    }

    // Organizations
    setOrganizations(orgs: Organization[]): void {
        this.orgs = { value: orgs, expiresAt: Date.now() + this.getTTL() };
    }

    getOrganizations(): Organization[] | undefined {
        if (!this.orgs || this.isExpired(this.orgs)) return undefined;
        return this.orgs.value;
    }

    // Projects (keyed by orgId)
    setProjects(orgId: string, projects: Project[]): void {
        this.projects.set(orgId, { value: projects, expiresAt: Date.now() + this.getTTL() });
    }

    getProjects(orgId: string): Project[] | undefined {
        const entry = this.projects.get(orgId);
        if (!entry || this.isExpired(entry)) return undefined;
        return entry.value;
    }

    // Workspaces (keyed by orgId:projectId)
    setWorkspaces(orgId: string, projectId: string, workspaces: Workspace[]): void {
        const key = `${orgId}:${projectId}`;
        this.workspaces.set(key, { value: workspaces, expiresAt: Date.now() + this.getTTL() });
    }

    getWorkspaces(orgId: string, projectId: string): Workspace[] | undefined {
        const key = `${orgId}:${projectId}`;
        const entry = this.workspaces.get(key);
        if (!entry || this.isExpired(entry)) return undefined;
        return entry.value;
    }

    // Invalidation
    invalidateForOrg(orgId: string): void {
        this.projects.delete(orgId);
        // Clear all workspaces for this org
        for (const key of this.workspaces.keys()) {
            if (key.startsWith(`${orgId}:`)) {
                this.workspaces.delete(key);
            }
        }
    }

    invalidateForProject(orgId: string, projectId: string): void {
        this.workspaces.delete(`${orgId}:${projectId}`);
    }

    clear(): void {
        this.orgs = null;
        this.projects.clear();
        this.workspaces.clear();
    }
}
```

**Step 5: Refactor AuthenticationService**

```typescript
// src/features/authentication/services/authenticationService.ts (simplified)
import { getCommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { AuthCache } from './authCache';
import { OrganizationService } from './organizationService';
import { ProjectService } from './projectService';
import { WorkspaceService } from './workspaceService';

export class AuthenticationService {
    private executor = getCommandExecutor();
    private cache: AuthCache;

    readonly organizations: OrganizationService;
    readonly projects: ProjectService;
    readonly workspaces: WorkspaceService;

    constructor() {
        this.cache = new AuthCache({ ttlMs: 300000, jitterPercent: 10 });
        this.organizations = new OrganizationService(this.cache);
        this.projects = new ProjectService(this.cache);
        this.workspaces = new WorkspaceService(this.cache);
    }

    /**
     * Check if user is authenticated
     */
    async isAuthenticated(): Promise<boolean> {
        try {
            const result = await this.executor.execute(
                'aio', ['auth', 'check'],
                { timeout: TIMEOUTS.QUICK }
            );
            return result.exitCode === 0;
        } catch {
            return false;
        }
    }

    /**
     * Initiate login flow
     */
    async login(): Promise<boolean> {
        const result = await this.executor.execute(
            'aio', ['auth', 'login'],
            { timeout: TIMEOUTS.AUTH.BROWSER }
        );
        return result.exitCode === 0;
    }

    /**
     * Logout and clear cache
     */
    async logout(): Promise<void> {
        await this.executor.execute('aio', ['auth', 'logout'], {
            timeout: TIMEOUTS.QUICK
        });
        this.cache.clear();
    }

    /**
     * Clear all caches
     */
    clearCache(): void {
        this.cache.clear();
    }
}
```

### REFACTOR Phase

1. Update all imports across codebase
2. Remove deleted files
3. Update handler registrations
4. Run full test suite
5. Clean up any remaining references

## Migration Path

### Phase 1: Create New Services (Non-Breaking)

1. Create `organizationService.ts`, `projectService.ts`, `workspaceService.ts`
2. Create `authCache.ts`
3. Keep old services running in parallel

### Phase 2: Migrate Consumers

Update consumers one-by-one:
- `src/features/authentication/handlers/` - Update to use new services
- `src/features/authentication/ui/` - Update to use new services
- `src/commands/` - Update command consumers

### Phase 3: Delete Old Services

After all consumers migrated:
1. Delete 15 obsolete files
2. Remove unused exports from index.ts
3. Update barrel exports

## Expected Outcome

After this step:

1. **LOC Reduction:** ~5,300 lines → ~1,000 lines (80%+ reduction)
2. **File Reduction:** 20 files → 6 files (70% reduction)
3. **Indirection Layers:** 4+ layers → 1 layer (direct CLI calls)
4. **Dependencies:** 7+ injected services → 1 shared cache

## Acceptance Criteria

- [ ] All 267 existing tests pass
- [ ] New services pass all test scenarios
- [ ] Authentication flows work identically (login, org/project/workspace selection)
- [ ] Cache invalidation works correctly
- [ ] No regression in auth performance
- [ ] TypeScript compilation succeeds
- [ ] Consumers updated to new API

## Dependencies from Other Steps

**None** - This step is independent and can be done in parallel with steps 1-4 or 6-7.

## Risk Assessment

### Risk: Breaking Authentication Flows

- **Likelihood:** Medium (complex refactoring)
- **Impact:** Critical (auth is core functionality)
- **Mitigation:** Keep old services until full migration complete; comprehensive integration tests; gradual consumer migration

### Risk: Cache Invalidation Bugs

- **Likelihood:** Medium (new cache structure)
- **Impact:** Medium (stale data, incorrect selections)
- **Mitigation:** Explicit tests for invalidation scenarios; clear ownership of cache keys

### Risk: CLI Command Format Changes

- **Likelihood:** Low (Adobe CLI is stable)
- **Impact:** Medium (broken operations)
- **Mitigation:** Centralize CLI command construction; version-check CLI compatibility

## Notes

### Why This Refactoring Is Critical

The current auth structure is the #1 source of debugging difficulty:
1. **Stack traces are 10+ frames deep** for simple operations
2. **Finding the actual CLI call** requires tracing through 4+ files
3. **Adding new functionality** requires understanding 7+ service relationships
4. **Testing** requires mocking 7+ dependencies

### Preservation of Functionality

All external-facing functionality must be preserved:
- `isAuthenticated()` - Quick auth check
- `getOrganizations()` - List user's orgs
- `selectOrganization()` - Select active org
- `getProjects()` - List org's projects
- `selectProject()` - Select active project
- `getWorkspaces()` - List project's workspaces
- `selectWorkspace()` - Select active workspace
- `login()` / `logout()` - Auth flow

### SDK Integration

The Adobe Console SDK integration (`adobeSDKClient.ts`) should be evaluated:
- If SDK provides simpler path than CLI, keep SDK wrapper
- If SDK just wraps CLI commands anyway, remove and use CLI directly
- Current state suggests SDK is only used for org list caching

