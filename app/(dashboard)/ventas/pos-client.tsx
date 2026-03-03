"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import Confetti from "react-confetti";
import { playBeep, playCashRegisterSound } from "@/lib/utils/sounds";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Banknote,
  QrCode,
  CreditCard,
  CheckCircle,
  Package,
  PackageSearch,
  X,
  Scan,
  Printer,
  RotateCcw,
  Percent,
  MapPin,
  SlidersHorizontal,
  ChevronDown,
  Store,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

// ── Types ────────────────────────────────────────────────────────────────────


interface POSProduct {
  id: string;
  sku: string;
  name: string;
  sizes: string[];
  price: number;
  image_url: string | null;
  brand: string | null;
  categories: { name: string } | null;
  inventory: { quantity: number; location_id: string; size: string; color: string | null }[];
}

interface CartItem {
  product: POSProduct;
  quantity: number;
  size: string;
  color: string;
}

type PaymentMethod = "cash" | "qr" | "card";

interface POSClientProps {
  initialProducts: POSProduct[];
  categories: { id: string; name: string }[];
  profileId: string;
  organizationId: string;
  locationId: string | null;
  userRole: string;
  locations: { id: string; name: string }[];
}

// ── Payment config ───────────────────────────────────────────────────────────

const paymentMethods: {
  value: PaymentMethod;
  label: string;
  icon: typeof Banknote;
  color: string;
  bgColor: string;
}[] = [
    {
      value: "cash",
      label: "Efectivo",
      icon: Banknote,
      color: "text-green-600",
      bgColor: "bg-green-500",
    },
    {
      value: "qr",
      label: "QR",
      icon: QrCode,
      color: "text-blue-600",
      bgColor: "bg-blue-500",
    },
    {
      value: "card",
      label: "Tarjeta",
      icon: CreditCard,
      color: "text-purple-600",
      bgColor: "bg-purple-500",
    },
  ];

// ── Component ────────────────────────────────────────────────────────────────

