# PatrIvers Pharmacy



> Build a complete **Retail Pharmacy Management System** called **"Patrivers"** using React, Tailwind CSS and Supabase.
>
> ---
>
> ## 🎨 Design system:
> - Color palette: Deep blue `#1E3A5F` primary, white surfaces, green `#22C55E` accents
> - Clean, flat, medical-grade UI — no gradients, no heavy shadows
> - Sidebar layout — fixed left sidebar with icons and labels
> - Fully responsive — works on desktop, tablet and any modern browser
> - Sentence case everywhere — no ALL CAPS labels
> - Role-based sidebar — each role sees only their permitted modules
> - System name **"Jostin Pharmacy"** appears on: login page, sidebar header, dashboard, receipts, reports, PDF exports, browser tab title and the About section in Settings
>
> ---
>
> ## 👤 Authentication & roles:
>
> Four roles with strict access control:
> - **System Admin** — full access to everything
> - **CEO** — full view access, no editing of system settings
> - **Pharmacist** — operational access
> - **Cashier** — POS and limited reports only
>
> - Login page with email + password via Supabase Auth
> - Force password change on first login
> - Session timeout — auto logout after 30 minutes idle (configurable in Settings)
> - Login activity logged to `login_log` table
> - After login redirect each role to their appropriate default page:
>   - Cashier and Pharmacist → POS / Sales
>   - Admin and CEO → Dashboard
>
> ---
>
> ## 🖥️ MODULE 1 — POS / Sales (default landing page for Cashier and Pharmacist)
>
> **Layout:** Left panel 60% — Right panel 40%
>
> **Left panel:**
> - Autofocused smart search bar — search by product name or SKU
> - Category filter pills — All, Antibiotics, Vitamins, Analgesics, Antifungals, etc.
> - Collapsible **Symptom checker** box below filter pills:
>   - Free text input for patient symptom description in natural language
>   - Examples: *"my body is hot and my head is pounding"*, *"stomach pain after eating, feeling bloated"*
>   - On submit: calls Anthropic Claude API (`claude-sonnet-4-20250514`) with:
>     - System prompt: *"You are a pharmaceutical assistant for a licensed retail pharmacy in Ghana called Jostin Pharmacy. You will be given a patient's symptom description and a list of available drugs in the pharmacy inventory with their indications. Suggest the most appropriate drugs from the inventory list based on the symptoms described. Rank them by relevance. For each suggestion provide: drug name, why it is appropriate in one short sentence, and any important caution. Only suggest drugs that are in the provided inventory list. Never suggest drugs not in the inventory. Always add: Final dispensing decision must be made by a licensed pharmacist."*
>     - Dynamically injected inventory list from Supabase — product name, indication, category, qty
>     - Patient symptom description typed by cashier or pharmacist
>   - Returns ranked drug suggestions — only shows drugs where qty > 0
>   - Each suggestion shows: drug name, category badge, why suggested, qty, selling price, caution note, "Add to cart" button
>   - Disclaimer below every result: *"AI suggestions are based on common indications only. Final dispensing decision must be made by a licensed pharmacist."*
>   - Cache inventory list for 5 minutes to avoid repeated Supabase calls
>   - Every symptom query logged to `symptom_log` table
> - Product grid below symptom checker — cards showing: name, SKU, selling price, qty, category badge
> - Out of stock items = grayed out and non-selectable
> - Low stock items = amber warning badge
> - Clicking a product card adds it to cart instantly
>
> **Right panel:**
> - Customer / patient search field at top — or Walk-in as default
> - Cart item list — each row: Product | Qty (editable inline) | Unit price | Discount | Line total | Remove
> - Discount per item — enter as % or fixed amount
> - Cart summary: Subtotal, Total discount, VAT (if enabled in Settings), Grand total (large and prominent)
> - Action buttons: `Charge`, `Hold sale`, `New sale`, `Link prescription`
>
> **Drug substitution:**
> - When a low or out of stock item is added, popup suggests alternatives from same category
> - User can swap item or keep original
> - Substitution logged on the invoice
>
> **Hold / park a sale:**
> - Parks current cart with reference number and timestamp
> - `Parked sales` counter button in top bar showing count e.g. `Parked: 2`
> - Modal lists all parked sales: Ref | Customer | Items | Total | Parked at | Resume | Delete
> - Resuming loads cart back instantly
> - Parked sales do not affect stock until completed
>
> **Prescription linkage:**
> - Search by patient name or prescription number
> - Auto-populates cart with prescribed drugs and quantities
> - Invoice stamped with prescription reference number
> - Prescription status auto-updates to "Dispensed" in Prescriptions module
>
> **Payment modal (triggered by Charge button):**
> - Grand total displayed prominently at top
> - Active payment types shown: Cash, Mobile Money (from Payment Types module)
> - Split payment toggle — user enters amount per payment type, system validates total equals grand total
> - Amount tendered input — change due auto-calculated and shown in large green text
> - Invoice notes free text field
> - `Confirm & print receipt` button
> - On confirm:
>   - Stock quantities deducted from Supabase instantly
>   - Invoice posted to Documents module as a Sales document
>   - Thermal receipt generated and print dialog triggered automatically
>   - Cart clears and system returns to fresh POS
>
> **Top bar of POS:**
> - Live clock and date
> - Logged-in user name and role badge
> - `Parked sales` counter button
> - `Reprint last receipt` button
> - `Refund` button — search invoice, select items, process refund, posts Refund document
> - `Proforma` button — creates proforma invoice without deducting stock
>
> **Access:**
> - Cashier — full POS, discounts capped at 10% without Admin approval
> - Pharmacist — full POS, can approve discounts, link prescriptions
> - Admin — full access including refunds and voids
> - CEO — view only
>
> ---
>
> ## 🖨️ Thermal receipt printing:
>
> Primary receipt output is a **thermal POS printer** — 80mm thermal default.
>
> **Print implementation:**
> - Use browser native `window.print()` with thermal-specific CSS print stylesheet
> - Receipt renders in a hidden `

` visible only during print
> - Print stylesheet: `@page { size: 80mm auto; margin: 0; }`
> - Font: monospace for clean column alignment on thermal paper
> - No logo on thermal by default — toggle in Settings to enable
> - Auto-triggers print dialog after `Confirm & print receipt`
> - Compatible with: Epson TM-T20, Xprinter XP-58, 80mm generic USB thermal printers
>
> **Thermal receipt layout:**
> ```
> ================================
>         JOSTIN PHARMACY
>         [Address line 1]
>         [City, Region]
>         Tel: [Phone number]
> ================================
>           SALES RECEIPT
>   Invoice No: INV-00042
>   Date: 27/03/2026   Time: 10:45 AM
>   Cashier: [Staff name]
> --------------------------------
> ITEM           QTY  PRICE   TOTAL
> --------------------------------
> Amoxicillin     2    7.50   15.00
> Paracetamol     3    1.50    4.50
> Vitamin C       1    6.00    6.00
> --------------------------------
> Subtotal:              GH₵ 25.50
> Discount:              GH₵  0.00
> VAT:                   GH₵  0.00
> ================================
> TOTAL:                 GH₵ 25.50
> ================================
> Payment: Cash
> Tendered:              GH₵ 30.00
> Change:                GH₵  4.50
> --------------------------------
> [Invoice notes if any]
>
>     Thank you for your patronage!
>        Jostin Pharmacy cares.
> ================================
> ```
>
> **Reprint:** available on every completed invoice in Invoice list and Documents module
>
> ---
>
> ## 📊 MODULE 2 — Dashboard
>
> - Summary cards: Total products, Low stock alerts, Today's sales total, Pending prescriptions, Negative stock items
> - Line chart — daily sales trend for current month
> - Recent sales table — last 10 transactions with invoice number, customer, cashier, total, payment type
> - Low stock alert list — all items at or below reorder level
> - Expiry alerts — items expiring within 30 days
> - All data pulled live from Supabase
>
> ---
>
> ## 📦 MODULE 3 — Inventory
>
> - Product list: name, category, qty, reorder level, expiry date, supplier, batch number
> - Add / edit product modal with all fields
> - Expiry color alerts — red if expired, amber if expiring within 30 days
> - Low stock alert — triggers when qty hits reorder level
> - Batch number and supplier tracking
> - Admin and Pharmacist only
>
> ---
>
> ## 💰 MODULE 4 — Price List
>
> - Table: Product | Category | Cost price | Selling price | Margin % | Last updated | Action
> - Inline edit — Edit button turns selling price into an input field, Save to confirm
> - Margin % auto-calculates live — green ≥ 30%, amber 15–29%, red < 15%
> - Bulk update modal — select category or all products, increase or decrease by % or fixed amount, preview affected rows before confirming
> - Price changes sync immediately to POS and Stock modules
> - Admin and Pharmacist only — Cashier cannot see this page
>
> ---
>
> ## 📋 MODULE 5 — Stock
>
> - Table: SKU | Product name | Qty | UOM | Cost price | Sales price | Actions
> - SKU format: `PHM-XXXX` auto-generated
> - UOM options: Tablet, Capsule, Bottle, Sachet, Vial, Strip, Box
> - Toggle buttons (mutually exclusive, one active at a time):
>   `Negative quantity` | `Non-zero quantity` | `Zero quantity`
>   - Negative qty rows = red highlight
>   - Zero qty rows = amber highlight
>   - Default = all items shown
> - Product count indicator inline with toggles: `Product count: 348` — updates live
> - Summary cards: Total SKUs, Total items in stock, Low stock, Out of stock, Negative stock
> - Action toolbar: `Refresh` | `Stock history` | `Print` | `Export Excel` | `Quick inventory`
> - Stock history modal:
>   - Select one product, multiple products, or all
>   - Date range filter
>   - Columns: Date | SKU | Product | Opening qty | Change | Closing qty | Action type | Document ref | User
>   - Action type badge: Purchase, Sale, Return, Adjustment, Damage, Loss, Inventory Count
>   - Export PDF or Excel
> - Quick inventory modal:
>   - Lists products with: SKU | Product | System qty | Physical count input | Difference (auto-calculated live)
>   - Difference = green if positive, red if negative, gray if zero
>   - On confirm: posts Inventory Count document to Documents module with timestamp and user
> - Add/Edit modal: SKU (auto, read-only), name, category, qty, UOM, cost price, sales price, reorder level, expiry date, supplier
>
> ---
>
> ## 📄 MODULE 6 — Documents
>
> Central transaction and audit log for all activity across the system.
>
> **Document categories and sub-types:**
> - Expenses → Purchases, Stock Return
> - Sales → Sales, Refund, Proforma
> - Inventory → Inventory Count
> - Loss → Loss, Damage
>
> **Filter bar:** Product | Customer | Document number | User | Document type | Period (date range)
>
> **Table columns:** Doc No. | Type | Sub-type | Product | Customer | User | Date | Amount | Status
>
> - Status badge: Posted, Draft, Voided
> - Category color badges: Expenses = red, Sales = teal, Inventory = blue, Loss = amber
> - Clicking a row opens full transaction detail view
> - Reprint button on every Sales document row
> - Export: PDF and CSV
> - All system transactions auto-post here — POS sales, refunds, stock adjustments, inventory counts, losses
>
> ---
>
> ## 💊 MODULE 7 — Prescriptions
>
> - Digital prescription intake form: patient name, doctor name, date, prescribed drugs and quantities
> - Dispensing workflow — pharmacist reviews, dispenses, signs off
> - Refill tracking — flag prescriptions due for refill
> - Status badges: Pending, Dispensed, Partial, Cancelled
> - Links to POS — dispensing auto-populates cart and posts Sales document on completion
> - Pharmacist sign-off required before dispensing
>
> ---
>
> ## 📈 MODULE 8 — Reports
>
> Left sub-menu + right panel layout.
> Every report has: date range presets (Today, Yesterday, This week, This month, Last month, Custom), Generate button, Print, Export PDF, Export Excel. All reports show summary totals at bottom. Empty state shown if no data.
>
> **11 reports:**
>
> 1. **Products** — qty sold, revenue, cost, profit, margin % per product. Sort by best selling, highest profit, highest revenue
> 2. **Product groups** — revenue and profit grouped by category + bar chart
> 3. **Customers** — transactions, total purchased, balance due per customer. Amber highlight for unpaid balances
> 4. **Users** — sales performance per staff: transactions, total sales, refunds processed, net sales
> 5. **Item list** — every single line item sold across all invoices in period
> 6. **Payment types** — breakdown by Cash and MoMo + pie/donut chart of payment split
> 7. **Invoice list** — all invoices with status badges (Paid, Unpaid, Refunded, Proforma), clickable rows open full receipt
> 8. **Daily sales** — day by day totals + line chart trend, summary row at bottom
> 9. **Profit margin** — revenue, cost, profit, margin % with color coding: green ≥ 30%, amber 15–29%, red < 15%
> 10. **Unpaid sales** — outstanding invoices: red if > 30 days overdue, amber if 7–30 days. Mark as paid action (Admin only)
> 11. **Stock movement** — full stock in/out log: Date | SKU | Product | Opening qty | In | Out | Closing qty | Movement type | Document ref | User. Movement type badge: Purchase, Sale, Return, Adjustment, Damage, Loss, Inventory Count
>
> **Access:**
> - Admin — all 11 reports
> - CEO — all 11 reports
> - Pharmacist — all except Users report
> - Cashier — Daily sales and Invoice list only
>
> ---
>
> ## 👥 MODULE 9 — Users & Security
>
> - Summary cards: Total users, Active, Inactive, Roles assigned
> - User table: Full name | Email | Role | Status | Last login | Date created | Actions
> - Status badge: Active (green), Inactive (gray), Suspended (red)
> - Actions per row: Edit, Suspend, Reset password, Deactivate
> - Add user modal: full name, email, phone, role dropdown, status, auto-generated password, optional photo upload
> - No user deletion — deactivate only (preserves full audit trail)
> - Suspend = kills active session immediately
> - A user cannot change their own role
> - CEO cannot be edited by anyone except System Admin
>
> **Role permission matrix — visible as a read-only table in UI:**
>
> | Module | System Admin | CEO | Pharmacist | Cashier |
> |---|---|---|---|---|
> | POS / Sales | Full | None | Full | Full |
> | Dashboard | Full | Full | Full | Limited |
> | Inventory | Full | View | Full | None |
> | Price List | Full | View | Edit | None |
> | Stock | Full | View | Full | View |
> | Documents | Full | View | View | None |
> | Prescriptions | Full | View | Full | None |
> | Reports | Full | Full | Partial | Limited |
> | Users & Security | Full | None | None | None |
> | Payment Types | Full | None | None | None |
> | Settings | Full | None | None | None |
>
> **Activity log tab:**
> - All system actions by all users
> - Columns: Timestamp | User | Role | Action | Module | Document ref | IP address
> - Filter by user, role, module, date range
> - Export PDF or Excel
> - System Admin and CEO only
>
> **Security:**
> - Force password change on first login
> - Session timeout configurable in Settings
> - Password reset via Supabase Auth email
>
> ---
>
> ## 💳 MODULE 10 — Payment Types
>
> - Default types pre-loaded: Cash (CASH), Mobile Money (MOMO)
> - Table: Payment type | Code | Description | Status | Date added | Actions
> - Active/inactive toggle — deactivating hides payment type from POS immediately
> - Add/edit modal: name, code, description, status toggle, MoMo provider dropdown (MTN, Vodafone Cash, AirtelTigo Money), reference number format
> - Feeds directly into POS checkout screen and Payment types report
> - System Admin only
>
> ---
>
> ## ⚙️ MODULE 11 — Settings
>
> Left sub-menu with 6 sections. Save changes button on every section.
>
> **Section 1 — Company profile:**
> Name, tagline, registration number, tax/VAT number, email, phone primary, phone secondary, website, street address, city, region, country
> Pre-fill: company name = `Jostin Pharmacy`
>
> **Section 2 — Logo & branding:**
> Logo upload (PNG/JPG/SVG max 2MB), drag and drop supported, live logo preview, favicon upload, brand primary color picker, brand secondary color picker, receipt header color picker, live receipt preview card showing logo and colors
>
> **Section 3 — Receipt settings:**
> Receipt title, show logo on receipt toggle, show tagline toggle, footer message (default: *"Thank you for your patronage! Jostin Pharmacy cares."*), show pharmacist name toggle, show prescription number toggle, paper size dropdown (default: 80mm thermal, options: A4, A5, 58mm, 80mm), show logo on thermal toggle (off by default), receipt copies (default: 1), auto-print on sale complete toggle (on by default), reprint last receipt button, live receipt preview panel updating in real time
>
> **Section 4 — System preferences:**
> Currency (default: GH₵), currency symbol position (before/after), date format (DD/MM/YYYY default), time format (12hr/24hr), default UOM, low stock alert threshold (default: 10), session timeout (default: 30 mins), dark mode toggle
>
> **Section 5 — Notifications:**
> Low stock alert toggle, expiry alert toggle + days before (default: 30), daily sales summary toggle (sent to Admin and CEO), unpaid invoice reminder toggle + frequency (daily/weekly). Delivery: in-app only
>
> **Section 6 — About system:**
> System name: Jostin Pharmacy, version number, built by, last updated date, Contact support button
>
> ---
>
> ## 🗄️ Complete Supabase schema:
>
> ```sql
> profiles (id, full_name, email, phone, role, status, avatar_url, last_login, created_at)
>
> products (id, name, category, indication, qty, reorder_level, uom, cost_price, sales_price, expiry_date, supplier_id, batch_number, created_at)
>
> stock (id, sku, product_id, quantity, uom, cost_price, sales_price, reorder_level, expiry_date, supplier_id, created_at, updated_at)
>
> price_list (id, product_id, cost_price, selling_price, price_tier, margin_percent, updated_by, updated_at)
>
> sales (id, invoice_number, cashier_id, customer_id, subtotal, discount, tax, total, payment_method, status, notes, prescription_id, created_at)
>
> sale_items (id, sale_id, product_id, quantity, unit_price, discount, line_total)
>
> prescriptions (id, patient_name, doctor_name, pharmacist_id, status, items, created_at)
>
> documents (id, doc_number, category, sub_type, product_id, customer_name, user_id, amount, status, notes, period_date, created_at)
>
> payment_types (id, name, code, description, provider, reference_format, is_active, created_at)
>
> parked_sales (id, reference, cashier_id, customer_id, cart_items, total, created_at)
>
> symptoms (id, symptom_name, aliases, created_at)
>
> symptom_product_map (id, symptom_id, product_id, priority_rank, indication_note, created_at)
>
> symptom_log (id, cashier_id, symptom_description, suggestions_returned, products_added_to_cart, created_at)
>
> activity_log (id, user_id, action, module, document_ref, ip_address, created_at)
>
> login_log (id, user_id, status, ip_address, attempted_at)
>
> company_settings (id, company_name, tagline, reg_number, tax_number, email, phone_primary, phone_secondary, website, address, city, region, country, logo_url, favicon_url, brand_primary_color, brand_secondary_color, receipt_header_color, receipt_title, receipt_footer, show_logo_on_receipt, show_tagline_on_receipt, show_pharmacist_on_receipt, receipt_paper_size, auto_print, receipt_copies, show_logo_on_thermal, currency, currency_position, date_format, time_format, default_uom, low_stock_threshold, session_timeout, dark_mode, created_at, updated_at)
> ```
>
> ---
>
> ## 🔑 Complete sidebar — role based visibility:
>
> | Module | System Admin | CEO | Pharmacist | Cashier |
> |---|---|---|---|---|
> | POS / Sales | ✅ | — | ✅ | ✅ |
> | Dashboard | ✅ | ✅ | ✅ | ✅ |
> | Inventory | ✅ | 👁️ | ✅ | — |
> | Price List | ✅ | 👁️ | ✅ | — |
> | Stock | ✅ | 👁️ | ✅ | 👁️ |
> | Documents | ✅ | 👁️ | 👁️ | — |
> | Prescriptions | ✅ | 👁️ | ✅ | — |
> | Reports | ✅ | ✅ | 🔶 | 🔶 |
> | Users & Security | ✅ | — | — | — |
> | Payment Types | ✅ | — | — | — |
> | Settings | ✅ | — | — | — |
>
> ✅ Full access &nbsp;&nbsp; 👁️ View only &nbsp;&nbsp; 🔶 Partial &nbsp;&nbsp; — No access
>
> ---
>
> ## ⚡ Performance requirements:
> - Product search returns results in under 300ms
> - Adding a product to cart is instantaneous
> - Smooth performance with 500+ products in the grid
> - No full page reloads on any POS action — everything real time
> - Supabase real time subscriptions on stock qty, parked sales and notifications
> - AI symptom checker streams response from Claude API for fast feel
> - Inventory list for AI cached for 5 minutes

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://patrivers.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bce19dcc-c28d-48b0-9614-04fb93c3c347).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
