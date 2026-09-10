
# Stage 2: Offline Engine and Automatic Synchronization

Build durable offline operation into the existing Patrivers Pharmacy web application while preserving Stage 1 outlet behavior and the central backend.

## What staff will get

- A registered-device session that remains usable offline for up to seven days after a successful online authorization.
- Locally cached products, prices, outlet stock, expiry dates, payment types, staff identity, role, and outlet assignment.
- Offline sales with printable receipts, expenses, goods received, and requisitions.
- Every offline write saved locally before success is shown, with its own stable identifier.
- A compact connection panel showing online status, queued items, failures, last successful sync, and manual retry.
- Automatic synchronization after reconnection and after application startup.

## Data safety and synchronization

- Use IndexedDB for persistent local data and the transaction queue, surviving browser closure and device restart.
- Add a service worker only for application files and navigation availability. Transaction durability will not depend on website caching.
- Record device identity, user, outlet, creation time, operation type, retry state, and payload for every queued item.
- Process queue entries individually. Remove an item only after the backend confirms it.
- Reuse stable client identifiers on retries so repeated attempts cannot create duplicate sales or documents.
- Sync stock as movements through existing outlet-aware workflows. Never overwrite stock totals from the client.
- Retain failed items with readable errors and retry controls. Refresh cached catalogue and outlet stock after successful sync.

## Offline authorization

- Initial login, user administration, and permission changes remain online-only.
- Cache a minimal signed-in identity and authorization snapshot after successful online login.
- Permit offline re-entry only on the same registered device and only within seven days.
- Revalidate status, role, and outlet assignment on reconnection. End offline access if the account is revoked, inactive, reassigned, or expired.
- Do not store passwords or administrator secrets locally.

## Workflow integration

- POS will search cached outlet products and save sales locally before showing a receipt.
- Requisitions will support local creation and pending status until synchronized.
- Expenses and purchase documents will use the same durable queue. Goods received will preserve product, batch, expiry, cost, and quantity details.
- Online-only actions such as approvals, permission changes, destructive administration, and catalogue editing will be disabled while offline.
- Existing online behavior remains unchanged when connected.

## Technical details

- Add a typed local database module, sync queue service, connectivity provider, cache hooks, and focused tests.
- Add backend sync RPCs only where existing idempotent operations are insufficient. New public tables or functions will include explicit grants and RLS.
- Keep the interface restrained: sharp borders, compact status information, no decorative gradients, badges, or unnecessary icons.
- Use standard punctuation only. No em dashes in new copy.

## Verification

- Test offline sale and receipt creation, local stock reduction, requisition creation, expense and goods-received queuing.
- Test application restart before sync, interrupted sync, repeated retry, duplicate prevention, and multiple queued stock movements.
- Verify seven-day authorization expiry and permission revalidation after reconnect.
- Run TypeScript checks, focused tests, and the production build.

## Deferred to later stages

- Windows installer and desktop packaging.
- Stock transfer workflow.
- CEO multi-outlet comparisons and synchronization dashboard expansion.