export default function POSClient({
  initialProducts,
  categories,
  profileId,
  organizationId,
  locationId,
  userRole,
  locations,
}: POSClientProps) {
  const [products, setProducts] = useState<POSProduct[]>(initialProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [posLocation, setPosLocation] = useState<string | null>(
    locationId || ((userRole === "admin" || userRole === "manager") && locations.length > 0 ? locations[0].id : null)
  );
  const [sizeFilter, setSizeFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<"with" | "all" | "low">("with");
  const [sortBy, setSortBy] = useState<"name" | "price_asc" | "price_desc" | "stock">("name");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSale, setLastSale] = useState<{
    total: number;
    items: number;
    paymentMethod: PaymentMethod;
    subtotal: number;
    discount: number;
    customerName: string;
    cartItems: CartItem[];
    saleId: string;
    date: string;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showQRPayment, setShowQRPayment] = useState(false);
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<POSProduct | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [pendingSale, setPendingSale] = useState<{
    subtotal: number;
    discount: number;
    total: number;
    items: number;
    cartItems: CartItem[];
  } | null>(null);

  // Sincronizar productos cuando cambian desde el servidor (cambio de ubicación)
  useEffect(() => {
    setProducts(initialProducts);
    setCart([]);
  }, [initialProducts]);

  // Detectar producto desde QR code en URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("product");

    if (productId && products.length > 0) {
      const product = products.find((p) => p.id === productId);
      if (product) {
        const stock = getStock(product);
        if (stock > 0) {
          addToCart(product);
          toast.success(`${product.name} agregado al carrito desde QR`);
          // Limpiar URL
          window.history.replaceState({}, "", "/ventas");
        } else {
          toast.error(`${product.name} no tiene stock disponible`);
        }
      }
    }
  }, [products]);

  // ── Filtered products ──────────────────────────────────────────────────────

  const availableSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    products.forEach(p => {
      if (p.sizes) p.sizes.forEach((s: string) => sizeSet.add(s));
      p.inventory.forEach(i => { if (i.size) sizeSet.add(i.size); });
    });
    return Array.from(sizeSet).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(searchLower) ||
        p.sku.toLowerCase().includes(searchLower) ||
        (p.brand && p.brand.toLowerCase().includes(searchLower));

      const matchesCategory =
        !categoryFilter || p.categories?.name === categoryFilter;

      // Stock at selected location
      const locationStock = posLocation
        ? p.inventory.filter(i => i.location_id === posLocation).reduce((sum, i) => sum + (i.quantity || 0), 0)
        : p.inventory.reduce((sum, i) => sum + (i.quantity || 0), 0);

      // Size filter: product has that size with stock > 0
      const matchesSize = !sizeFilter || p.inventory.some(i =>
        i.size === sizeFilter &&
        (i.quantity || 0) > 0 &&
        (!posLocation || i.location_id === posLocation)
      );

      // Stock filter
      let matchesStock = true;
      if (stockFilter === "with") matchesStock = locationStock > 0;
      else if (stockFilter === "low") matchesStock = locationStock > 0 && locationStock <= 5;

      return matchesSearch && matchesCategory && matchesSize && matchesStock;
    });

    // Sort
    if (sortBy === "price_asc") {
      result = [...result].sort((a, b) => a.price - b.price);
    } else if (sortBy === "price_desc") {
      result = [...result].sort((a, b) => b.price - a.price);
    } else if (sortBy === "stock") {
      result = [...result].sort((a, b) => {
        const stockA = posLocation
          ? a.inventory.filter(i => i.location_id === posLocation).reduce((sum, i) => sum + i.quantity, 0)
          : a.inventory.reduce((sum, i) => sum + i.quantity, 0);
        const stockB = posLocation
          ? b.inventory.filter(i => i.location_id === posLocation).reduce((sum, i) => sum + i.quantity, 0)
          : b.inventory.reduce((sum, i) => sum + i.quantity, 0);
        return stockB - stockA;
      });
    }

    return result;
  }, [products, search, categoryFilter, posLocation, sizeFilter, stockFilter, sortBy]);

  const isAdminOrManager = userRole === "admin" || userRole === "manager";
  const hasActiveFilters =
    search !== "" ||
    categoryFilter !== "" ||
    (isAdminOrManager && posLocation !== null) ||
    sizeFilter !== "" ||
    stockFilter !== "with" ||
    sortBy !== "name";

  // ── Cart operations ────────────────────────────────────────────────────────

  // Obtener la ubicación efectiva para vender (la seleccionada en POS, o la primera disponible)
  const effectiveLocationId = posLocation || (locations.length > 0 ? locations[0].id : null);

  const getStock = (product: POSProduct): number => {
    if (posLocation) {
      return product.inventory
        .filter((i) => i.location_id === posLocation)
        .reduce((sum, i) => sum + (i.quantity || 0), 0);
    }
    return product.inventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
  };

  // Stock disponible para una talla específica en la ubicación efectiva
  const getSizeStock = (product: POSProduct, size: string): number => {
    return product.inventory
      .filter((i) => {
        if (posLocation && i.location_id !== posLocation) return false;
        if (size && i.size !== size) return false;
        return true;
      })
      .reduce((sum, i) => sum + (i.quantity || 0), 0);
  };

  const getCartQuantity = (productId: string): number => {
    return cart
      .filter((item) => item.product.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const addToCart = (product: POSProduct, size?: string, color?: string) => {
    // Si el producto tiene tallas y no se especificó una → abrir modal
    if ((product.sizes?.length ?? 0) > 0 && !size) {
      setSelectedProductForVariant(product);
      setSelectedSize("");
      setSelectedColor("");
      setShowVariantSelector(true);
      return;
    }

    const effectiveSize = size ?? "";
    const effectiveColor = color ?? "";

    // Verificar stock para esta talla en la ubicación efectiva
    const variantStock = product.inventory
      .filter((inv) => {
        if (effectiveLocationId && inv.location_id !== effectiveLocationId) return false;
        if (effectiveSize && inv.size !== effectiveSize) return false;
        return true;
      })
      .reduce((sum, inv) => sum + (inv.quantity || 0), 0);

    const currentQty = cart
      .filter((item) => item.product.id === product.id && item.size === effectiveSize && item.color === effectiveColor)
      .reduce((sum, item) => sum + item.quantity, 0);

    if (currentQty >= variantStock) {
      toast.error(effectiveSize
        ? `No hay suficiente stock de talla ${effectiveSize}`
        : `No hay suficiente stock`
      );
      return;
    }

    // Play beep sound
    playBeep();

    setCart((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && item.size === effectiveSize && item.color === effectiveColor
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.size === effectiveSize && item.color === effectiveColor
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, size: effectiveSize, color: effectiveColor }];
    });
  };

  const updateQuantity = (productId: string, size: string, color: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId, size, color);
      return;
    }

    const item = cart.find((i) => i.product.id === productId && i.size === size && i.color === color);
    if (!item) return;

    const variantStock = item.product.inventory
      .filter((inv) => {
        if (effectiveLocationId && inv.location_id !== effectiveLocationId) return false;
        if (size && inv.size !== size) return false;
        return true;
      })
      .reduce((sum, inv) => sum + (inv.quantity || 0), 0);

    if (newQty > variantStock) {
      toast.error(size
        ? `No hay suficiente stock de talla ${size}`
        : `No hay suficiente stock`
      );
      return;
    }

    setCart((prev) =>
      prev.map((i) =>
        i.product.id === productId && i.size === size && i.color === color
          ? { ...i, quantity: newQty }
          : i
      )
    );
  };

  const removeFromCart = (productId: string, size: string, color: string) => {
    setCart((prev) =>
      prev.filter((item) => !(item.product.id === productId && item.size === size && item.color === color))
    );
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName("");
    setDiscount(0);
  };

  // ── Calculations ───────────────────────────────────────────────────────────

  const subtotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const discountAmount = (subtotal * discount) / 100;
  const total = subtotal - discountAmount;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Helper para formatear moneda
  const formatCurrency = (amount: number) => {
    return `Bs ${new Intl.NumberFormat("es-BO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)}`;
  };

  // ── Finalize sale ──────────────────────────────────────────────────────────

  const finalizeSale = async () => {
    if (cart.length === 0) {
      toast.error("El carrito está vacío");
      return;
    }

    if (!effectiveLocationId) {
      toast.error("Debes seleccionar una ubicación para vender");
      return;
    }

    // Si el método de pago es QR, mostrar modal de QR primero
    if (paymentMethod === "qr") {
      setPendingSale({
        subtotal,
        discount: discountAmount,
        total,
        items: totalItems,
        cartItems: [...cart],
      });
      setShowQRPayment(true);
      setShowMobileCart(false); // Cerrar carrito móvil si está abierto
      return;
    }

    // Para otros métodos de pago, procesar directamente
    await processSale();
  };

  const handleNewSale = () => {
    setShowSuccessModal(false);
    setLastSale(null);
  };

  // Procesar venta (después de confirmar pago QR o directamente para otros métodos)
  const processSale = async () => {
    setProcessing(true);
    setShowQRPayment(false);

    try {
      const supabase = createClient();

      // 1. Create sale record

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          organization_id: organizationId,
          location_id: effectiveLocationId,
          sold_by: profileId,
          customer_name: customerName || null,
          subtotal,
          discount: discountAmount,
          tax: 0,
          total,
          payment_method: paymentMethod,
          canal: "fisico" as const,
        })
        .select()
        .single();

      if (saleError) {
        console.error("[finalizeSale] Error creating sale:", saleError);
        toast.error(`Error al crear venta: ${saleError.message}`);
        setProcessing(false);
        return;
      }


      // 2. Create sale items (con talla y ubicación)
      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        product_id: item.product.id,
        location_id: effectiveLocationId,
        size: item.size || null,
        color: item.color || null,
        quantity: item.quantity,
        unit_price: item.product.price,
        subtotal: item.product.price * item.quantity,
      }));


      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems);

      if (itemsError) {
        console.error("[finalizeSale] Error creating sale_items:", itemsError);
        toast.error(`Error al crear ítems: ${itemsError.message}`);
        setProcessing(false);
        return;
      }


      // 3. Actualizar inventario (por talla y ubicación)
      for (const item of cart) {
        let saleLocationId = effectiveLocationId;

        // Si no hay ubicación fija en POS, buscar la ubicación con más stock para esta talla
        if (!posLocation) {
          let autoQuery = supabase
            .from("inventory")
            .select("quantity, location_id")
            .eq("product_id", item.product.id)
            .gte("quantity", item.quantity)
            .order("quantity", { ascending: false })
            .limit(1);

          if (item.size) autoQuery = autoQuery.eq("size", item.size);
          if (item.color) {
            autoQuery = autoQuery.eq("color", item.color);
          }

          const { data: invOptions } = await autoQuery;
          if (invOptions && invOptions.length > 0) {
            saleLocationId = invOptions[0].location_id;
          }
        }



        // Obtener cantidad actual
        let fetchQuery = supabase
          .from("inventory")
          .select("quantity")
          .eq("product_id", item.product.id)
          .eq("location_id", saleLocationId!);

        if (item.size) fetchQuery = fetchQuery.eq("size", item.size);
        if (item.color) {
          fetchQuery = fetchQuery.eq("color", item.color);
        }

        const { data: currentInv, error: fetchError } = await fetchQuery.maybeSingle();

        if (fetchError || !currentInv) {
          console.error("[finalizeSale] Error fetching inventory for", item.product.name, fetchError);
          throw new Error(`Error al obtener inventario de ${item.product.name}${item.size ? ` (talla ${item.size})` : ""}`);
        }

        const newQuantity = currentInv.quantity - item.quantity;

        if (newQuantity < 0) {
          throw new Error(`Stock insuficiente para ${item.product.name}${item.size ? ` (talla ${item.size})` : ""}`);
        }

        // Actualizar cantidad
        let updateQuery = supabase
          .from("inventory")
          .update({ quantity: newQuantity })
          .eq("product_id", item.product.id)
          .eq("location_id", saleLocationId!);

        if (item.size) updateQuery = updateQuery.eq("size", item.size);
        if (item.color) {
          updateQuery = updateQuery.eq("color", item.color);
        }

        const { error: invError } = await updateQuery;

        if (invError) {
          console.error("[finalizeSale] Error updating inventory for", item.product.name, invError);
          toast.error(`Error al descontar stock de ${item.product.name}`);
          throw new Error(`Error al actualizar inventario de ${item.product.name}${item.size ? ` (talla ${item.size})` : ""}`);
        }


      }

      // Show success modal
      setLastSale({
        total,
        items: totalItems,
        paymentMethod,
        subtotal,
        discount: discountAmount,
        customerName: customerName || "Cliente General",
        cartItems: [...cart],
        saleId: sale.id,
        date: new Date().toISOString(),
      });

      playCashRegisterSound();
      setShowSuccessModal(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      clearCart();
      setPendingSale(null);
    } catch (error: any) {
      console.error("Error al procesar venta:", error);
      toast.error(error.message || "Error inesperado al procesar la venta");
    } finally {
      setProcessing(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("");
    if (isAdminOrManager) setPosLocation(null);
    setSizeFilter("");
    setStockFilter("with");
    setSortBy("name");
  };

  const generateTicket = async () => {
    if (!lastSale) return;

    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [80, 200], // Formato típico de ticket térmico (80mm ancho)
      });

      const pageWidth = 80;
      let yPos = 10;

      // Encabezado
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("LUKESS", pageWidth / 2, yPos, { align: "center" });
      yPos += 6;

      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text("HOME INVENTORY", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      // Línea separadora
      pdf.setLineWidth(0.5);
      pdf.line(5, yPos, pageWidth - 5, yPos);
      yPos += 6;

      // Información de la venta
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");

      const saleDate = new Date(lastSale.date);
      const dateStr = saleDate.toLocaleDateString("es-BO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const timeStr = saleDate.toLocaleTimeString("es-BO", {
        hour: "2-digit",
        minute: "2-digit",
      });

      pdf.text(`Fecha: ${dateStr}`, 5, yPos);
      yPos += 4;
      pdf.text(`Hora: ${timeStr}`, 5, yPos);
      yPos += 4;
      pdf.text(`Ticket: ${lastSale.saleId.slice(0, 8).toUpperCase()}`, 5, yPos);
      yPos += 4;
      pdf.text(`Cliente: ${lastSale.customerName}`, 5, yPos);
      yPos += 4;
      pdf.text(
        `Pago: ${paymentMethods.find((pm) => pm.value === lastSale.paymentMethod)?.label}`,
        5,
        yPos
      );
      yPos += 6;

      // Línea separadora
      pdf.line(5, yPos, pageWidth - 5, yPos);
      yPos += 6;

      // Productos
      pdf.setFont("helvetica", "bold");
      pdf.text("PRODUCTOS", 5, yPos);
      yPos += 5;

      pdf.setFont("helvetica", "normal");
      lastSale.cartItems.forEach((item) => {
        const productName = item.product.name;
        const qty = item.quantity;
        const price = item.product.price;
        const itemTotal = qty * price;

        // Nombre del producto (puede ser largo, lo cortamos si es necesario)
        const maxNameLength = 30;
        const displayName =
          productName.length > maxNameLength
            ? productName.substring(0, maxNameLength) + "..."
            : productName;

        pdf.text(displayName, 5, yPos);
        yPos += 4;

        pdf.text(
          `${qty} x Bs ${price.toFixed(2)} = Bs ${itemTotal.toFixed(2)}`,
          5,
          yPos
        );
        yPos += 5;
      });

      // Línea separadora
      pdf.line(5, yPos, pageWidth - 5, yPos);
      yPos += 6;

      // Totales
      pdf.setFont("helvetica", "normal");
      pdf.text("Subtotal:", 5, yPos);
      pdf.text(`Bs ${lastSale.subtotal.toFixed(2)}`, pageWidth - 5, yPos, {
        align: "right",
      });
      yPos += 5;

      if (lastSale.discount > 0) {
        pdf.text("Descuento:", 5, yPos);
        pdf.text(`-Bs ${lastSale.discount.toFixed(2)}`, pageWidth - 5, yPos, {
          align: "right",
        });
        yPos += 5;
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text("TOTAL:", 5, yPos);
      pdf.text(`Bs ${lastSale.total.toFixed(2)}`, pageWidth - 5, yPos, {
        align: "right",
      });
      yPos += 8;

      // Línea separadora
      pdf.setLineWidth(0.5);
      pdf.line(5, yPos, pageWidth - 5, yPos);
      yPos += 6;

      // Pie de página
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text("¡Gracias por su compra!", pageWidth / 2, yPos, {
        align: "center",
      });
      yPos += 5;
      pdf.text("Vuelva pronto", pageWidth / 2, yPos, { align: "center" });

      // Guardar PDF
      const filename = `ticket-${lastSale.saleId.slice(0, 8)}-${dateStr.replace(/\//g, "-")}.pdf`;
      pdf.save(filename);
      toast.success("Ticket generado correctamente");
    } catch (error) {
      console.error("Error generando ticket:", error);
      toast.error("Error al generar el ticket");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Confetti con colores bolivianos */}
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={800}
          colors={[
            "#DA291C", // Rojo boliviano
            "#FFD700", // Amarillo/dorado
            "#007A3D", // Verde boliviano
            "#FFFFFF", // Blanco
            "#FF6B6B", // Rojo claro
            "#4CAF50", // Verde claro
          ]}
          gravity={0.3}
          wind={0.01}
        />
      )}

      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)] bg-zinc-50 rounded-xl relative">
        {/* Bloqueador de Localización para Admins */}
        {!posLocation && isAdminOrManager && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl p-4">
            <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-zinc-200 p-8 text-center animate-in fade-in zoom-in duration-300">
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Store className="w-10 h-10 text-purple-600" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-3">
                Selecciona un Puesto
              </h2>
              <p className="text-zinc-500 mb-8 leading-relaxed">
                Para registrar una venta y descontar correctamente el inventario, selecciona el puesto físico desde donde estás operando.
              </p>
              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => setPosLocation(loc.id)}
                    className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-zinc-100 hover:border-purple-500 hover:bg-purple-50 transition-all group focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-100 group-hover:bg-white flex items-center justify-center transition-colors shadow-sm text-zinc-500 group-hover:text-purple-600">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <span className="font-bold text-zinc-900 group-hover:text-purple-900">{loc.name}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-purple-600 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ LEFT COLUMN: Product Grid ═══ */}
        <div className="flex-1 lg:w-[60%] flex flex-col min-w-0 overflow-hidden px-1">
          {/* ─── Filter Bar ─── */}
          <div className="space-y-3 mb-4 flex-shrink-0">
            {/* ROW 1: Search + Location selector */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Scan className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar producto o SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 placeholder:text-gray-400 shadow-sm"
                />
              </div>
              {/* Location selector — admin/manager only */}
              {isAdminOrManager && (
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 pointer-events-none" />
                  <select
                    value={posLocation || ""}
                    onChange={(e) => setPosLocation(e.target.value || null)}
                    className="pl-9 pr-8 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition text-gray-700 appearance-none cursor-pointer min-w-[160px] shadow-sm"
                  >
                    <option value="">Todos los puestos</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* ROW 2: Category pills + product count */}
            <div className="flex items-center gap-2">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
                <button
                  onClick={() => setCategoryFilter("")}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${!categoryFilter
                    ? "bg-zinc-900 text-white shadow-md"
                    : "bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                >
                  Todos
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(categoryFilter === cat.name ? "" : cat.name)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${categoryFilter === cat.name
                      ? "bg-zinc-900 text-white shadow-md"
                      : "bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                      }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
              <span className="text-xs text-zinc-500 font-semibold whitespace-nowrap bg-zinc-100 px-2.5 py-1 rounded-lg flex-shrink-0">
                {filteredProducts.length} productos
              </span>
            </div>

            {/* ROW 3: Más filtros toggle */}
            <div>
              <button
                onClick={() => setShowMoreFilters(!showMoreFilters)}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border-2 border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-all"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Más filtros
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showMoreFilters ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Collapsible extra filters */}
            {showMoreFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  className="px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none transition appearance-none"
                >
                  <option value="">Todas las tallas</option>
                  {availableSizes.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as "with" | "all" | "low")}
                  className="px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition appearance-none"
                >
                  <option value="with">Con stock</option>
                  <option value="all">Todos (incl. sin stock)</option>
                  <option value="low">Stock bajo (≤ 5)</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "name" | "price_asc" | "price_desc" | "stock")}
                  className="px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition appearance-none"
                >
                  <option value="name">Nombre A-Z</option>
                  <option value="price_asc">Precio: menor a mayor</option>
                  <option value="price_desc">Precio: mayor a menor</option>
                  <option value="stock">Mayor stock</option>
                </select>
              </div>
            )}

            {/* Active filter chips */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 flex-wrap">
                {search && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    🔍 &quot;{search}&quot;
                    <button onClick={() => setSearch("")} className="ml-0.5 hover:text-blue-900 flex items-center">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {isAdminOrManager && posLocation && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full border border-purple-200">
                    📍 {locations.find(l => l.id === posLocation)?.name || posLocation}
                    <button onClick={() => setPosLocation(null)} className="ml-0.5 hover:text-purple-900 flex items-center">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {categoryFilter && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-100 text-teal-700 text-xs font-semibold rounded-full border border-teal-200">
                    {categoryFilter}
                    <button onClick={() => setCategoryFilter("")} className="ml-0.5 hover:text-teal-900 flex items-center">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {sizeFilter && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                    Talla: {sizeFilter}
                    <button onClick={() => setSizeFilter("")} className="ml-0.5 hover:text-green-900 flex items-center">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {stockFilter !== "with" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
                    {stockFilter === "all" ? "Todos los stocks" : "Stock bajo"}
                    <button onClick={() => setStockFilter("with")} className="ml-0.5 hover:text-amber-900 flex items-center">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {sortBy !== "name" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded-full border border-gray-300">
                    {sortBy === "price_asc" ? "Precio ↑" : sortBy === "price_desc" ? "Precio ↓" : "Mayor stock"}
                    <button onClick={() => setSortBy("name")} className="ml-0.5 hover:text-gray-900 flex items-center">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={clearFilters}
                  className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline"
                >
                  Limpiar todo
                </button>
              </div>
            )}
          </div>

          {/* Products grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {!posLocation && isAdminOrManager ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-4 bg-amber-50 rounded-2xl border border-amber-200 mx-1 mt-2">
                <MapPin className="w-12 h-12 text-amber-500 mb-3" />
                <p className="text-base font-bold text-amber-900 mb-1">
                  Puesto no seleccionado
                </p>
                <p className="text-sm text-amber-700 max-w-sm">
                  Para realizar una venta, seleccione un puesto específico en la parte superior.
                </p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                <PackageSearch className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-zinc-900 mb-1">
                  No se encontraron productos
                </p>
                <p className="text-xs text-zinc-500 mb-4">
                  Intenta ajustar los filtros de búsqueda
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 text-sm font-semibold text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-xl hover:bg-zinc-100 transition"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pb-24 lg:pb-0 pt-3 px-1">
                {filteredProducts.map((product) => {
                  const stock = getStock(product);
                  const inCart = getCartQuantity(product.id);
                  const available = stock - inCart;

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={available <= 0}
                      className={`relative bg-white rounded-2xl border p-3 sm:p-4 text-left transition-all duration-200 group overflow-visible ${available <= 0
                        ? "border-zinc-200 opacity-50 cursor-not-allowed"
                        : "border-zinc-200 hover:border-gold-500 hover:shadow-md cursor-pointer transform hover:-translate-y-1 active:scale-95"
                        }`}
                      style={{
                        animation: `fadeIn 0.3s ease-out ${(filteredProducts.indexOf(product) % 20) * 30}ms both`,
                      }}
                    >
                      {/* Image placeholder */}
                      <div className="w-full aspect-square bg-zinc-100 rounded-xl mb-3 flex items-center justify-center overflow-hidden transition-all group-hover:bg-zinc-200">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-10 h-10 text-zinc-300 group-hover:text-zinc-500 transition" />
                        )}
                      </div>

                      {/* Info */}
                      <p className="text-xs text-gray-400 font-mono mb-1">
                        {product.sku}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 truncate mb-1 line-clamp-2 min-h-[2.5rem]">
                        {product.name}
                      </p>
                      {product.brand && (
                        <p className="text-xs text-gray-500 truncate mb-2">
                          {product.brand}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-base font-bold text-blue-600">
                          Bs {product.price.toFixed(2)}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded-lg ${available <= 0
                            ? "bg-red-100 text-red-700"
                            : available <= 5
                              ? "bg-amber-100 text-amber-700"
                              : "bg-green-100 text-green-700"
                            }`}
                        >
                          {available <= 0
                            ? "✗ Sin stock"
                            : available <= 5
                              ? `⚠ Últimas ${available}`
                              : "✓ En stock"}
                        </span>
                      </div>

                      {/* In cart badge */}
                      {inCart > 0 && (
                        <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg animate-bounce">
                          {inCart}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: Cart ═══ */}
        <div className="hidden lg:flex lg:w-[40%] bg-white rounded-2xl border border-zinc-200 border-l shadow-xl flex-col overflow-hidden">
          {/* Cart header */}
          <div className="px-6 py-4 bg-zinc-950 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6 text-white" />
              <h2 className="font-bold text-white text-lg">Carrito</h2>
              {totalItems > 0 && (
                <span className="bg-white text-zinc-950 text-sm font-bold px-3 py-1 rounded-full shadow-sm">
                  {totalItems}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-sm text-white hover:text-red-200 font-semibold hover:bg-white/20 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Vaciar
              </button>
            )}
          </div>

          {/* Customer name */}
          <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-gray-50">
            <input
              type="text"
              placeholder="Nombre del cliente (opcional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-4 py-3 text-sm font-medium border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 placeholder:text-gray-400 bg-white"
            />
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <ShoppingCart className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-base font-medium text-gray-900 mb-1">
                  Carrito vacío
                </p>
                <p className="text-sm text-gray-500">
                  Selecciona productos para agregar
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {cart.map((item, idx) => (
                  <div
                    key={`${item.product.id}-${item.size}-${item.color}-${idx}`}
                    className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
                  >
                    {/* Mini image */}
                    <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.product.image_url ? (
                        <img
                          src={item.product.image_url}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-6 h-6 text-gray-300" />
                      )}
                    </div>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate mb-1">
                        {item.product.name}
                      </p>
                      <div className="flex items-center gap-2 mb-1">
                        {item.size && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                            Talla: {item.size}
                          </span>
                        )}
                        {item.color && (
                          <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-medium">
                            {item.color}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(item.product.price)} c/u
                      </p>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex flex-col items-center gap-2 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateQuantity(item.product.id, item.size, item.color, item.quantity - 1)
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white hover:bg-red-50 hover:border-red-300 transition-all"
                        >
                          <Minus className="w-4 h-4 text-gray-600" />
                        </button>
                        <span className="w-10 text-center text-base font-bold text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(item.product.id, item.size, item.color, item.quantity + 1)
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white hover:bg-green-50 hover:border-green-300 transition-all"
                        >
                          <Plus className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                      {/* Item subtotal */}
                      <p className="text-sm font-bold text-blue-600">
                        {formatCurrency(item.product.price * item.quantity)}
                      </p>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeFromCart(item.product.id, item.size, item.color)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart footer */}
          {cart.length > 0 && (
            <div className="border-t-2 border-gray-200 flex-shrink-0 bg-gray-50">
              {/* Subtotal & Discount */}
              <div className="px-6 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Subtotal
                  </span>
                  <span className="text-base font-semibold text-gray-900">
                    {formatCurrency(subtotal)}
                  </span>
                </div>

                {/* Discount input */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discount}
                      onChange={(e) =>
                        setDiscount(
                          Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                        )
                      }
                      placeholder="Descuento %"
                      className="w-full pl-9 pr-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 placeholder:text-gray-400 bg-white"
                    />
                  </div>
                  {discount > 0 && (
                    <span className="text-sm font-semibold text-red-600">
                      -{formatCurrency(discountAmount)}
                    </span>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-2 border-t-2 border-gray-200">
                  <span className="text-lg font-bold text-gray-900">Total</span>
                  <span className="text-3xl font-bold text-blue-600">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {/* Payment method */}
              <div className="px-6 pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">
                  Método de pago
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {paymentMethods.map((pm) => {
                    const Icon = pm.icon;
                    const isSelected = paymentMethod === pm.value;
                    return (
                      <button
                        key={pm.value}
                        onClick={() => setPaymentMethod(pm.value)}
                        className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border-2 text-sm font-bold transition-all transform ${isSelected
                          ? `${pm.bgColor} text-white border-transparent shadow-lg scale-105`
                          : `bg-white border-gray-200 ${pm.color} hover:border-gray-300 hover:shadow-md`
                          }`}
                      >
                        <Icon className="w-7 h-7" />
                        {pm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Finalize button */}
              <div className="px-6 pb-6">
                <Button
                  variant="primary"
                  onClick={finalizeSale}
                  disabled={processing || cart.length === 0}
                  className="w-full text-lg h-14"
                >
                  {processing ? (
                    <>
                      <div className="w-6 h-6 border-3 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-7 h-7" />
                      <span>Procesar Pago — {formatCurrency(total)}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ═══ MOBILE: Floating Cart Button ═══ */}
        {cart.length > 0 && !showMobileCart && (
          <div className="lg:hidden fixed bottom-6 left-4 right-4 z-40">
            <button
              onClick={() => setShowMobileCart(true)}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-between px-6 text-base shadow-2xl active:scale-95"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-6 h-6" />
                <span>{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
              </div>
              <span className="text-lg font-bold">{formatCurrency(total)}</span>
            </button>
          </div>
        )}

        {/* ═══ MOBILE: Fullscreen Cart Modal ═══ */}
        {showMobileCart && (
          <div className="lg:hidden fixed inset-0 z-50 bg-white flex flex-col" style={{ animation: 'fadeIn 0.2s ease-out' }}>
            {/* Cart Header */}
            <div className="px-4 py-4 bg-blue-600 flex items-center justify-between flex-shrink-0 safe-top">
              <button
                onClick={() => setShowMobileCart(false)}
                className="flex items-center gap-2 text-white font-semibold px-3 py-2 rounded-xl hover:bg-white/20 transition active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Seguir comprando
              </button>
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-white" />
                <span className="bg-white text-blue-600 text-sm font-bold px-3 py-1 rounded-full">
                  {totalItems}
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => { clearCart(); setShowMobileCart(false); }}
                  className="text-white/80 hover:text-white text-sm font-medium px-2 py-1 rounded-lg hover:bg-white/20 transition"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Customer Name */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <input
                type="text"
                placeholder="Nombre del cliente (opcional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-4 py-3 text-sm font-medium border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 placeholder:text-gray-400 bg-white"
              />
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <ShoppingCart className="w-16 h-16 text-gray-300 mb-4" />
                  <p className="text-base font-medium text-gray-900 mb-1">Carrito vacío</p>
                  <p className="text-sm text-gray-500">Selecciona productos para agregar</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map((item, idx) => (
                    <div
                      key={`${item.product.id}-${item.size}-${item.color}-${idx}`}
                      className="px-4 py-4 flex items-start gap-3"
                    >
                      {/* Mini image */}
                      <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.product.image_url ? (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-6 h-6 text-gray-300" />
                        )}
                      </div>

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                          {item.product.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {item.size && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                              Talla: {item.size}
                            </span>
                          )}
                          {item.color && (
                            <span className="text-[10px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-full font-medium">
                              {item.color}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatCurrency(item.product.price)} c/u
                        </p>
                        {/* Quantity controls */}
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => updateQuantity(item.product.id, item.size, item.color, item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white active:bg-red-50 active:border-red-300"
                          >
                            <Minus className="w-4 h-4 text-gray-600" />
                          </button>
                          <span className="w-8 text-center text-base font-bold text-gray-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.product.id, item.size, item.color, item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white active:bg-green-50 active:border-green-300"
                          >
                            <Plus className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>
                      </div>

                      {/* Subtotal + Remove */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <button
                          onClick={() => removeFromCart(item.product.id, item.size, item.color)}
                          className="p-1.5 text-gray-400 active:text-red-500 active:bg-red-50 rounded-lg transition"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <p className="text-sm font-bold text-blue-600">
                          {formatCurrency(item.product.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="border-t-2 border-gray-200 flex-shrink-0 bg-gray-50 safe-bottom">
                <div className="px-4 py-3 space-y-2">
                  {/* Subtotal */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Subtotal</span>
                    <span className="text-base font-semibold text-gray-900">{formatCurrency(subtotal)}</span>
                  </div>

                  {/* Discount */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={discount}
                        onChange={(e) => setDiscount(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                        placeholder="Descuento %"
                        className="w-full pl-9 pr-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 placeholder:text-gray-400 bg-white"
                      />
                    </div>
                    {discount > 0 && (
                      <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
                        -{formatCurrency(discountAmount)}
                      </span>
                    )}
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <span className="text-lg font-bold text-gray-900">Total</span>
                    <span className="text-2xl font-bold text-blue-600">{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="px-4 pb-3">
                  <p className="text-sm font-bold text-gray-700 mb-2">Método de pago</p>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentMethods.map((pm) => {
                      const Icon = pm.icon;
                      const isSelected = paymentMethod === pm.value;
                      return (
                        <button
                          key={pm.value}
                          onClick={() => setPaymentMethod(pm.value)}
                          className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-xs font-bold transition-all ${isSelected
                            ? `${pm.bgColor} text-white border-transparent shadow-lg scale-105`
                            : `bg-white border-gray-200 ${pm.color}`
                            }`}
                        >
                          <Icon className="w-6 h-6" />
                          {pm.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Finalize button */}
                <div className="px-4 pb-4">
                  <button
                    onClick={() => { finalizeSale(); setShowMobileCart(false); }}
                    disabled={processing || cart.length === 0}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg shadow-xl active:scale-95 disabled:cursor-not-allowed"
                  >
                    {processing ? (
                      <>
                        <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Procesando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-6 h-6" />
                        <span>Finalizar Venta — {formatCurrency(total)}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Variant Selector Modal */}
      {showVariantSelector && selectedProductForVariant && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Selecciona Talla
              </h2>
              <button
                onClick={() => setShowVariantSelector(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Product Info */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="font-semibold text-gray-900">{selectedProductForVariant.name}</p>
              <p className="text-sm text-gray-600">{selectedProductForVariant.sku}</p>
            </div>

            {/* Size Selection */}
            {(selectedProductForVariant.sizes?.length ?? 0) > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Talla: <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {selectedProductForVariant.sizes.map((size) => {
                    const stock = getSizeStock(selectedProductForVariant, size);
                    const alreadyInCart = cart
                      .filter((i) => i.product.id === selectedProductForVariant.id && i.size === size)
                      .reduce((s, i) => s + i.quantity, 0);
                    const available = stock - alreadyInCart;
                    return (
                      <button
                        key={size}
                        onClick={() => available > 0 && setSelectedSize(size)}
                        disabled={available <= 0}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition relative ${selectedSize === size
                          ? "bg-blue-600 text-white shadow-md"
                          : available <= 0
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed line-through"
                            : "bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                      >
                        {size}
                        {available > 0 && (
                          <span className={`block text-[10px] font-normal ${selectedSize === size ? "text-blue-200" : "text-gray-500"}`}>
                            ({available})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stock Info */}
            {selectedSize && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Stock disponible talla {selectedSize}:</strong>{" "}
                  {getSizeStock(selectedProductForVariant, selectedSize)}{" "}
                  unidades
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowVariantSelector(false)}
                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const hasSizes = (selectedProductForVariant.sizes?.length ?? 0) > 0;
                  if (hasSizes && !selectedSize) {
                    toast.error("Selecciona una talla");
                    return;
                  }
                  // Auto-derive color from inventory for the selected size+location
                  const inventoryForVariant = selectedProductForVariant.inventory.filter(inv => {
                    if (effectiveLocationId && inv.location_id !== effectiveLocationId) return false;
                    if (selectedSize && inv.size !== selectedSize) return false;
                    return true;
                  });
                  const derivedColor = inventoryForVariant[0]?.color ?? undefined;
                  addToCart(selectedProductForVariant, selectedSize || undefined, derivedColor || undefined);
                  setShowVariantSelector(false);
                  toast.success(
                    `${selectedProductForVariant.name}${selectedSize ? ` — Talla ${selectedSize}` : ""} agregado`
                  );
                }}
                disabled={(selectedProductForVariant.sizes?.length ?? 0) > 0 && !selectedSize}
                className={`flex-1 px-4 py-3 font-semibold rounded-xl transition ${(selectedProductForVariant.sizes?.length ?? 0) > 0 && !selectedSize
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
              >
                Agregar al Carrito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Payment Modal */}
      {showQRPayment && pendingSale && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 animate-fade-in my-8 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <QrCode className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Escanea el QR para Pagar
              </h2>
              <p className="text-sm sm:text-base text-gray-500">
                Total a pagar: <span className="text-xl sm:text-2xl font-bold text-blue-600">{formatCurrency(pendingSale.total)}</span>
              </p>
            </div>

            {/* QR Code Image */}
            <div className="bg-white rounded-2xl p-4 mb-4 border-2 border-blue-200 flex justify-center">
              <img
                src="/qr/yolo-pago.png"
                alt="QR Yolo Pago"
                className="w-full max-w-[250px] sm:max-w-[280px] h-auto"
              />
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <p className="text-xs sm:text-sm text-blue-900 font-medium mb-2">
                📱 Instrucciones:
              </p>
              <ol className="text-xs sm:text-sm text-blue-800 space-y-0.5 list-decimal list-inside">
                <li>Abre tu app de pagos (Yolo, Tigo Money, etc.)</li>
                <li>Escanea el código QR</li>
                <li>Confirma el monto: {formatCurrency(pendingSale.total)}</li>
                <li>Completa el pago</li>
                <li>Presiona "Confirmar Pago" abajo</li>
              </ol>
            </div>

            {/* Sale Details */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Items:</span>
                <span className="font-semibold text-gray-900">{pendingSale.items}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold text-gray-900">{formatCurrency(pendingSale.subtotal)}</span>
              </div>
              {pendingSale.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Descuento:</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(pendingSale.discount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="text-gray-900 font-bold">Total:</span>
                <span className="text-xl font-bold text-blue-600">{formatCurrency(pendingSale.total)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowQRPayment(false);
                  setPendingSale(null);
                }}
                disabled={processing}
                className="px-3 py-2.5 sm:py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={processSale}
                disabled={processing}
                className="px-3 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 active:scale-95 text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5 text-sm"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Confirmar Pago</span>
                  </>
                )}
              </button>
            </div>

            {/* Demo Note */}
            <div className="mt-3 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-[10px] sm:text-xs text-yellow-800 text-center leading-tight">
                <strong>Nota de Demo:</strong> En producción, el sistema verificará automáticamente el pago antes de completar la venta.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && lastSale && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-fade-in">
            {/* Success icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
              ¡Venta Completada!
            </h2>
            <p className="text-center text-gray-500 mb-6">
              La transacción se procesó exitosamente
            </p>

            {/* Sale summary */}
            <div className="bg-gray-50 rounded-2xl p-6 mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Total de items
                </span>
                <span className="text-base font-bold text-gray-900">
                  {lastSale.items}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Método de pago
                </span>
                <span className="text-base font-bold text-gray-900 capitalize">
                  {paymentMethods.find((pm) => pm.value === lastSale.paymentMethod)
                    ?.label}
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t-2 border-gray-200">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-green-600">
                  {formatCurrency(lastSale.total)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={generateTicket}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
              >
                <Printer className="w-5 h-5" />
                Imprimir
              </button>
              <button
                onClick={handleNewSale}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg"
              >
                <RotateCcw className="w-5 h-5" />
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
