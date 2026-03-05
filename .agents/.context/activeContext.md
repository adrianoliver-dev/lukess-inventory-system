# activeContext.md — lukess-inventory-system (Admin Dashboard & POS)
**Last Updated:** 2026-03-05
**Updated By:** Adrian Oliver (Manual Context Sync)

---

## PROJECT PHASE
**Phase 3: Feature-Complete / Pre-Documentation**
**Status: PRODUCTION READY**
The inventory system and POS are fully operational, including Marketing CMS, complex stock reservations (P1->P2->P3->Bodega), role-based access control (RBAC), and realtime dashboard KPIs. Awaiting final client data load before production handover.

---

## CURRENT BLOCK
- **Block Number:** 16-D-C
- **Block Name:** Agent Architecture Standardization & Sync
- **Status:** IN PROGRESS
- **Started:** 2026-03-05

---

## STACK & VERSIONS
| Layer | Technology | Version / Rule |
|---|---|---|
| Core | Next.js | 15.x (App Router strictly — NO Pages Router) |
| UI Library | React | 19.x (Server Components by default) |
| Language | TypeScript | 5.x strict mode (`any` is banned, strict returns) |
| Styling | Tailwind CSS | v4 (Theme variables in `globals.css`) |
| Backend | Supabase | PostgreSQL 17.6, Auth, Storage, RLS |
| Charts | Recharts | Monochrome Zinc + Gold custom palette |
| Icons | Lucide React | Standardized across all modules |

---

## CRITICAL ENV VARS & INFRASTRUCTURE
```env
NEXT_PUBLIC_SUPABASE_URL=https://lrcggpdgrqltqbxqnjgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[REDACTED]
NEXT_PUBLIC_SITE_URL=https://lukess-inventory-system.vercel.app
Supabase Project: lrcggpdgrqltqbxqnjgh (sa-east-1)
WhatsApp Integration: Hooks into the Meta Business API. Template pedido_listo_recojo is pending approval.

DATABASE STATE & SCHEMAS
Total Tables: 19+ (Products, Categories, Orders, Order_Items, Inventory, Banners, Discount_Codes, Roles, Profiles, etc.)

Types: Generated via supabase gen types typescript to types/database.types.ts.

Complex Triggers:

handle_order_completion: Triggers on status = 'completed'. Decrements real stock and logs sale_items.

reserve_order_inventory: RPC for soft-reserving stock when an online order is placed (Ya Pagé).

Cascading allocation: Checks availability in sequence: P1 → P2 → P3 → Bodega.

Marketing CMS: banners (with desktop/mobile URLs + dates) and discount_codes (with usage tracking and limits).

CRITICAL RULES (LEARNED FROM BUGS)
⛔ RLS Bypass in Server Actions: Admin actions updating orders/notes MUST use supabaseAdmin client, bypassing RLS to avoid permissions blocks on triggers.
⛔ Math & Zero Division: Always guard against division-by-zero crashes when product_cost or totals are 0 (Fix applied on Feb 28).
⛔ Type Parity: Form schemas (Zod) must strictly match DB insert payloads. Missing fields like discount_type caused silent crashes before.
⛔ Nullability in Sales: Online orders often have organization_id = NULL. Triggers must use COALESCE(NEW.organization_id, product.organization_id) to satisfy NOT NULL constraints on sales records.

OPEN ISSUES & SECURITY DEBT
Module	Issue / Description	Priority
Security	10 functions with mutable search_path (flagged by get_advisors, e.g., log_inventory_transaction)	🔴 HIGH
Security	Overly permissive RLS on: access_requests, inventory_reservations	🔴 HIGH
Security	Leaked Password Protection is currently disabled in Supabase Auth	🟡 MED
Marketing	subscribers table exists but there is no UI module to manage them yet	🟡 MED
UI	is_featured toggle exists in admin but isn't sorting the landing page yet	🟢 LOW
LAST COMPLETED BLOCK
Block: 16-C.a.C — Resolve unclosed div in product forms

Completed: 2026-03-04

Commit: 6ce84e0 — fixed UI breakages in product edit/create forms after thumbnail additions.

BLOCK HISTORY (MASSIVE SPRINT LOG)
Block	Name	Status	Date
Block	Name	Status	Date
1 to 8	Core Fundamentals (Roles to Reports)	✅ DONE	Mid-Feb
9c-A	Inventory BD + Discount/is_new form logic	✅ DONE	2026-02-26
9c-B	Inventory: Multiple Image Upload	✅ DONE	2026-02-26
9c-C	Form parity + is_featured UI	✅ DONE	2026-02-26
10-E.1	Brand Foundation & Global Constants	✅ DONE	2026-02-27
10-E.2	Navbar & Footer Redesign	✅ DONE	2026-02-27
10-E.3	Category & Color DB Structure updates	✅ DONE	2026-02-27
11-A	Design System — Zinc/Gold implementation	✅ DONE	2026-02-27
11-B	Layout Shell Rebrand (Sidebar/Topbar)	✅ DONE	2026-02-28
11-C	Dashboard + Inventory Module Redesign	✅ DONE	2026-02-28
11-D	Orders + Reports Monochrome Rebrand	✅ DONE	2026-02-28
11-E	POS Rebrand & Order Allocation Bug Fix	✅ DONE	2026-02-28
12	Marketing CMS (Banners & Discount Codes)	✅ DONE	2026-02-28
13	Bugfix Sprint (Marketing, RLS, Insert constraints)	✅ DONE	2026-02-28
13-C	End-to-End Discount Consumption logic	✅ DONE	2026-03-01
13-D	Discount Visibility in Reports/History	✅ DONE	2026-03-01
13-E	Missing Math Fields Fix (Shipping/Discount)	✅ DONE	2026-03-01
13-F	POS Store Select Fix & Online Discounts aggregate	✅ DONE	2026-03-01
14-A	POS Stall Selection & Seller Permissions	✅ DONE	2026-03-01
14-B	Delivery Info modal restore + Idempotency	✅ DONE	2026-03-01
15-B	Meta WhatsApp Templates to Status mapped	✅ DONE	2026-03-01
15-C	Pre-Production Root Cleanup	✅ DONE	2026-03-03
16-A	Deep Code Cleanup (Logs & Dead Code)	✅ DONE	2026-03-03
11-F	Dynamic Filters DB Analysis & Types	✅ DONE	2026-03-03
11-G/H	RPC get_available_filters_by_category implementation	✅ DONE	2026-03-04
16-C-1	Dashboard + Reportes Critical Fixes	✅ DONE	2026-03-04
16-C-2	Inventory UX Improvements (Brand autocomplete)	✅ DONE	2026-03-04
16-C-3	Marketing + Users Module Fixes	✅ DONE	2026-03-04
16-C-4-A	Enhanced Banner Form + DB Migrations	✅ DONE	2026-03-04
16-C-4-C	Banner Click-to-Edit Modal	✅ DONE	2026-03-04
16-C.a.B	Thumbnail Upload Field for Products	✅ DONE	2026-03-04
16-C.a.C	UI Fixes for Product forms (unclosed div)	✅ DONE	2026-03-04
16-D-C	Memory Bank & Agent Rules Sync (Current)	🔄 IN PROG	2026-03-05
