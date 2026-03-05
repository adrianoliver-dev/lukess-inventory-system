"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Clock,
  CheckCircle,
  Calendar,
  TrendingUp,
  Search,
  X,
  PackageSearch,
  RefreshCw,
  Loader2,
  Package,
  MapPin,
} from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { OrderWithItems, OrderStatus } from "@/lib/types";
import { ORDER_STATUS_CONFIG } from "@/lib/types";
import { updateOrderStatus } from "./actions";
import OrderDetailModal from "./order-detail-modal";
import CancelOrderModal from "@/components/orders/CancelOrderModal";
import { createClient } from "@/lib/supabase/client";

// ── Tipos para el modal de confirmación ──────────────────────────────────────

interface AllocationRow {
  location_id: string;
  location_name: string;
  inventory_id: string;
  total_qty: number;
  total_reserved: number;
  order_current: number;
  available: number;
  edited: number;
}

interface ProductAllocation {
  product_id: string;
  product_name: string;
  size: string | null;
  order_qty: number;
  rows: AllocationRow[];
}

interface PedidosClientProps {
  initialOrders: OrderWithItems[];
  userRole: string;
  userId: string;
}

type DateFilter = "today" | "7days" | "30days" | "all";
type PaymentFilter = "all" | "qr" | "efectivo" | "tarjeta";

const STATUS_TABS: { key: "all" | OrderStatus; label: string; icon?: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes", icon: "🕐" },
  { key: "pending_payment", label: "Pago pendiente", icon: "💳" },
  { key: "reserved", label: "Pago pendiente (legacy)", icon: "💳" },
  { key: "confirmed", label: "Confirmados", icon: "✅" },
  { key: "shipped", label: "En camino", icon: "🚚" },
  { key: "completed", label: "Entregados", icon: "🎉" },
  { key: "cancelled", label: "Cancelados", icon: "❌" },
];

function getBadgeVariant(status: OrderStatus): "success" | "warning" | "danger" | "neutral" | "gold" {
  switch (status) {
    case "pending":
    case "reserved":
      return "warning";
    case "confirmed":
    case "shipped":
      return "gold";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}



function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays === 1) return "ayer";

  return date.toLocaleDateString("es-BO", { day: "numeric", month: "short" });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getItemsSummary(order: OrderWithItems): string {
  if (!order.order_items?.length) return "Sin productos";
  const names = order.order_items
    .map((item) => {
      const name = item.product?.name ?? "Producto";
      const size = item.size ? ` ${item.size}` : "";
      return `${name}${size}`;
    })
    .join(", ");
  return names.length > 60 ? names.slice(0, 57) + "…" : names;
}

