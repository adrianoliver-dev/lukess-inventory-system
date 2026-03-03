"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Category, Location } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ProductQuickView } from "@/components/ui/ProductQuickView";
import toast from "react-hot-toast";
import {
  Search,
  Plus,
  Package,
  Filter,
  ChevronDown,
  AlertTriangle,
  Edit,
  MapPin,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  PackageX,
  RotateCcw,
  Printer,
  QrCode,
  ChevronUp,
  Eye,
  EyeOff,
  Globe,
  Lock,
} from "lucide-react";
import { togglePublishedToLanding } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

// ── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  quantity: number;
  reserved_qty: number;
  min_stock: number;
  location_id: string;
  size: string;
  color: string | null;
  locations: { id: string; name: string } | null;
}

interface ProductWithRelations {
  id: string;
  sku: string;
  sku_group: string | null;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  brand: string | null;
  color: string | null;
  sizes: string[];
  image_url: string | null;
  is_active: boolean;
  published_to_landing: boolean;
  organization_id: string;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  categories: { id: string; name: string } | null;
  inventory: InventoryItem[];
}

interface InventoryClientProps {
  initialProducts: ProductWithRelations[];
  categories: Category[];
  locations: Location[];
  userRole: "admin" | "manager" | "staff";
  userLocationId: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function InventoryClient({
  initialProducts,
  categories,
  locations,
  userRole,
  userLocationId,
}: InventoryClientProps) {
  const router = useRouter();
  const [products, setProducts] =
    useState<ProductWithRelations[]>(initialProducts);

  // Sincronizar productos cuando cambian desde el servidor (cambio de ubicación)
  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState(
    userRole === "staff" && userLocationId ? userLocationId : ""
  );
  const [showFilters, setShowFilters] = useState(false);
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<"name" | "sku" | "price" | "stock">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; productId: string | null; productName: string; isActive: boolean }>({
    isOpen: false,
    productId: null,
    productName: "",
    isActive: true,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteNote, setDeleteNote] = useState("");
  const [generatingLabels, setGeneratingLabels] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<ProductWithRelations | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [togglingLandingId, setTogglingLandingId] = useState<string | null>(null);
  const itemsPerPage = 20;

  // ── Fetch products function ───────────────────────────────────────────────

  const fetchProducts = async (includeInactive: boolean = false) => {
    const supabase = createClient();
    let query = supabase
      .from("products")
      .select(
        `
        *,
        categories(id, name),
        inventory(id, quantity, reserved_qty, min_stock, location_id, size, color, locations(id, name))
      `
      )
      .eq("organization_id", initialProducts[0]?.organization_id || "")
      .order("name");

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data } = await query;
    if (data) setProducts(data as ProductWithRelations[]);
  };

  // ── Supabase Realtime ──────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("inventory-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => fetchProducts(showInactive)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => fetchProducts(showInactive)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialProducts, showInactive]);

  // ── Refetch when showInactive changes ──────────────────────────────────────

  useEffect(() => {
    fetchProducts(showInactive);
  }, [showInactive]);

  // ── Filtering & Sorting ───────────────────────────────────────────────────

