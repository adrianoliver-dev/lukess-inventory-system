# activeContext.md — lukess-inventory-system (Admin Dashboard)
**Last Updated:** 2026-03-03
**Updated By:** Antigravity Agent

---

## CURRENT BLOCK
- **Block Number:** 11-F
- **Block Name:** Dynamic Attributes (Database Analysis)
- **Status:** DONE
- **Started:** 2026-03-03
- **Completed:** 2026-03-03

---

## LAST COMPLETED BLOCK
- **Block Number:** 11-F
- **Block Name:** Dynamic Attributes (Database Analysis)
- **Completed:** 2026-03-03
- **Commit:** N/A (Analysis only)

---

### Files Modified
- *No files modified in this step. Analysis and documentation only.*
- DB Analysis stored in brain implementation plan artifact.

---

## DATABASE STATE
- **Supabase Project:** lrcggpdgrqltqbxqnjgh (ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6)
- **Total Tables:** 19+
- **Migrations Applied (14):** Created `banners` bucket policies, added `max_uses`, `usage_count` columns to `discount_codes`. Re-applied CREATE TABLE and RLS policies for `banners` and `discount_codes` via MCP (`marketing_rls_fixes`). Applied `marketing_schema_nullability_and_rls` to fix NOT NULL columns and RLS rules for discounts & banners. Fixed `discount_type` missing in insert payload. Applied `update_inventory_allocation_priority` for P1->P2->P3->Bodega cascading logic.
- **Types Regenerated:** Yes (Generated locally via Supabase MCP `generate_typescript_types`).

---

## OPEN ISSUES
- [ ] SECURITY: 10 functions with mutable search_path (flagged by get_advisors): log_inventory_transaction, reserve_order_inventory, handle_order_status_change, cancel_expired_orders, apply_order_allocation, handle_new_user, update_updated_at_column, get_user_org_id, get_user_role, get_user_location_id
- [ ] SECURITY: Overly permissive RLS on: access_requests (INSERT), customers (INSERT/UPDATE), inventory_reservations (ALL), order_items (INSERT), orders (INSERT/UPDATE), subscribers (INSERT)
- [ ] SECURITY: Leaked Password Protection disabled in Supabase Auth
- [ ] TODO: No subscriber management module in sidebar (table `subscribers` exists but no UI)
- [ ] TODO: WhatsApp `pedido_listo_recojo` template must be submitted to Meta Business for approval (pickup path currently uses this name — will be silently dropped if not approved)
- [ ] TODO: is_featured sorting on landing page (lukess-home repo) — not implemented yet
- [ ] TODO: User must push the `marketing_schema.sql` migration to Supabase and regenerate typescript types (From Block 12, though types were regenerated this sprint).

---

## NEXT BLOCK
- **Block:** 11-G (or Phase 2)
- **Name:** Dynamic Attributes (Implementation)
- **Dependencies:** 11-F (Database Analysis) complete ✅
- **Scope:** Awaiting user decision on implementation approach: Option 1 (Relational Tables) or Option 2 (Dynamic RPC based on Inventory).

---

## BLOCK HISTORY
| Block | Name | Status | Date | Commit |
|---|---|---|---|---|
| 1to8 | Fundamentals (Roles to Reports) | ✅ DONE | Feb 2026 | — |
| 9c-A | Inventario: BD + formulario descuentos/is_new | ✅ DONE | 2026-02-27 | 4001f88 |
| 9c-B | Inventario: Upload múltiples imágenes | ✅ DONE | 2026-02-27 | 9a330bc |
| 9c-C | Create form parity + is_featured | ✅ DONE | 2026-02-26 | 5bdab26 |
| 10-E.1| Brand Foundation & Global Constants | ✅ DONE | 2026-02-27 | 100ac34 |
| 10-E.2| Navbar & Footer Redesign | ✅ DONE | 2026-02-27 | 888acdf |
| 10-E.3| Database Structure for Categories & Colors | ✅ DONE | 2026-02-27 | 6aab07d |
| 11-A | Design System Foundation — Zinc/Gold | ✅ DONE | 2026-02-27 | b68d188 |
| 11-B | Layout Shell Rebrand — Login/Sidebar/TopBar | ✅ DONE | 2026-02-27 | ad93be5 |
| 11-C | Dashboard + Inventario Redesign | ✅ DONE | 2026-02-28 | 6492283 |
| 11-D | Orders + Reports Plugins (Monochrome Branding Updates) | ✅ DONE | 2026-02-28 | 6492283 |
| 11-E | POS Rebrand and Order Allocation Bug Fix | ✅ DONE | 2026-02-28 | 6492283 |
| 12 | Marketing CMS (Banners & Discount Codes) | ✅ DONE | 2026-02-28 | 6492283 |
| 13 | BUGFIX SPRINT (Marketing, Allocations, Reports) | ✅ DONE | 2026-02-28 | 7e0ffee |
| 13-C | End-to-End Discount Consumption & Visibility | ✅ DONE | 2026-03-01 | d20fac8 |
| 13-D | End-to-End Discount Visibility (Orders, History, Reports) | ✅ DONE | 2026-03-01 | ff8e0e2 |
| 13-E | Fix missing math fields (Shipping and Discount) | ✅ DONE | 2026-03-01 | 59d6452 |
| 13-F | POS Store Select Fix & Reports Online Discounts | ✅ DONE | 2026-03-01 | 0f5a017 |
| 14-A | POS Stall Selection & Seller Permissions | ✅ DONE | 2026-03-01 | 9741d79 |
| 14-B | Restore Delivery Info in Modal + Discount Idempotency | ✅ DONE | 2026-03-01 | 14f7d56 |
| 15-B | Map WhatsApp Templates to Order Status Changes | ✅ DONE | 2026-03-01 | 2f1d723 |
| 15-C | Pre-Production Root Cleanup | ✅ DONE | 2026-03-03 | 1ad0c99 |
| 16-A | Deep Code Cleanup (Logs & Dead Code) | ✅ DONE | 2026-03-03 | f2007b7 |
| 11-F | Dynamic Attributes (Database Analysis) | ✅ DONE | 2026-03-03 | — |