function sortOrders(orders: OrderWithItems[], status: "all" | OrderStatus): OrderWithItems[] {
  const sorted = [...orders];
  if (status === "confirmed" || status === "shipped") {
    return sorted.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  return sorted.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export default function PedidosClient({
  initialOrders,
  userRole,
}: PedidosClientProps) {
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<"all" | OrderStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderWithItems | null>(null);

  // Estado del modal de confirmación con asignaciones editables
  const [confirmModalOrder, setConfirmModalOrder] = useState<OrderWithItems | null>(null);
  const [productAllocations, setProductAllocations] = useState<ProductAllocation[]>([]);
  const [allocationsLoading, setAllocationsLoading] = useState(false);
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");

  const canChangeStatus = userRole === "admin" || userRole === "manager";

  // Abre el modal de confirmación y construye asignaciones editables
  const openConfirmModal = async (order: OrderWithItems) => {
    setConfirmModalOrder(order);
    setFulfillmentNotes("");
    setAllocationsLoading(true);
    try {
      const supabase = createClient();
      const productIds = [...new Set((order.order_items ?? []).map((i) => i.product_id))];

      const [{ data: invData }, { data: resData }] = await Promise.all([
        supabase
          .from("inventory")
          .select("id, product_id, location_id, size, quantity, reserved_qty, locations:location_id(name)")
          .in("product_id", productIds),
        supabase
          .from("inventory_reservations")
          .select("product_id, location_id, size, quantity")
          .eq("order_id", order.id)
          .in("status", ["reserved", "confirmed"]),
      ]);

      const allocations: ProductAllocation[] = (order.order_items ?? []).map((item) => {
        const productInv = ((invData ?? []) as unknown as Array<{
          id: string; product_id: string; location_id: string; size: string | null;
          quantity: number; reserved_qty: number | null;
          locations: { name: string } | null;
        }>).filter((inv) =>
          inv.product_id === item.product_id &&
          (item.size ? inv.size === item.size : true)
        );

        const locationGroups = new Map<string, any>();
        productInv.forEach(inv => {
          if (!locationGroups.has(inv.location_id)) {
            locationGroups.set(inv.location_id, {
              location_id: inv.location_id,
              location_name: inv.locations?.name ?? "Ubicación",
              inventory_id: inv.id,
              quantity: 0,
              reserved_qty: 0
            });
          }
          const group = locationGroups.get(inv.location_id);
          group.quantity += inv.quantity;
          group.reserved_qty += (inv.reserved_qty ?? 0);
        });

        const rows: AllocationRow[] = Array.from(locationGroups.values())
          .sort((a, b) => {
            const aB = a.location_name.toLowerCase().includes("bodega") ? 1 : 0;
            const bB = b.location_name.toLowerCase().includes("bodega") ? 1 : 0;
            if (aB !== bB) return aB - bB;
            return a.location_name.localeCompare(b.location_name);
          })
          .map((group) => {
            const orderCurrent =
              (resData ?? []).find(
                (r) =>
                  r.product_id === item.product_id &&
                  r.location_id === group.location_id &&
                  r.size === item.size
              )?.quantity ?? 0;
            const totalReserved = group.reserved_qty ?? 0;
            const available = Math.max(0, group.quantity - totalReserved + orderCurrent);
            return {
              location_id: group.location_id,
              location_name: group.location_name,
              inventory_id: group.inventory_id,
              total_qty: group.quantity,
              total_reserved: totalReserved,
              order_current: orderCurrent,
              available,
              edited: orderCurrent,
            };
          });

        return {
          product_id: item.product_id,
          product_name: item.product?.name ?? "Producto",
          size: item.size,
          order_qty: item.quantity,
          rows,
        };
      });

      setProductAllocations(allocations);
    } catch (err) {
      console.error("Error cargando asignaciones:", err);
      setProductAllocations([]);
    } finally {
      setAllocationsLoading(false);
    }
  };

  const updateAllocation = (prodIdx: number, rowIdx: number, newQty: number) => {
    setProductAllocations((prev) =>
      prev.map((prod, pi) => {
        if (pi !== prodIdx) return prod;
        return {
          ...prod,
          rows: prod.rows.map((row, ri) => {
            if (ri !== rowIdx) return row;
            return { ...row, edited: Math.max(0, Math.min(newQty, row.available)) };
          }),
        };
      })
    );
  };

  const closeConfirmModal = () => {
    setConfirmModalOrder(null);
    setProductAllocations([]);
    setFulfillmentNotes("");
  };

  const handleCancelConfirm = async (reason: string) => {
    if (!cancelTarget) return;
    const orderId = cancelTarget.id;
    setCancelTarget(null);
    setConfirmingId(orderId);
    try {
      const result = await updateOrderStatus(orderId, "cancelled", undefined, undefined, reason);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Pedido cancelado");
        handleStatusChange(orderId, "cancelled");
      }
    } finally {
      setConfirmingId(null);
    }
  };

  const handleConfirmOrder = async () => {
    if (!confirmModalOrder) return;

    // Validar que cada producto tenga asignación completa
    const allValid = productAllocations.every(
      (prod) => prod.rows.reduce((s, r) => s + r.edited, 0) === prod.order_qty
    );
    if (!allValid && productAllocations.length > 0) {
      toast.error("Revisa la asignación de stock — el total no coincide con el pedido");
      return;
    }

    setConfirmingId(confirmModalOrder.id);
    try {
      // Si se editaron las asignaciones, aplicar antes de confirmar
      const anyChanged = productAllocations.some((prod) =>
        prod.rows.some((row) => row.edited !== row.order_current)
      );

      if (anyChanged) {
        const allocations = productAllocations.flatMap((prod) =>
          prod.rows
            .filter((row) => row.edited > 0)
            .map((row) => ({
              product_id: prod.product_id,
              location_id: row.location_id,
              size: prod.size ?? "",
              quantity: row.edited,
            }))
        );
        const supabase = createClient();
        const { error: allocErr } = await supabase.rpc("apply_order_allocation", {
          p_order_id: confirmModalOrder.id,
          p_allocations: allocations,
        });
        if (allocErr) {
          toast.error(`Error al reasignar stock: ${allocErr.message}`);
          return;
        }
      }

      const result = await updateOrderStatus(
        confirmModalOrder.id,
        "confirmed",
        undefined,
        fulfillmentNotes
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Pedido confirmado ✅");
        handleStatusChange(confirmModalOrder.id, "confirmed");
        closeConfirmModal();
      }
    } finally {
      setConfirmingId(null);
    }
  };

  // Realtime subscription — new orders appear at top without page reload
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('pedidos-list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          const { data: newOrder } = await supabase
            .from('orders')
            .select(`
              *,
              order_items (
                *,
                product:products (id, name, sku, image_url)
              )
            `)
            .eq('id', (payload.new as { id: string }).id)
            .single()

          if (newOrder) {
            setOrders((prev) => [newOrder as OrderWithItems, ...prev])
            toast.success(
              `Nuevo pedido de ${(newOrder as OrderWithItems).customer_name}`,
              { icon: '🛍️', duration: 4000 }
            )
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new as { id: string; status: OrderStatus;[key: string]: unknown }
          setOrders((prev) =>
            prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
          )
          setSelectedOrder((prev) =>
            prev?.id === updated.id ? { ...prev, ...updated } : prev
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const hasActiveFilters =
    searchQuery !== "" || dateFilter !== "all" || paymentFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setDateFilter("all");
    setPaymentFilter("all");
  };

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    setSelectedOrder((prev) =>
      prev?.id === orderId ? { ...prev, status: newStatus } : prev
    );
  };

  const QUICK_ACTIONS: Partial<Record<OrderStatus, { nextStatus: OrderStatus; label: string; icon: string }>> = {
    pending: { nextStatus: "confirmed", label: "Confirmar", icon: "✅" },
    reserved: { nextStatus: "confirmed", label: "Confirmar pago", icon: "✅" },
    confirmed: { nextStatus: "shipped", label: "Marcar enviado", icon: "🚚" },
    shipped: { nextStatus: "completed", label: "Completado", icon: "🎉" },
  };

  const QUICK_ACTION_MESSAGES: Partial<Record<OrderStatus, string>> = {
    confirmed: "Pedido confirmado",
    shipped: "Pedido marcado como enviado",
    completed: "Pedido completado",
  };

  const handleQuickAction = async (
    order: OrderWithItems,
    newStatus: OrderStatus,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    // Para confirmar un pedido pendiente o reservado → abrir modal con reservas
    if (newStatus === "confirmed" && (order.status === "pending" || order.status === "reserved")) {
      openConfirmModal(order);
      return;
    }
    setConfirmingId(order.id);
    try {
      const result = await updateOrderStatus(order.id, newStatus);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(QUICK_ACTION_MESSAGES[newStatus] ?? "Estado actualizado");
        handleStatusChange(order.id, newStatus);
      }
    } finally {
      setConfirmingId(null);
    }
  };

  // Stats (based on live orders state)
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const confirmedCount = orders.filter((o) => o.status === "confirmed").length;
  const todayCount = orders.filter(
    (o) => new Date(o.created_at) >= startOfToday
  ).length;
  const monthRevenue = orders
    .filter(
      (o) =>
        ["completed", "entregado"].includes(o.status) && new Date(o.created_at) >= startOfMonth
    )
    .reduce((sum, o) => sum + o.total, 0);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (activeTab !== "all") {
      result = result.filter((o) => o.status === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (o) =>
          (o.customer_name || '').toLowerCase().includes(q) ||
          (o.customer_phone || '').includes(q) ||
          (o.id || '').slice(0, 8).toLowerCase().includes(q)
      );
    }

    if (dateFilter !== "all") {
      const cutoff =
        dateFilter === "today"
          ? startOfToday
          : dateFilter === "7days"
            ? new Date(now.getTime() - 7 * 86400000)
            : new Date(now.getTime() - 30 * 86400000);
      result = result.filter((o) => new Date(o.created_at) >= cutoff);
    }

    if (paymentFilter !== "all") {
      const paymentMap: Record<PaymentFilter, string[]> = {
        all: [],
        qr: ["qr", "QR", "transferencia", "transfer"],
        efectivo: ["efectivo", "cash", "Efectivo"],
        tarjeta: ["tarjeta", "card", "Tarjeta"],
      };
      const matches = paymentMap[paymentFilter];
      result = result.filter((o) =>
        matches.some((m) => (o.payment_method || '').toLowerCase().includes(m.toLowerCase()))
      );
    }

    return sortOrders(result, activeTab);
  }, [orders, activeTab, searchQuery, dateFilter, paymentFilter]);

  // Tab counts (apply search+date+payment, not tab itself)
  const tabCounts = useMemo(() => {
    const base = orders.filter((o) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (
          !(o.customer_name || '').toLowerCase().includes(q) &&
          !(o.customer_phone || '').includes(q) &&
          !(o.id || '').slice(0, 8).toLowerCase().includes(q)
        )
          return false;
      }
      if (dateFilter !== "all") {
        const cutoff =
          dateFilter === "today"
            ? startOfToday
            : dateFilter === "7days"
              ? new Date(now.getTime() - 7 * 86400000)
              : new Date(now.getTime() - 30 * 86400000);
        if (new Date(o.created_at) < cutoff) return false;
      }
      if (paymentFilter !== "all") {
        const paymentMap: Record<PaymentFilter, string[]> = {
          all: [],
          qr: ["qr", "QR", "transferencia", "transfer"],
          efectivo: ["efectivo", "cash", "Efectivo"],
          tarjeta: ["tarjeta", "card", "Tarjeta"],
        };
        const matches = paymentMap[paymentFilter];
        if (!matches.some((m) => (o.payment_method || '').toLowerCase().includes(m.toLowerCase())))
          return false;
      }
      return true;
    });

    return {
      all: base.length,
      pending: base.filter((o) => o.status === "pending").length,
      pending_payment: base.filter((o) => o.status === "pending_payment").length,
      reserved: base.filter((o) => o.status === "reserved").length,
      confirmed: base.filter((o) => o.status === "confirmed").length,
      shipped: base.filter((o) => o.status === "shipped").length,
      completed: base.filter((o) => o.status === "completed").length,
      cancelled: base.filter((o) => o.status === "cancelled").length,
    };
  }, [orders, searchQuery, dateFilter, paymentFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              📦 Pedidos Online
            </h1>
            <button
              onClick={() => window.location.reload()}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Gestión de pedidos de la tienda online
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <Clock className="w-6 h-6 text-amber-600" />
            <span className="text-2xl font-bold text-amber-700">{pendingCount}</span>
          </div>
          <p className="text-sm font-semibold text-amber-700">Pendientes</p>
          <p className="text-xs text-amber-500 mt-0.5">Requieren atención</p>
        </div>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <CheckCircle className="w-6 h-6 text-blue-600" />
            <span className="text-2xl font-bold text-blue-700">{confirmedCount}</span>
          </div>
          <p className="text-sm font-semibold text-blue-700">Confirmados</p>
          <p className="text-xs text-blue-500 mt-0.5">En proceso</p>
        </div>

        <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <Calendar className="w-6 h-6 text-purple-600" />
            <span className="text-2xl font-bold text-purple-700">{todayCount}</span>
          </div>
          <p className="text-sm font-semibold text-purple-700">Hoy</p>
          <p className="text-xs text-purple-500 mt-0.5">Nuevos pedidos</p>
        </div>

        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-6 h-6 text-green-600" />
            <span className="text-lg font-bold text-green-700">
              Bs {formatCurrency(monthRevenue)}
            </span>
          </div>
          <p className="text-sm font-semibold text-green-700">Total del mes</p>
          <p className="text-xs text-green-500 mt-0.5">Ingresos confirmados</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 z-10" />
            <Input
              type="text"
              placeholder="Buscar por nombre, teléfono o ID del pedido..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 z-10"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="min-w-[160px]"
          >
            <option value="all">📅 Todas las fechas</option>
            <option value="today">Hoy</option>
            <option value="7days">Últimos 7 días</option>
            <option value="30days">Últimos 30 días</option>
          </Select>

          <Select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
            className="min-w-[140px]"
          >
            <option value="all">💳 Todos los pagos</option>
            <option value="qr">QR / Transfer</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
          </Select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <X className="w-4 h-4" />
              Limpiar
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                Búsqueda: &quot;{searchQuery}&quot;
                <button onClick={() => setSearchQuery("")}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {dateFilter !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                {dateFilter === "today" ? "Hoy" : dateFilter === "7days" ? "Últimos 7 días" : "Últimos 30 días"}
                <button onClick={() => setDateFilter("all")}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {paymentFilter !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                Pago: {paymentFilter === "qr" ? "QR/Transfer" : paymentFilter === "efectivo" ? "Efectivo" : "Tarjeta"}
                <button onClick={() => setPaymentFilter("all")}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Status Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-200 scrollbar-hide">
          {STATUS_TABS.map((tab) => {
            const count = tabCounts[tab.key];
            const isActive = activeTab === tab.key;
            const isPending = tab.key === "pending";

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-all border-b-2
                  ${isActive
                    ? "border-gold-500 text-gold-600 font-medium"
                    : "border-transparent text-zinc-500 hover:text-zinc-700"
                  }
                `}
              >
                {tab.icon && <span className="text-base">{tab.icon}</span>}
                <span>
                  {tab.label}
                </span>
                <span
                  className={`
                    inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold
                    ${isActive
                      ? "bg-gold-500 text-white"
                      : isPending && count > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-zinc-100 text-zinc-600"
                    }
                  `}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Orders List */}
        <div className="p-4 space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <PackageSearch className="w-16 h-16 text-zinc-300 mx-auto mb-4" />
              <p className="text-zinc-500 text-lg font-medium">
                No se encontraron pedidos
              </p>
              <p className="text-zinc-400 text-sm mt-1">
                Intenta con otros filtros
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            filteredOrders.map((order) => {
              const config = ORDER_STATUS_CONFIG[order.status as OrderStatus];
              const isPending = order.status === "pending" || order.status === "reserved";
              const itemsCount = order.order_items?.length ?? 0;
              const itemsSummary = getItemsSummary(order);
              const isConfirming = confirmingId === order.id;
              const quickAction = QUICK_ACTIONS[order.status as OrderStatus];

              return (
                <div
                  key={order.id}
                  className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start border-b border-zinc-100 pb-3 mb-3">
                    <div>
                      <span className="text-xs font-mono text-zinc-500">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <h3 className="font-medium text-zinc-900 mt-1">
                        {order.customer_name}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        📱 {order.customer_phone}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                            ⚠ Requiere atención
                          </span>
                        )}
                        <Badge variant={getBadgeVariant(order.status as OrderStatus)} icon>
                          {config.label}
                        </Badge>
                      </div>
                      <span className="text-xs text-zinc-400 font-medium">
                        {formatRelativeTime(order.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4 text-sm text-zinc-600">
                    <div className="flex justify-between">
                      <span>Artículos:</span>
                      <span className="font-medium text-zinc-900 line-clamp-1 flex-1 text-right ml-4">
                        {itemsCount} {itemsCount === 1 ? "producto" : "productos"}
                        <span className="text-zinc-400 font-normal ml-1">({itemsSummary})</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fecha:</span>
                      <span>{new Date(order.created_at).toLocaleDateString("es-BO")}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-zinc-100">
                    <div className="flex flex-col">
                      <span className="text-lg font-bold text-zinc-900">
                        Bs. {formatCurrency(order.total)}
                      </span>
                      {order.discount_amount ? (
                        <span className="text-xs text-amber-600 font-medium">
                          Desc: -Bs. {formatCurrency(order.discount_amount)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {quickAction && canChangeStatus && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleQuickAction(order, quickAction.nextStatus, e)}
                          disabled={isConfirming}
                          className="bg-zinc-50 hover:bg-zinc-100"
                        >
                          {isConfirming ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          ) : (
                            <span className="mr-1.5">{quickAction.icon}</span>
                          )}
                          {quickAction.label}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedOrder(order);
                          setIsModalOpen(true);
                        }}
                      >
                        Ver detalle →
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStatusChange={handleStatusChange}
        userRole={userRole as "admin" | "manager" | "staff"}
      />

      {/* Cancel Order Modal — para cancelaciones desde la lista */}
      <CancelOrderModal
        isOpen={cancelTarget !== null}
        orderId={cancelTarget?.id ?? ""}
        onConfirm={handleCancelConfirm}
        onClose={() => setCancelTarget(null)}
      />

      {/* ── Modal Confirmar Pago — Asignación editable por puesto ─────────────── */}
      {confirmModalOrder && (() => {
        const allValid =
          productAllocations.length === 0 ||
          productAllocations.every(
            (prod) => prod.rows.reduce((s, r) => s + r.edited, 0) === prod.order_qty
          );
        const isConfirming = confirmingId === confirmModalOrder.id;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={closeConfirmModal}
            />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-100 rounded-t-2xl px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">✅ Confirmar pago</h2>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    #{confirmModalOrder.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={closeConfirmModal}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Resumen del pedido */}
                <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                  <div>
                    <p className="font-semibold text-gray-900">
                      👤 {confirmModalOrder.customer_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      📱 {confirmModalOrder.customer_phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-zinc-900">
                      Bs {formatCurrency(confirmModalOrder.total)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {confirmModalOrder.order_items?.length ?? 0} producto(s)
                    </p>
                  </div>
                </div>

                {/* Asignación de stock por puesto */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4 text-zinc-600" />
                    <p className="text-sm font-semibold text-gray-800">
                      Asignación de stock por puesto
                    </p>
                    <span className="text-xs text-gray-400">(editable)</span>
                  </div>

                  {allocationsLoading ? (
                    <div className="flex items-center justify-center py-8 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      <span className="text-sm">Cargando stock...</span>
                    </div>
                  ) : productAllocations.length === 0 ? (
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-center">
                      <p className="text-sm text-zinc-500 font-medium">⚠ Sin stock disponible</p>
                      <p className="text-xs text-zinc-400 mt-1">
                        No hay inventario registrado para los productos de este pedido.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {productAllocations.map((prod, prodIdx) => {
                        const assigned = prod.rows.reduce((s, r) => s + r.edited, 0);
                        const diff = assigned - prod.order_qty;
                        const prodValid = diff === 0;

                        return (
                          <div
                            key={`${prod.product_id}-${prod.size ?? "ns"}`}
                            className="border border-gray-200 rounded-xl overflow-hidden"
                          >
                            {/* Cabecera del producto */}
                            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-800">
                                  {prod.product_name}
                                </span>
                                {prod.size && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                                    Talla {prod.size}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-medium text-gray-500">
                                Pedido: {prod.order_qty} ud{prod.order_qty !== 1 ? "s" : ""}
                              </span>
                            </div>

                            {/* Filas de ubicaciones */}
                            <div className="divide-y divide-gray-100">
                              {prod.rows.map((row, rowIdx) => {
                                const isDisabled = row.available === 0 && row.edited === 0;
                                return (
                                  <div
                                    key={row.location_id}
                                    className={`flex items-center justify-between px-4 py-3 ${isDisabled ? "opacity-40" : ""}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                      <span className="text-sm text-gray-700 truncate">
                                        {row.location_name}
                                      </span>
                                      <span className="text-xs text-gray-400 flex-shrink-0">
                                        (disp: {row.available})
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <button
                                        onClick={() =>
                                          updateAllocation(prodIdx, rowIdx, row.edited - 1)
                                        }
                                        disabled={row.edited === 0}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
                                      >
                                        −
                                      </button>
                                      <input
                                        type="number"
                                        min={0}
                                        max={row.available}
                                        value={row.edited}
                                        onChange={(e) =>
                                          updateAllocation(
                                            prodIdx,
                                            rowIdx,
                                            parseInt(e.target.value, 10) || 0
                                          )
                                        }
                                        className="w-14 text-center text-sm font-semibold border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                      <button
                                        onClick={() =>
                                          updateAllocation(prodIdx, rowIdx, row.edited + 1)
                                        }
                                        disabled={row.edited >= row.available}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
                                      >
                                        +
                                      </button>
                                      <span className="text-xs text-gray-400 w-6">uds</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Footer: total asignado */}
                            <div
                              className={`flex items-center justify-between px-4 py-2 border-t ${prodValid
                                ? "bg-zinc-50 border-zinc-200"
                                : "bg-red-50 border-red-100"
                                }`}
                            >
                              <span
                                className={`text-xs font-semibold ${prodValid ? "text-zinc-600" : "text-red-600"
                                  }`}
                              >
                                Total asignado
                              </span>
                              <span
                                className={`text-sm font-bold ${prodValid ? "text-zinc-900" : "text-red-600"
                                  }`}
                              >
                                {assigned} / {prod.order_qty}
                                {prodValid
                                  ? " ✓"
                                  : diff > 0
                                    ? ` — excede en ${diff}`
                                    : ` — faltan ${Math.abs(diff)}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Notas de preparación */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    📝 Notas de preparación{" "}
                    <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <textarea
                    value={fulfillmentNotes}
                    onChange={(e) => setFulfillmentNotes(e.target.value)}
                    placeholder="Ej: Sacar de Puesto 2, coordinar con almacén..."
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
              </div>

              {/* Acciones */}
              <div className="sticky bottom-0 bg-white border-t border-gray-100 rounded-b-2xl px-6 py-4 flex items-center gap-3">
                <button
                  onClick={closeConfirmModal}
                  disabled={isConfirming}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-60"
                >
                  Cancelar
                </button>
                <Button
                  variant="primary"
                  onClick={handleConfirmOrder}
                  disabled={isConfirming || (!allValid && productAllocations.length > 0)}
                  className="flex-1"
                >
                  {isConfirming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "✅ Confirmar pago"
                  )}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
