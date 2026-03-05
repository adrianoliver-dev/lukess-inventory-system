# systemPatterns.md — lukess-inventory-system

## 1. ARCHITECTURE PATTERNS
- **App Router Exclusive:** Entire application uses Next.js 15 App Router. Pages are inside `app/`.
- **Server-First Data Fetching:** We fetch data directly in Server Components using `supabaseServerClient()`. 
- **Client Components Scoped:** We use `'use client'` only at the leaf nodes (forms, modals, interactive charts) to minimize JS payload.
- **RPC Heavy:** Complex data aggregations (like `get_available_filters_by_category`, cascading stock reservations, dashboard KPIs) are handled natively in PostgreSQL via Supabase RPCs, not computed in JavaScript.

## 2. DESIGN & UI SYSTEM (ZINC/GOLD)
- **Monochrome Foundation:** The system was rebranded to a premium monochrome palette using Tailwind's Zinc scale (bg-zinc-950 for dark, zinc-50 for light).
- **Golden Accents:** Primary interactions and accents use `--color-accent-500` (#c89b6e). Avoid generic primary blue/reds.
- **Card-Based UI:** Forms and lists are wrapped in simple, unshadowed, bordered cards (`border-zinc-200` or `border-zinc-800` in dark mode).
- **Icons:** We exclusively use `lucide-react`.

## 3. STATE MANAGEMENT & MUTATIONS
- **Server Actions:** Form submissions and DB mutations (like creating a product or updating an order) use Next.js Server Actions.
- **Optimistic UI:** When toggling states (like `is_featured`), we update local state immediately while the server action runs in the background.
- **Revalidation:** Always call `revalidatePath('/ruta')` after a successful mutation to ensure the UI updates without requiring page reloads.

## 4. RBAC (ROLE-BASED ACCESS CONTROL)
- **Admin:** Full access to all modules, routes, and reports. Can see all locations.
- **Staff / Manager:** Can manage inventory, view reports, but cannot alter core settings or user roles.
- **Seller (Vendedor):** Restricted heavily. Can only use the POS for their specifically assigned physical stall (Puesto 1, 2, or 3). Read-only access to inventory.

## 5. INVENTORY ALLOCATION LOGIC
The physical stock is split across multiple locations (P1, P2, P3, Bodega).
- **Online Sales (Landing):** Soft-reserved first. When payment is confirmed, the system cascades the deduction: checks if P1 has stock, if not checks P2, etc., until the order is fulfilled.
- **Physical Sales (POS):** Stock is deducted directly from the specific stall where the seller is logged in.

## 6. SECURITY & ERROR HANDLING
- **RLS Policies:** Enforced strictly at the DB level. Even if UI is hidden, users cannot mutate rows they don't own/have roles for.
- **Bypass for Webhooks:** System-level actions (like the Webhook that confirms a payment from the landing) use the `supabaseAdmin` (Service Role) client to bypass RLS safely in server environments.
- **Try/Catch Blocks:** All Server Actions must be wrapped in `try/catch` and return a standardized `{ success: boolean; message: string; error?: any }` object for UI Toast notifications.