# Simplify Pharmacy Project — Task Roadmap

## Removals
- [ ] HR & payroll (salaries, overtime, deductions, staff schedules, overrides) — page HR.tsx, nav, route
- [ ] Attendance (MyAttendance, auto check-in/out in useAuth)
- [ ] Shift management (Shifts page, MyShift, LiveShiftMonitor, ShiftItemsDialog, start_shift/end_shift/get_active_shift in useAuth, sidebar widgets)
- [ ] Inventory count forms (blind/audit/month-end, countControlForm.ts)
- [ ] Prescriptions (page, POS linking, pending queries, dashboard counter)
- [ ] AI symptom checker (SymptomChecker + symptom-checker function)
- [ ] AI drug indication (get-indication, BulkIndicationDialog, auto-fill on product save, caching)
- [ ] Invoice scanning (ScanInvoiceDialog + scan-invoice function + config entry)
- [ ] Login camera capture (captureLoginPhoto + callers)
- [ ] Rankings/insights/payroll reports (customer/staff rankings, insights, payroll reports)

## Shared workflow changes
- [ ] Require manual UOM selection; remove AI selection + Tablet fallback
- [ ] Remove payroll from document creation types
- [ ] Remove salary/bonus/deduction fields + payroll calc (keep history readable)
- [ ] Remove AI success messages from product saving
- [ ] Remove symptom-checker/get-indication/scan-invoice source functions
- [ ] Remove scan-invoice config entry
- [ ] Remove report queries/rendering for removed reports

## Preserve
- [ ] DB tables/records/migrations/types intact (no deletes)
- [ ] Expiry tracking end-to-end
- [ ] Requisitions, POS/My Sales, Inventory/Price list/Stock/StockByDate/GoodsReceived, Expenses/Payments, core reports, CEO dashboard
- [ ] Staff accounts/roles/passwords/OTP/audit
- [ ] Manual product indication text

## Infra
- [ ] Pin @supabase/supabase-js 2.100.1, repair package-lock, use npm
- [ ] TS check + production build
- [ ] Verify homepage/login, sales, manual product save, expiry, requisitions, goods received, retained reports
- [ ] Check broken imports / dangling links

# Patrivers Desktop/Offline Programme (multi-stage)
Decisions: outlets created by admin in-app (no invented names); existing records -> first outlet created; offline access window 7 days.
## Public site refresh
- [x] Rebuild homepage from supplied pharmaceutical reference with a violet-led palette and restrained health green
- [x] Add a custom pharmacy-care banner image and scalable branch listing
- [x] Add Assin Praso, Twifo Hemang, and Assin Bereku without inventing addresses
## Stage 1 (current): Rebrand + outlets + backend groundwork
- [x] Rebrand Jostin -> Patrivers (text brand mark, homepage, login, sidebar, receipts, prints, metadata, settings row)
- [x] outlets table + admin Outlets screen (name, code, address, phone)
- [x] outlet_id on profiles(staff assignment), sales, documents, stock_movements, requisitions, payments
- [x] outlet_stock per-outlet quantities; products.qty stays as total
- [x] client_id idempotency keys on sales/documents/stock_movements; devices table; sync_conflicts table
- [x] assign existing records to first outlet (function + "needs outlet" indicator)
- [x] process_sale/confirm_document outlet + idempotency aware
- [x] cross-outlet availability search with last-updated time
- [x] typecheck + build (verified with empty DB self-test; no user accounts exist yet for signed-in UI checks)
Notes: no auth users exist in this remixed backend — admin must create the first account before UI verification. Edge functions not redeployed (login-otp email template rename pending deploy).
## Stage 2: Offline engine (local DB, queue, sync status bar, offline device session 7d)
- [x] Durable IndexedDB queue for sales, requisitions, expenses, and goods received
- [x] Cached outlet products, prices, quantities, expiry dates, payment/document types, and availability searches
- [x] Save locally before success, stable transaction IDs, automatic reconnect sync, retained failures, manual retry
- [x] Seven-day registered-device authorization with PBKDF2 password verifier and online revocation/outlet revalidation
- [x] Connection, pending, failed, and last-sync status in the application header
- [x] Production service worker and installable web manifest for shell availability
- [x] TypeScript check, IndexedDB durability tests, unit tests, and production build
Notes: browser-level authenticated offline scenarios remain untested because this remixed backend has no user accounts. Browser storage is durable but cannot provide desktop-grade encryption at rest; encrypted desktop storage belongs to Stage 3. The project-wide Supabase security linter still reports 103 pre-existing and current warnings requiring a dedicated hardening pass. Desktop OS packaging is Stage 3.
## Stage 3: Windows desktop packaging (Electron)
## Stage 4: Transfers workflow (request→approve→dispatch→confirm, in-transit)
## Stage 5: CEO multi-outlet dashboard (filters, trends, sync staleness, cost-based profit)
- [x] CEO-only /ceo overview: revenue, cost of goods, gross and net profit, per-branch table, 7-day stacked revenue, reorder list, pending requisitions
- [x] CEO-only /ceo/stock: every drug by branch, low/out highlighting, branch filter, reorder files a requisition against that branch
- [x] CEO default route moved off the admin dashboard; role guard on /ceo and /dashboard

## Authentication fixes
- [x] Collect and submit the current password when a signed-in user is forced to choose a new password
- [x] Allow CEOs to create staff and CEO accounts while protecting the reserved System Admin account
- [x] Allow the protected System Admin to reset only their own password and reset all other users
- [x] Preserve and restore the active session when a forced password change revokes it
- [x] Normalize usernames before online and offline sign-in
- [x] Require and save a branch when creating cashier and pharmacist accounts

## Interface consistency
- [x] Replace system loading spinners and plain data-loading messages with skeleton placeholders

# Production hardening pass (security + performance)
- [ ] DB: scope sale_items/document_items/stock_transfers/shift_handovers reads; protect profile columns; restrict product writes; lock down RPC grants; harden process_sale; indexes
- [ ] Edge functions: manage-documents ownership checks, create-user password policy, constant-time key compare, OTP send cooldown, generic errors; deploy
- [ ] Frontend: route code-splitting, lazy xlsx, RequireRole on all staff routes, logout wipes local caches, SW cache cleanup, CSP meta, username->synthetic email (no anon lookup), periodic revalidation
- [ ] Perf: baseline vs after (JS bytes, requests, LCP/CLS lab)
- [ ] Verify: anon/staff/admin direct API tests, login/logout/password change, mobile layouts; rerun scans
- [ ] Report
