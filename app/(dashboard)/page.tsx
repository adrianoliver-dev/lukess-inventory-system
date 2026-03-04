import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/auth";
import StatsCard from "@/components/dashboard/StatsCard";
import {
  Package,
  Boxes,
  TrendingUp,
  AlertTriangle,
  TrendingDown,
  CreditCard,
  Banknote,
  QrCode,
  ShoppingBag,
  Globe,
  Store,
  Lock,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/Badge";

const LOW_STOCK_THRESHOLD = 10;

const paymentIcons: Record<string, typeof CreditCard> = {
  cash: Banknote,
  qr: QrCode,
  card: CreditCard,
};

const paymentLabels: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
};

const paymentColors: Record<string, string> = {
  cash: "bg-green-100 text-green-800",
  qr: "bg-blue-100 text-blue-800",
  card: "bg-purple-100 text-purple-800",
};

// Helper para formatear números con separadores de miles
function formatNumber(num: number): string {
  return new Intl.NumberFormat("es-BO").format(num);
}

// Helper para formatear moneda boliviana
function formatCurrency(amount: number): string {
  return `Bs ${new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

// Helper para obtener iniciales del nombre
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Get current user's profile for organization_id
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }



  // If profile exists but missing organization_id, use fallback query
  let orgId = profile.organization_id as string | null;
  if (!orgId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .maybeSingle();
    orgId = org?.id ?? null;
  }

  // If still no orgId, show error state instead of crashing
  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8 bg-red-50 rounded-xl border-2 border-red-200">
          <p className="text-red-800 font-semibold">Error de configuración</p>
          <p className="text-red-600 text-sm mt-1">
            Tu cuenta no está asociada a ninguna organización. Contacta al
            administrador.
          </p>
        </div>
      </div>
    );
  }

  // ── Parallel data fetching ────────────────────────────────────────────────

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    productsResult,
    inventoryResult,
    salesTodayResult,
    reservedStockResult,
    recentSalesResult,
  ] = await Promise.all([
    // Total products
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_active", true),

    // Total stock and global low stock logic
    supabase
      .from("inventory")
      .select("quantity, product_id, size, min_stock, products!inner(id, name, sku, organization_id)")
      .eq("products.organization_id", orgId),

    // Today's sales
    supabase
      .from("sales")
      .select("total, canal")
      .eq("organization_id", orgId)
      .gte("created_at", todayStart.toISOString()),

    // Reserved stock
    supabase
      .from("orders")
      .select("status, organization_id, order_items(quantity)")
      .eq("organization_id", orgId)
      .in("status", ["pending", "preparando", "en_camino"]),

    // Last 5 sales
    supabase
      .from("sales")
      .select(
        `
        id,
        total,
        subtotal,
        discount,
        payment_method,
        created_at,
        customer_name,
        profiles(full_name),
        locations(name),
        sale_items(quantity)
      `
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // ── Compute stats ─────────────────────────────────────────────────────────

  const totalProducts = productsResult.count || 0;

  let totalStock = 0;
  const globalStockMap = new Map<string, { product: any; totalQty: number; criticalSizes: string[] }>();

  inventoryResult.data?.forEach((item) => {
    const qty = item.quantity || 0;
    totalStock += qty;

    const pid = item.product_id;
    if (!globalStockMap.has(pid)) {
      globalStockMap.set(pid, { product: item.products, totalQty: 0, criticalSizes: [] });
    }
    const productStats = globalStockMap.get(pid)!;
    productStats.totalQty += qty;

    if (qty <= 3 && item.size) {
      if (!productStats.criticalSizes.includes(item.size)) {
        productStats.criticalSizes.push(item.size);
      }
    }
  });

  const lowStockItems = Array.from(globalStockMap.values())
    .filter((p) => p.totalQty < LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.totalQty - b.totalQty);
  const lowStockCount = lowStockItems.length;

  const salesTodayOnline = salesTodayResult.data?.filter(s => s.canal !== "fisico").reduce((sum, sale) => sum + sale.total, 0) || 0;
  const salesTodayOnlineCount = salesTodayResult.data?.filter(s => s.canal !== "fisico").length || 0;

  const salesTodayFisico = salesTodayResult.data?.filter(s => s.canal === "fisico").reduce((sum, sale) => sum + sale.total, 0) || 0;
  const salesTodayFisicoCount = salesTodayResult.data?.filter(s => s.canal === "fisico").length || 0;

  const reservedStock = reservedStockResult.data?.reduce((sum, order) => {
    const orderQty = (order.order_items as { quantity: number }[] | null)
      ?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;
    return sum + orderQty;
  }, 0) || 0;

  const recentSales = recentSalesResult.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Resumen general de tu negocio
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
        <StatsCard
          title="Total Productos"
          value={formatNumber(totalProducts)}
          icon={Package}
          subtitle="Productos activos"
          delay={0}
        />
        <StatsCard
          title="Stock Total"
          value={formatNumber(totalStock)}
          icon={Boxes}
          subtitle="Unidades en inventario"
          delay={100}
        />
        <div className="relative">
          <StatsCard
            title="Stock Reservado"
            value={formatNumber(reservedStock)}
            icon={Lock}
            subtitle="Pedidos activos"
            delay={150}
          />
          {reservedStock > 0 && (
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10">
              <Badge variant="warning" className="shadow-sm whitespace-nowrap text-[10px] border border-amber-200">
                ⚠ {formatNumber(reservedStock)} uds. bloqueadas
              </Badge>
            </div>
          )}
        </div>
        <StatsCard
          title="Ventas Online"
          value={formatCurrency(salesTodayOnline)}
          icon={Globe}
          subtitle={`${salesTodayOnlineCount} venta${salesTodayOnlineCount !== 1 ? "s" : ""} online`}
          delay={200}
        />
        <StatsCard
          title="Ventas Físico"
          value={formatCurrency(salesTodayFisico)}
          icon={Store}
          subtitle={`${salesTodayFisicoCount} venta${salesTodayFisicoCount !== 1 ? "s" : ""} en tienda`}
          delay={250}
        />
        <StatsCard
          title="Bajo Stock"
          value={lowStockCount}
          icon={AlertTriangle}
          subtitle={
            lowStockCount > 0 ? "Requieren atención" : "Todo en orden"
          }
          delay={300}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock */}
        <div className="bg-white border border-zinc-200 rounded-lg shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              Stock Bajo
            </h3>
            <span className="text-xs text-zinc-500 font-medium">
              &lt; {LOW_STOCK_THRESHOLD} uds.
            </span>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-900 mb-1">
                ¡Todo en orden!
              </p>
              <p className="text-xs text-zinc-500">
                No hay productos con stock bajo
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200">
              <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-2 px-4 py-2 bg-zinc-50 text-xs font-semibold text-zinc-500 items-center">
                <div>Producto</div>
                <div>SKU</div>
                <div className="text-center">Stock Total</div>
                <div>Tallas Críticas</div>
                <div className="w-[60px]"></div>
              </div>
              {lowStockItems.map((item, i: number) => {
                const qty = item.totalQty;
                const variant = qty <= 3 ? "danger" : "warning";

                return (
                  <div
                    key={item.product?.id || i}
                    className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-2 items-center px-4 py-3 hover:bg-zinc-50 transition-colors"
                    style={{ animation: `fadeIn 0.4s ease-out ${i * 0.1}s both` }}
                  >
                    <div className="min-w-0 pr-2 flex items-center">
                      <p className="text-[13px] font-medium text-zinc-900 truncate">
                        {item.product?.name}
                      </p>
                    </div>
                    <div className="min-w-0 pr-2">
                      <p className="text-[11px] text-zinc-500 font-mono truncate">
                        {item.product?.sku}
                      </p>
                    </div>
                    <div className="text-[13px] font-semibold text-zinc-900 text-center">
                      {qty}
                    </div>
                    <div className="text-[11px] text-zinc-600 truncate flex gap-1 flex-wrap">
                      {item.criticalSizes.length > 0 ? item.criticalSizes.map((s, idx) => (
                        <span key={idx} className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-100">{s}</span>
                      )) : <span className="text-zinc-400">—</span>}
                    </div>
                    <div className="text-right">
                      <Badge variant={variant} icon>
                        {qty} uds
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Sales */}
        <div className="bg-white border border-zinc-200 rounded-lg shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Últimas Ventas</h3>
          </div>

          {recentSales.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingBag className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-900 mb-1">
                No hay ventas registradas
              </p>
              <p className="text-xs text-zinc-500">
                ¡Empieza a vender!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {recentSales.map((sale: any, idx: number) => {
                const PayIcon =
                  paymentIcons[sale.payment_method] || CreditCard;
                const totalItems =
                  sale.sale_items?.reduce(
                    (sum: number, item: any) => sum + item.quantity,
                    0
                  ) || 0;
                const staffName = (sale.profiles as any)?.full_name || "Staff";
                const initials = getInitials(staffName);
                const paymentLabel =
                  paymentLabels[sale.payment_method] || "Otro";

                return (
                  <div
                    key={sale.id}
                    className="px-4 py-3 hover:bg-zinc-50 transition-colors cursor-pointer"
                    style={{
                      animation: `fadeIn 0.4s ease-out ${idx * 0.1}s both`,
                    }}
                  >
                    {/* Mobile: stacked layout / Desktop: horizontal */}
                    <div className="flex items-start sm:items-center gap-3">
                      {/* Avatar */}
                      <div className="w-9 h-9 sm:w-10 sm:h-10 bg-zinc-100 border border-zinc-200 rounded-full flex items-center justify-center flex-shrink-0 text-zinc-600 font-bold text-xs sm:text-sm shadow-sm">
                        {initials}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            {sale.customer_name || "Venta directa"}
                          </p>
                          {sale.discount > 0 && (
                            <Badge variant="gold">
                              {((sale.discount / sale.subtotal) * 100).toFixed(0)}% desc
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500">
                            <PayIcon className="w-3 h-3" />
                            {paymentLabel}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            · {(sale.locations as any)?.name}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            · {totalItems} ítem{totalItems !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-zinc-900">
                          {formatCurrency(sale.total)}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {formatDistanceToNow(new Date(sale.created_at), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
