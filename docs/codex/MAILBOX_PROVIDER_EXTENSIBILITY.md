# Mailbox Provider Extensibility

## Overview

The Mailbox Platform uses a provider-adapter pattern to isolate provider-specific
logic from the core mailbox platform. Each provider (Gmail, Zoho, etc.) implements
the `IMailboxProviderAdapter` interface defined in `provider-contracts.ts`.

## Adapter Interface

`IMailboxProviderAdapter` (`src/lib/mailbox/provider-contracts.ts`) defines the
boundary between the mailbox platform core and any concrete provider. Every
provider implements the same contract:

- **Descriptor** — identity and capability metadata (`MailboxProviderDescriptor`)
- **Auth lifecycle** — `connect`, `refreshAuthorization`, `verifyConnection`, `disconnect`
- **Sync** — `syncDelta`, `syncDrafts`, `fetchThreadDetail`
- **Search** — `searchThreads`, `searchMessages` (optional, gated by `descriptor.supportsSearch`)
- **Send** — `sendMessage`, `reconcileSend`, `fetchAttachment`
- **Watch** — `renewWatch`
- **Label reconciliation** — `queryThreadIdsByLabel`

## Provider Descriptor

Every adapter exposes a `MailboxProviderDescriptor` with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `MailboxProviderType` | Stable identifier (`"GMAIL"`, `"ZOHO"`) |
| `displayName` | `string` | Human-readable name |
| `supportsPushSync` | `boolean` | Supports push-based sync (vs polling) |
| `supportsSend` | `boolean` | Supports send/reply |
| `supportsSearch` | `boolean` | Supports live API searches |
| `syncCursorType` | `MailboxCursorType` | Cursor type for incremental sync delta |

## Adding a New Provider (e.g., Zoho Mail)

### 1. Create the Adapter

Create a file like `src/lib/mailbox/zoho-provider.ts` that implements
`IMailboxProviderAdapter`:

```typescript
export const zohoProviderAdapter: IMailboxProviderAdapter = {
  descriptor: {
    provider: "ZOHO",
    displayName: "Zoho Mail",
    supportsPushSync: false,
    supportsSend: true,
    supportsSearch: false,
    syncCursorType: "PAGE_TOKEN",
  },
  // ... implement all required methods
};
```

### 2. Register in Provider Registry

In `src/lib/mailbox/provider-registry.ts`, add the adapter to the registry map:

```typescript
import { zohoProviderAdapter } from "./zoho-provider";

const registry: MailboxProviderRegistry = new Map([
  ["GMAIL", gmailProviderAdapter],
  ["ZOHO", zohoProviderAdapter],
]);
```

### 3. Configure Cursor Type

The `syncCursorType` field tells the sync service which cursor type to use when
storing and retrieving sync checkpoints. Common values:
- `"HISTORY_ID"` — Gmail-style history-based cursor
- `"PAGE_TOKEN"` — Page-token-based cursor for paginated APIs

### 4. Configure Push Watch (if supported)

If the provider supports push notifications:
- Set `descriptor.supportsPushSync: true`
- Implement `renewWatch` in the adapter

If not, set `descriptor.supportsPushSync: false`. The sync service will fall
back to polling (periodic delta sync).

### 5. Configure Search (if supported)

If the provider offers a live search API:
- Set `descriptor.supportsSearch: true`
- Implement `searchThreads` and/or `searchMessages` in the adapter

Otherwise, the thread service will search the local database only.

### 6. Folder Coverage (if applicable)

Non-Gmail providers return `[]` from `getRequiredCoverageFolders()`, meaning
no folder coverage tracking is required. The overall coverage state for such
providers is always `COMPLETE`.

### 7. Checklist

- [ ] Adapter file created at `src/lib/mailbox/<provider>-provider.ts`
- [ ] Adapter implements all required `IMailboxProviderAdapter` methods
- [ ] Descriptor includes correct `syncCursorType` and `supportsSearch`
- [ ] Adapter registered in `src/lib/mailbox/provider-registry.ts`
- [ ] OAuth flow implemented (if applicable)
- [ ] Credential store integration for token encryption
- [ ] Push watch mechanism implemented (or `supportsPushSync: false`)
- [ ] Tests added for the new adapter
- [ ] Error mapping implemented (provider errors → `MailboxProviderError`)
