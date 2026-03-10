# Lukess Inventory System — POS & Inventory Management

A custom internal management platform for a multi-location retail clothing business.
Built as a solo project alongside the Lukess Home e-commerce platform.

> ⚠️ This is a private internal tool. The demo credentials are read-only.

🔗 **Live Demo:** [lukess-inventory-system.vercel.app](https://lukess-inventory-system.vercel.app)

## Features

- **POS (Point of Sale)** with product search and quick sale flow
- **Inventory management** across 3 physical locations
- **RBAC** — Admin, Manager, and Staff roles with granular permissions
- **Real-time notifications** via Supabase Realtime
- **Order management** with status tracking and fulfillment flow
- **Sales reports** with filters by date, location, and product
- **Low stock alerts** with configurable thresholds
- Mobile-optimized dashboard

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + RBAC |
| Realtime | Supabase Realtime |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |

## Architecture

- **14-table PostgreSQL schema** with foreign keys and RLS policies per role
- **Server Actions** for all mutations (sales, stock updates, order status)
- **Role-based middleware** protecting dashboard routes
- **Optimistic updates** on POS sales flow for instant UX

## Getting Started

```bash
git clone https://github.com/adrianoliver-dev/lukess-inventory-system
cd lukess-inventory-system
npm install
cp .env.example .env.local
# Fill in your Supabase credentials
npm run dev
Environment Variables
text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
Developer
Adrian Oliver · adrianoliver.dev · Santa Cruz de la Sierra, Bolivia