  const filteredAndSortedProducts = useMemo(() => {
    let filtered = products.filter((product) => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        product.name.toLowerCase().includes(searchLower) ||
        product.sku.toLowerCase().includes(searchLower) ||
        (product.brand && product.brand.toLowerCase().includes(searchLower));

      // Category filter
      const matchesCategory =
        !categoryFilter || product.category_id === categoryFilter;

      // Location filter — show only products that have inventory in this location
      const matchesLocation =
        !locationFilter ||
        product.inventory.some((inv) => inv.location_id === locationFilter);

      // Low stock filter — usar disponible (quantity - reserved_qty)
      const matchesLowStock =
        !onlyLowStock ||
        product.inventory.some(
          (inv) => Math.max(0, inv.quantity - (inv.reserved_qty ?? 0)) < inv.min_stock
        );

      return matchesSearch && matchesCategory && matchesLocation && matchesLowStock;
    });

    // Helper inline para calcular disponible (quantity - reserved_qty)
    const calcTotalStock = (product: ProductWithRelations) => {
      return (product.inventory || []).reduce(
        (sum, inv) => sum + Math.max(0, (inv.quantity || 0) - (inv.reserved_qty || 0)),
        0
      );
    };

    // Sorting


    filtered.sort((a, b) => {
      let compareValue = 0;

      switch (sortField) {
        case "name":
          compareValue = a.name.localeCompare(b.name);
          break;
        case "sku":
          compareValue = a.sku.localeCompare(b.sku);
          break;
        case "price":
          compareValue = (a.price || 0) - (b.price || 0);
          break;
        case "stock":
          const stockA = calcTotalStock(a);
          const stockB = calcTotalStock(b);
          compareValue = stockA - stockB;
          break;
      }

      return sortDirection === "asc" ? compareValue : -compareValue;
    });

    return filtered;
  }, [products, search, categoryFilter, locationFilter, onlyLowStock, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedProducts.length / itemsPerPage);
  const paginatedProducts = filteredAndSortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, locationFilter, onlyLowStock]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getStockForLocation = (product: ProductWithRelations, locId: string) => {
    const inv = product.inventory.find((i) => i.location_id === locId);
    if (!inv) return 0;
    return Math.max(0, inv.quantity - (inv.reserved_qty ?? 0));
  };

  const getTotalStock = (product: ProductWithRelations) => {
    return product.inventory.reduce(
      (sum, inv) => sum + Math.max(0, inv.quantity - (inv.reserved_qty ?? 0)),
      0
    );
  };

  const isLowStock = (product: ProductWithRelations) => {
    return product.inventory.some(
      (inv) => Math.max(0, inv.quantity - (inv.reserved_qty ?? 0)) < inv.min_stock
    );
  };

  const getStockBadgeColor = (quantity: number, minStock: number) => {
    if (quantity === 0) return "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md border border-red-400";
    if (quantity < minStock) return "bg-gradient-to-r from-red-400 to-red-500 text-white shadow-md border border-red-300";
    if (quantity < minStock * 2) return "bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-md border border-yellow-300";
    return "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md border border-green-400";
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Función para distribuir stock proporcionalmente entre tallas
  const distributeStockBySizes = (totalStock: number, sizes: string[]) => {
    if (!sizes || sizes.length === 0) {
      return { "Talla Única": totalStock };
    }

    const distribution: Record<string, number> = {};

    // Distribución proporcional con variación realista
    // Tallas centrales (M, L) tienen más stock
    const weights: Record<string, number> = {
      'XS': 0.8,
      'S': 1.2,
      'M': 1.5,
      'L': 1.5,
      'XL': 1.0,
      'XXL': 0.7,
    };

    let totalWeight = 0;
    sizes.forEach(size => {
      const weight = weights[size] || 1;
      totalWeight += weight;
    });

    let remaining = totalStock;
    sizes.forEach((size, index) => {
      const weight = weights[size] || 1;
      const proportion = weight / totalWeight;

      if (index === sizes.length - 1) {
        // Última talla recibe el resto
        distribution[size] = remaining;
      } else {
        const allocated = Math.floor(totalStock * proportion);
        distribution[size] = allocated;
        remaining -= allocated;
      }
    });

    return distribution;
  };

  const toggleExpanded = (productId: string) => {
    setExpandedProductId(expandedProductId === productId ? null : productId);
  };

  const handleReactivate = async (productId: string, productName: string) => {
    const supabase = createClient();

    try {

      const { error } = await supabase
        .from("products")
        .update({ is_active: true })
        .eq("id", productId);

      if (error) {
        console.error('❌ Error reactivando producto:', error);
        toast.error(`Error al reactivar: ${error.message}`);
        return;
      }

      toast.success(`"${productName}" reactivado correctamente`);
      fetchProducts(showInactive);
    } catch (error: any) {
      console.error('❌ Error inesperado:', error);
      toast.error('Error inesperado al reactivar el producto');
    }
  };

  const handleToggleLanding = async (product: ProductWithRelations) => {
    if (!product.is_active) {
      toast.error("Activa el producto primero para publicarlo en la tienda");
      return;
    }

    setTogglingLandingId(product.id);

    // Actualización optimista
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? { ...p, published_to_landing: !p.published_to_landing }
          : p
      )
    );

    const result = await togglePublishedToLanding(
      product.id,
      product.published_to_landing
    );

    if (!result.success) {
      // Revertir si hubo error
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? { ...p, published_to_landing: product.published_to_landing }
            : p
        )
      );
      toast.error(result.error || "Error al cambiar estado de la tienda");
    } else {
      if (!product.published_to_landing) {
        toast.success("Publicado en la tienda online ✅");
      } else {
        toast.success("Ocultado de la tienda online 🔒");
      }
    }

    setTogglingLandingId(null);
  };

  const activeLocationFilter = locationFilter
    ? locations.find((l) => l.id === locationFilter)
    : null;

  const activeCategoryFilter = categoryFilter
    ? categories.find((c) => c.id === categoryFilter)
    : null;

  // Función para imprimir etiquetas con QR
  const printLabels = async () => {
    setGeneratingLabels(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const { jsPDF } = await import("jspdf");

      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Layout: 2 etiquetas por página (una arriba, una abajo)
      const labelWidth = 80;
      const labelHeight = 100;
      const marginX = (pageWidth - labelWidth) / 2;

      let currentPage = 0;
      let yPosition = 20;

      for (let i = 0; i < filteredAndSortedProducts.length; i++) {
        const product = filteredAndSortedProducts[i];

        // Nueva página cada 2 productos
        if (i > 0 && i % 2 === 0) {
          pdf.addPage();
          yPosition = 20;
        }

        // Generar QR
        const qrDataUrl = await QRCode.toDataURL(
          `https://lukess-inventory-system.vercel.app/ventas?product=${product.id}`,
          { width: 200, margin: 1 }
        );

        // Dibujar etiqueta
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(marginX, yPosition, labelWidth, labelHeight);

        // Nombre del producto
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        const productName = product.name.substring(0, 40);
        pdf.text(productName, marginX + labelWidth / 2, yPosition + 10, { align: "center" });

        // SKU
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.text(`SKU: ${product.sku}`, marginX + labelWidth / 2, yPosition + 18, { align: "center" });

        // Precio
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Bs ${product.price.toFixed(2)}`, marginX + labelWidth / 2, yPosition + 28, { align: "center" });

        // QR Code
        pdf.addImage(qrDataUrl, "PNG", marginX + 20, yPosition + 35, 40, 40);

        // Texto "Escanear para vender"
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.text("Escanear para vender", marginX + labelWidth / 2, yPosition + 82, { align: "center" });

        // Stock total
        const stock = getTotalStock(product);
        pdf.setFontSize(9);
        pdf.text(`Stock: ${stock} unidades`, marginX + labelWidth / 2, yPosition + 90, { align: "center" });

        yPosition += labelHeight + 20;
      }

      pdf.save(`etiquetas-productos-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success(`${filteredAndSortedProducts.length} etiquetas generadas correctamente`);
    } catch (error) {
      console.error("Error generando etiquetas:", error);
      toast.error("Error al generar las etiquetas");
    } finally {
      setGeneratingLabels(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900">Inventario</h1>
            {userRole === "staff" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-full">
                <EyeOff className="w-3 h-3" />
                Solo lectura
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            {filteredAndSortedProducts.length} producto
            {filteredAndSortedProducts.length !== 1 ? "s" : ""}
            {search || categoryFilter || locationFilter || onlyLowStock
              ? " encontrados"
              : " en total"}
          </p>
        </div>
        {(userRole === "admin" || userRole === "manager") && (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={printLabels}
              disabled={generatingLabels || filteredAndSortedProducts.length === 0}
              title="Imprimir etiquetas con código QR"
            >
              {generatingLabels ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Generando...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir Etiquetas
                </>
              )}
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push("/inventario/nuevo")}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Producto
            </Button>
          </div>
        )}
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar por SKU, nombre o marca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400"
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition ${showFilters || categoryFilter || locationFilter
              ? "bg-zinc-100 border-zinc-300 text-zinc-900"
              : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
          >
            <Filter className="w-4 h-4" />
            Filtros
            {(categoryFilter || locationFilter) && (
              <span className="bg-zinc-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {(categoryFilter ? 1 : 0) + (locationFilter ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Filter dropdowns */}
        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
            {/* Category */}
            <div className="relative flex-1">
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Categoría
              </label>
              <div className="relative">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-700"
                >
                  <option value="">Todas las categorías</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Location */}
            {(userRole === "admin" || userRole === "manager") && (
              <div className="relative flex-1">
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Ubicación
                </label>
                <div className="relative">
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-700"
                  >
                    <option value="">Todas las ubicaciones</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Low Stock Toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg hover:bg-zinc-50 transition">
                <input
                  type="checkbox"
                  checked={onlyLowStock}
                  onChange={(e) => setOnlyLowStock(e.target.checked)}
                  className="w-4 h-4 text-zinc-900 border-zinc-300 rounded focus:ring-zinc-500"
                />
                <span className="text-sm font-medium text-zinc-700">
                  Solo bajo stock
                </span>
              </label>
            </div>

            {/* Show Inactive Toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg hover:bg-zinc-50 transition">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="w-4 h-4 text-zinc-900 border-zinc-300 rounded focus:ring-zinc-500"
                />
                <span className="text-sm font-medium text-zinc-700">
                  Mostrar inactivos
                </span>
              </label>
            </div>

            {/* Clear filters */}
            {(categoryFilter || locationFilter || onlyLowStock || showInactive) && (
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setCategoryFilter("");
                    setLocationFilter(
                      userRole === "staff" && userLocationId
                        ? userLocationId
                        : ""
                    );
                    setOnlyLowStock(false);
                    setShowInactive(false);
                  }}
                  className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-2 hover:bg-red-50 rounded-lg transition"
                >
                  Limpiar
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active filter badges */}
        {(activeCategoryFilter || activeLocationFilter) && !showFilters && (
          <div className="flex flex-wrap gap-2">
            {activeCategoryFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700">
                {activeCategoryFilter.name}
                <button
                  onClick={() => setCategoryFilter("")}
                  className="hover:text-zinc-900"
                >
                  ×
                </button>
              </span>
            )}
            {activeLocationFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                <MapPin className="w-3 h-3" />
                {activeLocationFilter.name}
                <button
                  onClick={() =>
                    setLocationFilter(
                      userRole === "staff" && userLocationId
                        ? userLocationId
                        : ""
                    )
                  }
                  className="hover:text-green-900"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
        {filteredAndSortedProducts.length === 0 ? (
          <div className="p-16 text-center">
            <PackageX className="w-16 h-16 text-zinc-300 mx-auto mb-4" />
            <p className="text-lg font-semibold text-zinc-900 mb-2">
              {products.length === 0
                ? "No hay productos registrados"
                : "No se encontraron productos"}
            </p>
            <p className="text-sm text-zinc-500 mb-6">
              {products.length === 0
                ? "Agrega tu primer producto para comenzar"
                : "Intenta con otro término de búsqueda o ajusta los filtros"}
            </p>
            {products.length === 0 && (userRole === "admin" || userRole === "manager") && (
              <Button
                variant="primary"
                onClick={() => router.push("/inventario/nuevo")}
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Primer Producto
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-6 py-4">
                    <button
                      onClick={() => handleSort("name")}
                      className="flex items-center gap-1 hover:text-zinc-900 transition"
                    >
                      Producto
                      {sortField === "name" && (
                        <span className="text-zinc-600">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-6 py-4">
                    <button
                      onClick={() => handleSort("sku")}
                      className="flex items-center gap-1 hover:text-zinc-900 transition"
                    >
                      SKU
                      {sortField === "sku" && (
                        <span className="text-zinc-600">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-6 py-4">
                    Categoría
                  </th>
                  <th className="text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider px-6 py-4">
                    <button
                      onClick={() => handleSort("price")}
                      className="flex items-center gap-1 ml-auto hover:text-zinc-900 transition"
                    >
                      Precio
                      {sortField === "price" && (
                        <span className="text-zinc-600">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider px-6 py-4">
                    <button
                      onClick={() => handleSort("stock")}
                      className="flex items-center gap-1 ml-auto hover:text-zinc-900 transition"
                    >
                      {locationFilter ? "Stock" : "Stock Total"}
                      {sortField === "stock" && (
                        <span className="text-zinc-600">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  </th>
                  {(userRole === "admin" || userRole === "manager") && (
                    <th className="text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-4">
                      Landing
                    </th>
                  )}
                  <th className="text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider px-6 py-4">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {paginatedProducts.map((product) => {
                  const stock = locationFilter
                    ? getStockForLocation(product, locationFilter)
                    : getTotalStock(product);
                  const totalReserved = product.inventory.reduce(
                    (s, inv) => s + (inv.reserved_qty ?? 0), 0
                  );
                  const lowStock = isLowStock(product);

                  const isExpanded = expandedProductId === product.id;

                  return (
                    <React.Fragment key={product.id}>
                      <tr
                        className={`hover:bg-zinc-50 transition-colors group cursor-pointer ${!product.is_active ? 'bg-zinc-50/50' : ''}`}
                        onClick={() => toggleExpanded(product.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {/* Indicador de expandible */}
                            <div className="flex-shrink-0">
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-zinc-900" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-zinc-400 group-hover:text-zinc-600 transition" />
                              )}
                            </div>

                            {/* Imagen del producto */}
                            <div
                              className={`w-12 h-12 bg-gradient-to-br rounded-lg flex items-center justify-center flex-shrink-0 transition-all overflow-hidden ${product.is_active
                                ? 'from-zinc-100 to-zinc-200 group-hover:from-zinc-200 group-hover:to-zinc-300'
                                : 'from-zinc-100 to-zinc-200 opacity-60'
                                }`}
                            >
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className={`w-full h-full object-cover ${!product.is_active ? 'opacity-50 grayscale' : ''}`}
                                />
                              ) : (
                                <Package className={`w-6 h-6 transition ${product.is_active
                                  ? 'text-zinc-400 group-hover:text-zinc-500'
                                  : 'text-zinc-300'
                                  }`} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`text-sm font-semibold truncate ${product.is_active ? 'text-zinc-900' : 'text-zinc-500'
                                  }`}>
                                  {product.name}
                                </p>
                                {!product.is_active && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-500 border border-zinc-300">
                                    Inactivo
                                  </span>
                                )}
                                {product.published_to_landing ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">
                                    <Globe className="w-3 h-3" />
                                    Online
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200">
                                    <Lock className="w-3 h-3" />
                                    Oculto
                                  </span>
                                )}
                                {product.is_active && (() => {
                                  const createdDate = new Date(product.created_at);
                                  const now = new Date();
                                  const hoursDiff = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
                                  return hoursDiff <= 24 ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gold-500 text-white shadow-sm border border-gold-400">
                                      ✨ NUEVO
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                              {product.brand && (
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {product.brand}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-zinc-600 font-mono font-medium">
                            {product.sku}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {product.categories ? (
                            <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 text-zinc-700">
                              {product.categories.name}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-bold text-zinc-900">
                            Bs {product.price.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="flex flex-col items-end gap-1">
                              {stock === 0 ? (
                                <Badge variant="danger" icon>Sin stock</Badge>
                              ) : lowStock ? (
                                <Badge variant="warning" icon>Stock bajo</Badge>
                              ) : (
                                <Badge variant="success" icon>{stock} disponibles</Badge>
                              )}

                              {totalReserved > 0 && (
                                <span className="text-xs text-zinc-500 font-medium mt-1">
                                  🔒 {totalReserved} reservado{totalReserved !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {(userRole === "admin" || userRole === "manager") && (
                          <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleLanding(product);
                                }}
                                disabled={togglingLandingId === product.id || !product.is_active}
                                title={
                                  !product.is_active
                                    ? "Activa el producto primero"
                                    : product.published_to_landing
                                      ? "Ocultar de la tienda online"
                                      : "Publicar en la tienda online"
                                }
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed ${product.published_to_landing
                                  ? "bg-zinc-900"
                                  : "bg-zinc-300"
                                  }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${product.published_to_landing ? "translate-x-6" : "translate-x-1"
                                    } ${togglingLandingId === product.id ? "animate-pulse" : ""}`}
                                />
                              </button>
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            {(userRole === "admin" || userRole === "manager") ? (
                              product.is_active ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/inventario/${product.id}`);
                                    }}
                                    title="Editar producto"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteModal({
                                        isOpen: true,
                                        productId: product.id,
                                        productName: product.name,
                                        isActive: true,
                                      });
                                    }}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    title="Desactivar producto"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReactivate(product.id, product.name);
                                    }}
                                    title="Reactivar producto"
                                  >
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    Reactivar
                                  </Button>
                                  {userRole === "admin" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteModal({
                                          isOpen: true,
                                          productId: product.id,
                                          productName: product.name,
                                          isActive: false,
                                        });
                                      }}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      title="Eliminar permanentemente"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              )
                            ) : (
                              <span className="text-xs text-zinc-500 italic">Vista</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Fila expandible con detalles completos del producto */}
                      {isExpanded && (
                        <tr key={`${product.id}-details`} className="bg-zinc-50">
                          <td colSpan={(userRole === "admin" || userRole === "manager") ? 7 : 6} className="px-8 py-6">
                            <div className="space-y-6">
                              {/* Header con información del producto */}
                              <div className="bg-white rounded-xl p-6 border border-zinc-200 shadow-sm">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  {/* Columna 1: Imagen y datos básicos */}
                                  <div className="flex flex-col items-center gap-4">
                                    <div className="w-32 h-32 bg-zinc-100 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-200">
                                      {product.image_url ? (
                                        <img
                                          src={product.image_url}
                                          alt={product.name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <Package className="w-16 h-16 text-zinc-300" />
                                      )}
                                    </div>
                                    <div className="text-center">
                                      <p className="font-bold text-zinc-900 text-lg">{product.name}</p>
                                      <p className="text-sm text-zinc-500 font-mono mt-1">SKU: {product.sku}</p>
                                      {product.brand && (
                                        <p className="text-sm text-zinc-500 mt-1">{product.brand}</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Columna 2: Precios y margen */}
                                  <div className="space-y-3">
                                    <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
                                      <p className="text-xs text-zinc-500 font-medium mb-1">Precio de Venta</p>
                                      <p className="text-2xl font-bold text-zinc-900">Bs {product.price.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
                                      <p className="text-xs text-zinc-500 font-medium mb-1">Costo</p>
                                      <p className="text-xl font-bold text-zinc-900">Bs {(product.cost ?? 0).toFixed(2)}</p>
                                    </div>
                                    <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
                                      <p className="text-xs text-zinc-500 font-medium mb-1">Margen de Ganancia</p>
                                      <p className="text-xl font-bold text-zinc-900">
                                        {(product.cost ?? 0) > 0 ? `${((product.price - product.cost) / product.cost * 100).toFixed(1)}%` : '—'}
                                      </p>
                                      <p className="text-xs text-zinc-500 mt-1">
                                        +Bs {(product.price - (product.cost ?? 0)).toFixed(2)} por unidad
                                      </p>
                                    </div>
                                  </div>

                                  {/* Columna 3: Variantes disponibles */}
                                  <div className="space-y-3">
                                    {product.sizes && product.sizes.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-zinc-700 mb-2">Tallas Disponibles</p>
                                        <div className="flex flex-wrap gap-2">
                                          {product.sizes.map((size, idx) => (
                                            <span key={`${product.id}-size-${idx}-${size}`} className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-zinc-100 text-zinc-900 border border-zinc-300">
                                              {size}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {product.color && (
                                      <div>
                                        <p className="text-xs font-semibold text-zinc-700 mb-2">Color</p>
                                        <div className="flex flex-wrap gap-2">
                                          <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-zinc-100 text-zinc-900 border border-zinc-300">
                                            {product.color}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                    {product.categories && (
                                      <div>
                                        <p className="text-xs font-semibold text-zinc-700 mb-2">Categoría</p>
                                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-zinc-100 text-zinc-900 border border-zinc-300">
                                          {product.categories.name}
                                        </span>
                                      </div>
                                    )}
                                    {product.description && (
                                      <div>
                                        <p className="text-xs font-semibold text-zinc-700 mb-2">Descripción</p>
                                        <p className="text-xs text-zinc-600">{product.description}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Título de distribución */}
                              <div className="flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-zinc-500" />
                                <h4 className="text-base font-bold text-zinc-900">
                                  Distribución de Stock por Ubicación
                                </h4>
                              </div>

                              {/* Stock por ubicación */}
                              <div className="space-y-4">
                                {(() => {
                                  // Agrupar inventory por location_id
                                  const groupedInventory = product.inventory.reduce((acc, inv) => {
                                    const locId = inv.location_id;
                                    if (!acc[locId]) {
                                      acc[locId] = {
                                        location_id: locId,
                                        location_name: (inv.locations as any)?.name || "Ubicación desconocida",
                                        quantity: 0,
                                        reserved_qty: 0,
                                        min_stock: inv.min_stock,
                                        inventories: []
                                      };
                                    }
                                    acc[locId].quantity += inv.quantity;
                                    acc[locId].reserved_qty += (inv.reserved_qty || 0);
                                    acc[locId].inventories.push(inv);
                                    return acc;
                                  }, {} as Record<string, any>);

                                  return Object.values(groupedInventory).map((groupedInv: any, locIdx: number) => {
                                    const locationStock = groupedInv.quantity;
                                    const locationReserved = groupedInv.reserved_qty as number;
                                    const locationAvailable = Math.max(0, locationStock - locationReserved);

                                    // Agrupar por talla desde los datos reales de inventory
                                    const sizeDistribution = groupedInv.inventories.reduce((acc: Record<string, { qty: number; reserved: number }>, inv: { size: string | null; quantity: number; reserved_qty: number | null }) => {
                                      const size = inv.size || 'Única';
                                      if (!acc[size]) acc[size] = { qty: 0, reserved: 0 };
                                      acc[size].qty += inv.quantity;
                                      acc[size].reserved += (inv.reserved_qty || 0);
                                      return acc;
                                    }, {} as Record<string, { qty: number; reserved: number }>);

                                    return (
                                      <div
                                        key={`${product.id}-location-${groupedInv.location_id}-${locIdx}`}
                                        className="bg-white rounded-xl p-5 border border-zinc-200 shadow-sm hover:shadow-md transition-all"
                                      >
                                        {/* Header de ubicación */}
                                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
                                          <div className="flex items-center gap-3">
                                            <div className="bg-zinc-100 p-2 rounded-lg">
                                              <MapPin className="w-5 h-5 text-zinc-600" />
                                            </div>
                                            <div>
                                              <span className="font-bold text-zinc-900 text-base">
                                                {groupedInv.location_name}
                                              </span>
                                              <p className="text-xs text-zinc-500 mt-0.5">
                                                Stock mínimo: {groupedInv.min_stock} unidades
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {locationReserved > 0 && (
                                              <Badge variant="warning" className="mr-2">🔒 {locationReserved} reservado</Badge>
                                            )}
                                            <div className="text-right">
                                              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-zinc-900 text-white shadow-sm">
                                                <Package className="w-4 h-4" />
                                                {locationStock} total
                                              </span>
                                              {locationReserved > 0 && (
                                                <p className="text-xs font-semibold text-zinc-600 mt-1 text-right">
                                                  ✓ {locationAvailable} disponible
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Distribución por tallas */}
                                        {product.sizes && product.sizes.length > 0 ? (
                                          <div>
                                            <p className="text-xs font-semibold text-zinc-700 mb-3">
                                              Distribución por Tallas:
                                            </p>
                                            <div className="flex flex-wrap gap-3">
                                              {(Object.entries(sizeDistribution) as [string, { qty: number; reserved: number }][]).map(([size, { qty, reserved }]) => {
                                                const available = Math.max(0, qty - reserved);
                                                const isZero = qty === 0;
                                                const hasReservation = reserved > 0;
                                                return (
                                                  <div
                                                    key={`${product.id}-${groupedInv.location_id}-${size}`}
                                                    className={`inline-flex flex-col items-center gap-1 px-4 py-2.5 rounded-lg border-2 transition-all ${isZero
                                                      ? 'bg-gray-100 border-gray-300 opacity-60'
                                                      : available < 2
                                                        ? 'bg-yellow-50 border-yellow-400 hover:bg-yellow-100 hover:shadow-md'
                                                        : 'bg-green-50 border-green-400 hover:bg-green-100 hover:shadow-md'
                                                      }`}
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      <span className={`text-sm font-bold ${isZero ? 'text-gray-500 line-through' : 'text-gray-800'
                                                        }`}>
                                                        Talla {size}
                                                      </span>
                                                      <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2.5 rounded-full text-sm font-bold shadow-sm ${isZero
                                                        ? 'bg-gray-400 text-white'
                                                        : available < 2
                                                          ? 'bg-yellow-600 text-white'
                                                          : 'bg-green-600 text-white'
                                                        }`}>
                                                        {qty}
                                                      </span>
                                                    </div>
                                                    {hasReservation && (
                                                      <div className="flex items-center gap-1">
                                                        <span className="text-xs text-amber-600 font-medium">
                                                          🔒{reserved} · ✓{available} disp.
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="text-center py-2">
                                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-zinc-100 text-zinc-700 border-2 border-zinc-300">
                                              <Package className="w-4 h-4" />
                                              Producto sin variantes de talla
                                            </span>
                                          </div>
                                        )}

                                        {/* Alerta de bajo stock — basada en disponible, no total */}
                                        {locationAvailable < groupedInv.min_stock && (
                                          <div className="mt-4 flex items-center gap-2 text-sm text-amber-800 bg-amber-50 px-4 py-3 rounded-lg border-2 border-amber-300 shadow-sm">
                                            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                            <span className="font-semibold">
                                              ⚠️ Stock bajo - Mínimo recomendado: {groupedInv.min_stock} unidades
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>

                              {/* Total general */}
                              <div className="bg-zinc-900 rounded-xl p-5 text-white shadow-lg">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="bg-white/10 p-2 rounded-lg border border-white/20">
                                      <Package className="w-6 h-6" />
                                    </div>
                                    <span className="font-bold text-base">STOCK TOTAL EN TODAS LAS UBICACIONES</span>
                                  </div>
                                  <span className="text-3xl font-bold">
                                    {getTotalStock(product)} unidades
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filteredAndSortedProducts.length > itemsPerPage && (
          <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-600">
                Mostrando{" "}
                <span className="font-semibold text-zinc-900">
                  {(currentPage - 1) * itemsPerPage + 1}
                </span>
                {" - "}
                <span className="font-semibold text-zinc-900">
                  {Math.min(
                    currentPage * itemsPerPage,
                    filteredAndSortedProducts.length
                  )}
                </span>
                {" de "}
                <span className="font-semibold text-zinc-900">
                  {filteredAndSortedProducts.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      // Show first, last, current, and pages around current
                      return (
                        page === 1 ||
                        page === totalPages ||
                        Math.abs(page - currentPage) <= 1
                      );
                    })
                    .map((page, idx, arr) => {
                      // Add ellipsis
                      const prevPage = arr[idx - 1];
                      const showEllipsis = prevPage && page - prevPage > 1;

                      return (
                        <React.Fragment key={`page-wrapper-${page}`}>
                          {showEllipsis && (
                            <span key={`ellipsis-${page}`} className="px-2 text-zinc-400">...</span>
                          )}
                          <Button
                            key={`page-${page}`}
                            variant={currentPage === page ? "primary" : "ghost"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className="w-10 h-10 p-0"
                          >
                            {page}
                          </Button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer with stock breakdown by location */}
        {!locationFilter && filteredAndSortedProducts.length > 0 && (
          <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50">
            <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-600">
              <span className="font-semibold text-zinc-700">Stock por ubicación:</span>
              {locations.map((loc) => {
                const locStock = filteredAndSortedProducts.reduce(
                  (sum, p) => sum + getStockForLocation(p, loc.id),
                  0
                );
                return (
                  <button
                    key={loc.id}
                    onClick={() => {
                      setLocationFilter(loc.id);
                      setShowFilters(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white hover:text-zinc-900 transition-all hover:shadow-sm"
                  >
                    <MapPin className="w-4 h-4" />
                    <span className="font-medium">{loc.name}:</span>
                    <span className="font-bold">{locStock}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Quick View Modal */}
      {quickViewProduct && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <ProductQuickView
          product={quickViewProduct as any}
          isOpen={!!quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
          onEdit={(product: { id: string }) => {
            router.push(`/inventario/${product.id}`);
          }}
        />
      )}

      {/* Delete/Deactivate Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() =>
          setDeleteModal({ isOpen: false, productId: null, productName: "", isActive: true })
        }
        onConfirm={async () => {
          if (!deleteModal.productId) return;

          setIsDeleting(true);
          const supabase = createClient();

          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              toast.error("No se pudo obtener el usuario");
              setIsDeleting(false);
              return;
            }

            if (deleteModal.isActive) {
              // DESACTIVAR (soft delete)


              // Obtener el producto primero para tener su organization_id
              const { data: productData } = await supabase
                .from("products")
                .select("organization_id")
                .eq("id", deleteModal.productId)
                .single();

              if (!productData) {
                toast.error("No se encontró el producto");
                setIsDeleting(false);
                return;
              }

              const { error: productError } = await supabase
                .from("products")
                .update({ is_active: false })
                .eq("id", deleteModal.productId)
                .eq("organization_id", productData.organization_id);

              if (productError) {
                console.error('Error desactivando:', productError);
                toast.error(`Error al desactivar: ${productError.message || JSON.stringify(productError)}`);
                setIsDeleting(false);
                return;
              }

              const { error: auditError } = await supabase.from("audit_log").insert({
                organization_id: productData.organization_id,
                user_id: user.id,
                action: "delete",
                table_name: "products",
                record_id: deleteModal.productId,
                old_data: { is_active: true, product_name: deleteModal.productName },
                new_data: {
                  is_active: false,
                  product_name: deleteModal.productName,
                  note: deleteNote || null
                },
                ip_address: null,
              });

              if (auditError) {
                console.warn('Error en auditoría (no crítico):', auditError);
              }

              toast.success("Producto desactivado correctamente");
              setDeleteNote(""); // Limpiar nota
            } else {
              // ELIMINAR PERMANENTEMENTE


              // Verificar si tiene ventas
              const { data: sales, error: salesCheckError } = await supabase
                .from("sale_items")
                .select("id")
                .eq("product_id", deleteModal.productId)
                .limit(1);

              if (salesCheckError) {
                console.error('Error verificando ventas:', salesCheckError);
                toast.error("Error al verificar ventas del producto");
                setIsDeleting(false);
                return;
              }

              if (sales && sales.length > 0) {
                toast.error("No se puede eliminar: el producto tiene ventas registradas");
                setIsDeleting(false);
                return;
              }

              // Eliminar inventory primero

              const { error: invError } = await supabase
                .from("inventory")
                .delete()
                .eq("product_id", deleteModal.productId);

              if (invError) {
                console.error('Error eliminando inventory:', invError);
                toast.error(`Error al eliminar inventory: ${invError.message || 'Error desconocido'}`);
                setIsDeleting(false);
                return;
              }

              // Eliminar producto

              const { error: deleteError } = await supabase
                .from("products")
                .delete()
                .eq("id", deleteModal.productId);

              if (deleteError) {
                console.error('Error eliminando producto:', deleteError);
                toast.error(`Error al eliminar producto: ${deleteError.message || 'Error desconocido'}`);
                setIsDeleting(false);
                return;
              }

              // Registrar auditoría
              const { error: auditError } = await supabase.from("audit_log").insert({
                organization_id: initialProducts[0]?.organization_id || "",
                user_id: user.id,
                action: "delete",
                table_name: "products",
                record_id: deleteModal.productId,
                old_data: {
                  product_name: deleteModal.productName,
                  permanently_deleted: true,
                  note: deleteNote || null
                },
                new_data: null,
                ip_address: null,
              });

              if (auditError) {
                console.warn('Error en auditoría (no crítico):', auditError);
              }

              toast.success("Producto eliminado permanentemente");
              setDeleteNote(""); // Limpiar nota
            }

            setDeleteModal({ isOpen: false, productId: null, productName: "", isActive: true });
            router.refresh();
          } catch (error: any) {
            console.error("Error completo:", error);
            toast.error(error?.message || "Error inesperado al procesar la operación");
          } finally {
            setIsDeleting(false);
          }
        }}
        title={deleteModal.isActive ? "¿Desactivar producto?" : "⚠️ ¿Eliminar PERMANENTEMENTE?"}
        message={deleteModal.isActive
          ? `¿Estás seguro de que deseas desactivar "${deleteModal.productName}"? El producto dejará de aparecer en el inventario y en el punto de venta, pero se mantendrá en el historial de ventas.`
          : `⚠️ ADVERTENCIA: Esta acción NO se puede deshacer. ¿Estás seguro de que deseas eliminar PERMANENTEMENTE "${deleteModal.productName}"? Se eliminarán todos los registros de inventory. Las ventas registradas se mantendrán pero sin referencia al producto.`
        }
        confirmText={deleteModal.isActive ? "Desactivar" : "Eliminar Permanentemente"}
        cancelText="Cancelar"
        variant="danger"
        loading={isDeleting}
        showNoteInput={true}
        noteValue={deleteNote}
        onNoteChange={setDeleteNote}
        notePlaceholder={deleteModal.isActive ? "Ej: Se acabó stock, Producto descontinuado..." : "Ej: Producto no vendido, Error de registro..."}
      />
    </div>
  );
}

