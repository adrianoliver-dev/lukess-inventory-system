import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/auth";
import { format, startOfMonth, subDays } from "date-fns";
import FiltrosReportes from "@/components/reportes/FiltrosReportes";
import ReportesVentasClient from "./reports-client";

export const metadata = {
  title: "Reportes | Lukess Home",
};

interface SearchParams {
  desde?: string;
  hasta?: string;
  canal?: string;
}

function getDefaultDateRange(): { desde: string; hasta: string } {
  const today = new Date();
  return {
    desde: format(startOfMonth(today), "yyyy-MM-dd"),
    hasta: format(today, "yyyy-MM-dd"),
  };
}

function getPreviousPeriod(desde: string, hasta: string): { desde: string; hasta: string } {
  const start = new Date(desde);
  const end = new Date(hasta);
  const diff = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - diff);
  return {
    desde: format(prevStart, "yyyy-MM-dd"),
    hasta: format(prevEnd, "yyyy-MM-dd"),
  };
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.role === "staff") redirect("/ventas");

  // Resolve date range
  const defaults = getDefaultDateRange();
  const desde = params.desde ?? defaults.desde;
  const hasta = params.hasta ?? defaults.hasta;
  const canalFilter = params.canal ?? "todos";

  const hastaFull = `${hasta}T23:59:59.999Z`;
  const desdeFull = `${desde}T00:00:00.000Z`;

  const prev = getPreviousPeriod(desde, hasta);
  const prevDesdeFull = `${prev.desde}T00:00:00.000Z`;
  const prevHastaFull = `${prev.hasta}T23:59:59.999Z`;

  // ── Completed orders (current period) ─────────────────────────────────────
  let currentQuery = supabase
    .from("orders")
    .select("id, total, subtotal, discount, discount_amount, canal, created_at, status, customer_name")
    .eq("status", "completed")
    .gte("created_at", desdeFull)
    .lte("created_at", hastaFull);

  let currentSalesQuery = supabase
    .from("sales")
    .select("id, total, subtotal, discount, canal, created_at, customer_name")
    .gte("created_at", desdeFull)
    .lte("created_at", hastaFull);

  if (canalFilter !== "todos") {
    currentQuery = currentQuery.eq("canal", canalFilter);
    currentSalesQuery = currentSalesQuery.eq("canal", canalFilter);
  }

  // ── Completed orders (previous period, no canal filter) ───────────────────
  const prevQuery = supabase
    .from("orders")
    .select("id, total, canal, created_at, status")
    .eq("status", "completed")
    .gte("created_at", prevDesdeFull)
    .lte("created_at", prevHastaFull);

  const prevSalesQuery = supabase
    .from("sales")
    .select("id, total, canal, created_at")
    .gte("created_at", prevDesdeFull)
    .lte("created_at", prevHastaFull);

  // ── All-status orders (for cancellation rate) ─────────────────────────────
  let allStatusQuery = supabase
    .from("orders")
    .select("id, status")
    .gte("created_at", desdeFull)
    .lte("created_at", hastaFull);

  let allStatusSalesQuery = supabase
    .from("sales")
    .select("id, canal")
    .gte("created_at", desdeFull)
    .lte("created_at", hastaFull);

  if (canalFilter !== "todos") {
    allStatusQuery = allStatusQuery.eq("canal", canalFilter);
    allStatusSalesQuery = allStatusSalesQuery.eq("canal", canalFilter);
  }

  // ── Inventory items with product info ─────────────────────────────────────
  const inventoryQuery = supabase
    .from("inventory")
    .select("product_id, quantity, min_stock, products!inner(id, name, sku)");

  // ── Products sold in last 60 days (dead stock detection) ──────────────────
  const sixtyDaysAgo = `${format(subDays(new Date(), 60), "yyyy-MM-dd")}T00:00:00.000Z`;
  const recentSalesQuery = supabase
    .from("order_items")
    .select("product_id")
    .gte("created_at", sixtyDaysAgo);

  const recentPosSalesQuery = supabase
    .from("sale_items")
    .select("product_id")
    .gte("created_at", sixtyDaysAgo);

  // ── Run all independent queries in parallel ────────────────────────────────
  const [
    { data: currentOrdersRaw },
    { data: currentSalesRaw },
    { data: prevOrdersRaw },
    { data: prevSalesRaw },
    { data: allStatusOrdersRaw },
    { data: allStatusSalesRaw },
    { data: inventoryItemsRaw },
    { data: recentSalesRaw },
    { data: recentPosSalesRaw },
  ] = await Promise.all([
    currentQuery,
    currentSalesQuery,
    prevQuery,
    prevSalesQuery,
    allStatusQuery,
    allStatusSalesQuery,
    inventoryQuery,
    recentSalesQuery,
    recentPosSalesQuery,
  ]);

  // Combine Orders + Sales (Mapping sales to have status="completed")
  // Filter out online orders from sales table to prevent double-counting
  // Online orders are auto-copied to sales when completed, so we only want POS sales here
  const currentSalesMapped = (currentSalesRaw ?? [])
    .filter((s) => s.canal === 'fisico')
    .map((s) => ({ ...s, status: 'completed' }));

  const prevSalesMapped = (prevSalesRaw ?? [])
    .filter((s) => s.canal === 'fisico')
    .map((s) => ({ ...s, status: 'completed' }));

  const allStatusSalesMapped = (allStatusSalesRaw ?? [])
    .filter((s) => s.canal === 'fisico')
    .map((s) => ({ ...s, status: 'completed' }));

  const currentOrders = [...(currentOrdersRaw ?? []), ...currentSalesMapped];
  const prevOrders = [...(prevOrdersRaw ?? []), ...prevSalesMapped];
  const allStatusOrders = [...(allStatusOrdersRaw ?? []), ...allStatusSalesMapped];

  // ── Order items & Sale Items (depends on current IDs) ──────────────────────
  const orderIds = (currentOrdersRaw ?? []).map((o) => o.id);
  const salesIds = (currentSalesRaw ?? []).map((s) => s.id);

  const [
    { data: orderItemsRaw },
    { data: saleItemsRaw }
  ] = await Promise.all([
    orderIds.length > 0
      ? supabase
        .from("order_items")
        .select("product_id, quantity, subtotal, order_id, products(id, name, category_id, categories(name))")
        .in("order_id", orderIds)
      : Promise.resolve({ data: [] }),
    salesIds.length > 0
      ? supabase
        .from("sale_items")
        .select("product_id, quantity, subtotal, sale_id, products(id, name, category_id, categories(name))")
        .in("sale_id", salesIds)
      : Promise.resolve({ data: [] })
  ]);

  const orderMap = new Map((currentOrdersRaw ?? []).map((o) => [o.id, o]));
  const saleMap = new Map((currentSalesRaw ?? []).map((s) => [s.id, s]));

  const combinedItems = [
    ...(orderItemsRaw ?? []).map((item) => {
      const order = orderMap.get(item.order_id);
      let net_subtotal = item.subtotal;
      if (order && order.subtotal > 0 && order.total < order.subtotal) {
        const ratio = order.total / order.subtotal;
        net_subtotal = item.subtotal * ratio;
      }
      return { ...item, net_subtotal };
    }),
    ...(saleItemsRaw ?? []).map((item) => {
      const sale = saleMap.get(item.sale_id);
      let net_subtotal = item.subtotal;
      if (sale && sale.subtotal > 0 && sale.total < sale.subtotal) {
        const ratio = sale.total / sale.subtotal;
        net_subtotal = item.subtotal * ratio;
      }
      return { ...item, net_subtotal };
    }),
  ];

  // Deduplicate recently sold product IDs
  const recentlySoldProductIds = [
    ...new Set([
      ...(recentSalesRaw ?? []).map((r) => r.product_id as string),
      ...(recentPosSalesRaw ?? []).map((r) => r.product_id as string),
    ]),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ventas online vs físico · pedidos completados
          </p>
        </div>
      </div>

      {/* Filtros (Client Component) */}
      <FiltrosReportes
        desdeActual={desde}
        hastaActual={hasta}
        canalActual={canalFilter}
      />

      {/* Charts + KPIs (Client Component) */}
      <ReportesVentasClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orders={currentOrders as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prevOrders={prevOrders as any}
        allStatusOrders={allStatusOrders}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orderItems={combinedItems as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inventoryItems={(inventoryItemsRaw ?? []) as any}
        recentlySoldProductIds={recentlySoldProductIds}
        desde={desde}
        hasta={hasta}
        canalFilter={canalFilter}
      />
    </div>
  );
}
