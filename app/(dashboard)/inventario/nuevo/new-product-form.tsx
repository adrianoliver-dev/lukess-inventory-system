"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import type { Category, Location } from "@/lib/types";
import toast from "react-hot-toast";
import { LoadingButton } from "@/components/ui/LoadingButton";
import {
  ArrowLeft,
  Save,
  Wand2,
  Plus,
  X,
  Package,
  DollarSign,
  Tag,
  Palette,
  Ruler,
  MapPin,
  TrendingUp,
  ImageIcon,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { ImageUploader } from "@/components/inventory/ImageUploader";
import { revalidateProductPaths } from "../actions";

// ── Schema ───────────────────────────────────────────────────────────────────

const productSchema = z.object({
  sku: z.string().min(1, "SKU es requerido").max(50, "Máximo 50 caracteres"),
  sku_group: z.string().max(50, "Máximo 50 caracteres").optional().nullable(),
  name: z.string().min(1, "Nombre es requerido").max(200, "Máximo 200 caracteres"),
  description: z.string().max(1000, "Máximo 1000 caracteres").optional(),
  category_input: z.string().trim().optional().nullable(),
  brand: z.string().max(50, "Máximo 50 caracteres").optional(),
  image_url: z.string().optional().or(z.literal("")),
  price: z.coerce.number().positive("El precio debe ser mayor a 0"),
  cost: z.coerce.number().positive("El costo debe ser mayor a 0").optional(),
  color: z.string().max(50, "Máximo 50 caracteres").optional().nullable(),
  sizes: z.array(z.string()).optional().default([]),
  low_stock_threshold: z.coerce.number().int().min(1, "Mínimo 1").default(5),
  initial_stock: z.record(z.string(), z.coerce.number().int().min(0)).optional(),
  discount: z.coerce.number().min(0, "Mínimo 0").optional(),
  discount_expires_at: z.string().optional().nullable(),
  is_new: z.boolean().default(false),
  is_new_until: z.string().optional().nullable(),
  is_featured: z.boolean().default(false),
});

type ProductFormData = z.infer<typeof productSchema>;

// ── Props ────────────────────────────────────────────────────────────────────

interface NewProductFormProps {
  categories: Category[];
  locations: Location[];
  organizationId: string;
  nextProductNumber: number;
  brands: string[];
}

// ── Predefined options ───────────────────────────────────────────────────────

// Solo 8 tallas permitidas
const ALLOWED_SIZES = ["S", "M", "L", "XL", "38", "40", "42", "44"];

const COMMON_COLORS = [
  "Negro",
  "Blanco",
  "Gris",
  "Azul",
  "Azul marino",
  "Verde",
  "Verde militar",
  "Rojo",
  "Beige",
  "Café",
  "Celeste",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function NewProductForm({
  categories,
  locations,
  organizationId,
  nextProductNumber,
  brands,
}: NewProductFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [auditNote, setAuditNote] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [customColorInput, setCustomColorInput] = useState<string>("");
  const [publishedToLanding, setPublishedToLanding] = useState(false);
  const [productImages, setProductImages] = useState<string[]>([]);
  // Stock por ubicación y talla: { locationId: { size: quantity } }
  const [stockByLocationAndSize, setStockByLocationAndSize] = useState<Record<string, Record<string, number>>>({});

  const form = useForm({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(productSchema) as any,
    defaultValues: {
      sku: "",
      sku_group: "",
      name: "",
      description: "",
      category_input: "",
      brand: "",
      image_url: "",
      price: 0,
      cost: 0,
      color: "",
      sizes: [],
      low_stock_threshold: 5,
      initial_stock: {},
      discount: 0,
      discount_expires_at: "",
      is_new: false,
      is_new_until: "",
      is_featured: false,
    },
  });

  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;

  // Image uploading is now handled internally by ImageUploader component

  // ── Auto-generate SKU ──────────────────────────────────────────────────────

  const generateSku = () => {
    const prefix = "LH";
    const num = String(nextProductNumber).padStart(4, "0");
    const generated = `${prefix}-${num}`;
    setValue("sku", generated);
  };

  // ── Sizes ──────────────────────────────────────────────────────────────────

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const addCustomSize = () => {
    if (customSize.trim() && !selectedSizes.includes(customSize.trim())) {
      setSelectedSizes((prev) => [...prev, customSize.trim()]);
      setCustomSize("");
    }
  };

  const removeSize = (size: string) => {
    setSelectedSizes((prev) => prev.filter((s) => s !== size));
  };

  const clearAllSizes = () => {
    setSelectedSizes([]);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const onSubmit = async (data: ProductFormData) => {
    setSaving(true);

    try {
      const supabase = createClient();

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("No se pudo obtener el usuario");
        setSaving(false);
        return;
      }

      // 0. Ensure Category Exists or Grab ID
      let finalCategoryId: string | null = null;
      if (data.category_input) {
        // Try to find if it exactly matches an existing category
        const existingCat = categories.find(
          c => c.name.toLowerCase() === data.category_input!.toLowerCase()
        );

        if (existingCat) {
          finalCategoryId = existingCat.id;
        } else {
          // Create new category dynamically
          const { data: newCat, error: catError } = await supabase
            .from("categories")
            .insert({
              name: data.category_input,
              organization_id: organizationId
            })
            .select()
            .single();

          if (catError) {
            toast.error("Error al crear la nueva categoría");
            setSaving(false);
            return;
          }
          finalCategoryId = newCat.id;
        }
      }

      // 1. Create product
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          organization_id: organizationId,
          sku: data.sku,
          sku_group: data.sku_group || null,
          name: data.name,
          description: data.description || null,
          category_id: finalCategoryId,
          brand: data.brand || null,
          image_url: productImages.length > 0 ? productImages[0] : (data.image_url || null),
          images: productImages,
          price: data.price,
          cost: data.cost ?? 0,
          color: selectedColor || null,
          sizes: selectedSizes,
          is_active: true,
          published_to_landing: publishedToLanding,
          discount: data.discount || null,
          discount_expires_at: data.discount_expires_at ? new Date(data.discount_expires_at).toISOString() : null,
          is_new: data.is_new,
          is_new_until: data.is_new_until ? new Date(data.is_new_until).toISOString() : null,
          is_featured: data.is_featured,
        })
        .select()
        .single();

      if (productError) {
        if (productError.code === "23505") {
          toast.error("Ya existe un producto con ese SKU");
        } else {
          toast.error(`Error al crear producto: ${productError.message}`);
        }
        setSaving(false);
        return;
      }

      // 2. Create inventory for each location and size
      const inventoryInserts: any[] = [];
      // Accesorios sin tallas → guardar con size='Unitalla'
      const sizesToUse = selectedSizes.length > 0 ? selectedSizes : ['Unitalla'];

      locations.forEach((loc) => {
        sizesToUse.forEach((size) => {
          const quantity = stockByLocationAndSize[loc.id]?.[size] || 0;
          inventoryInserts.push({
            product_id: product.id,
            location_id: loc.id,
            size: size,
            color: selectedColor || null,
            quantity: quantity,
            min_stock: data.low_stock_threshold,
          });
        });
      });

      const { error: inventoryError } = await supabase
        .from("inventory")
        .insert(inventoryInserts);

      if (inventoryError) {
        toast.error(`Producto creado pero error en inventario: ${inventoryError.message}`);
        setSaving(false);
        return;
      }

      // 3. Registrar auditoría
      await supabase.from("audit_log").insert({
        organization_id: organizationId,
        user_id: user.id,
        action: "create",
        table_name: "products",
        record_id: product.id,
        old_data: null,
        new_data: {
          sku: data.sku,
          sku_group: data.sku_group,
          name: data.name,
          description: data.description,
          category_id: finalCategoryId,
          brand: data.brand,
          price: data.price,
          cost: data.cost,
          color: selectedColor,
          sizes: selectedSizes,
          stock_by_location_and_size: stockByLocationAndSize,
          audit_note: auditNote || null,
        },
        ip_address: null,
      });

      toast.success("Producto creado exitosamente");
      await revalidateProductPaths();
      router.push("/inventario");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado al guardar";
      toast.error(message);
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/inventario"
          className="p-2 rounded-lg hover:bg-zinc-100 transition text-zinc-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Nuevo Producto</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Completa la información del producto
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Información básica ────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Package className="w-4 h-4 text-zinc-600" />
            Información básica
          </div>

          {/* SKU */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">
              SKU (Código único) <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                {...register("sku")}
                placeholder="JEAN-LEV-501-AZUL"
                className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400 font-mono uppercase"
              />
              <button
                type="button"
                onClick={generateSku}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm font-medium text-zinc-700 transition"
                title="Autogenerar SKU"
              >
                <Wand2 className="w-4 h-4" />
                Auto
              </button>
            </div>
            {errors.sku && (
              <p className="text-xs text-red-600">{errors.sku.message}</p>
            )}
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-zinc-900">📚 Guía para crear SKUs correctos:</p>
              <div className="space-y-1 text-xs text-zinc-800">
                <p><strong>Formato:</strong> TIPO-MARCA-MODELO-COLOR</p>
                <p><strong>Ejemplos:</strong></p>
                <ul className="list-disc list-inside pl-2 space-y-0.5">
                  <li><code className="bg-zinc-100 px-1 rounded">CAM-COL-001-AZUL</code> → Camisa Columbia modelo 001 azul</li>
                  <li><code className="bg-zinc-100 px-1 rounded">JEAN-LEV-501-NEGRO</code> → Jean Levi's 501 negro</li>
                  <li><code className="bg-zinc-100 px-1 rounded">POL-LAC-CLA-BLANCO</code> → Polo Lacoste clásico blanco</li>
                </ul>
                <p className="text-zinc-700 mt-1"><strong>Importante:</strong> Usa MAYÚSCULAS y guiones (-) para separar</p>
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              {...register("name")}
              placeholder="Ej: Camisa Oxford Azul"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400"
            />
            {errors.name && (
              <p className="text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">
              Descripción
            </label>
            <textarea
              {...register("description")}
              rows={3}
              placeholder="Descripción breve del producto..."
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition resize-none text-zinc-900 placeholder:text-zinc-400"
            />
            {errors.description && (
              <p className="text-xs text-red-600">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Category + Brand */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">
                Categoría
              </label>
              <input
                {...register("category_input")}
                list="existingCategories"
                placeholder="Ej: Chamarras, Pantalones"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-700"
              />
              <datalist id="existingCategories">
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">
                Marca
              </label>
              <input
                {...register("brand")}
                list="brandsList"
                placeholder="Ej: Levi's"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400"
              />
              <datalist id="brandsList">
                {brands.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        {/* ── Imágenes del producto ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <ImageIcon className="w-4 h-4 text-zinc-600" />
            Imágenes del producto (opcional)
          </div>
          <ImageUploader
            existingImages={productImages}
            onImagesChange={setProductImages}
            maxImages={5}
            bucketName="product-images"
            organizationId={organizationId}
          />
        </div>

        {/* ── Promociones y Visibilidad ─────────────────────────────────── */}
        <div className="bg-white border-2 border-zinc-100 rounded-xl p-5 space-y-5">
          <h3 className="font-bold text-zinc-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-zinc-600" />
            Promociones y Visibilidad
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Discount */}
            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
              <label className="block text-sm font-semibold text-zinc-800 mb-2">Descuento (%)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.01"
                  {...register("discount")}
                  className="w-24 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 outline-none transition"
                  placeholder="0"
                />
                <div className="flex-1">
                  {(watch("discount") ?? 0) > 0 && (
                    <div className="text-sm font-medium text-green-700 bg-green-100 px-3 py-1.5 rounded-lg inline-block">
                      Precio final: Bs {(Number(watch("price")) * (1 - Number(watch("discount")) / 100)).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
              {(watch("discount") ?? 0) > 0 && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-zinc-700 mb-1 leading-tight">Válido hasta (Opcional)</label>
                  <input
                    type="datetime-local"
                    {...register("discount_expires_at")}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 outline-none transition"
                  />
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 flex flex-col justify-center gap-4">
              {/* is_new */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_new")}
                    className="w-5 h-5 rounded text-zinc-600 focus:ring-zinc-500 border-zinc-300"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-zinc-800">Etiqueta &quot;Nuevo&quot;</span>
                    <span className="block text-xs text-zinc-500">Destaca el producto en la tienda</span>
                  </div>
                </label>
                {watch("is_new") && (
                  <div className="mt-2 pl-8">
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Mostrar etiqueta hasta (Opcional)</label>
                    <input
                      type="datetime-local"
                      {...register("is_new_until")}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 outline-none transition"
                    />
                  </div>
                )}
              </div>

              {/* is_featured */}
              <label className="flex items-center gap-3 cursor-pointer pt-3 border-t border-zinc-200">
                <input
                  type="checkbox"
                  {...register("is_featured")}
                  className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500 border-zinc-300"
                />
                <div>
                  <span className="block text-sm font-semibold text-zinc-800">Producto Destacado</span>
                  <span className="block text-xs text-zinc-500">Muestra el producto en portada</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* ── Precios ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <DollarSign className="w-4 h-4 text-green-600" />
            Precios
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">
                Precio de venta (Bs) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                {...register("price", { valueAsNumber: true })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400"
              />
              {errors.price && (
                <p className="text-xs text-red-600">{errors.price.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700">
                Costo (Bs) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                {...register("cost", { valueAsNumber: true })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400"
              />
              {errors.cost && (
                <p className="text-xs text-red-600">{errors.cost.message}</p>
              )}
            </div>
          </div>

          {/* Margin preview */}
          {watch("price") > 0 && watch("cost") >= 0 && (
            <div className={`rounded-xl px-6 py-4 flex items-center justify-between border-2 transition-all duration-300 ${watch("price") - watch("cost") > 0
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
              }`}>
              <div className="flex items-center gap-2">
                <TrendingUp className={`w-5 h-5 ${watch("price") - watch("cost") > 0
                  ? "text-green-600"
                  : "text-red-600"
                  }`} />
                <span className="text-sm font-semibold text-zinc-700">Margen de ganancia</span>
              </div>
              <span
                className={`text-xl font-bold flex items-center gap-2 ${watch("price") - watch("cost") > 0
                  ? "text-green-600"
                  : "text-red-600"
                  }`}
              >
                Bs {(watch("price") - watch("cost")).toFixed(2)}
                <span className="text-base">
                  ({watch("cost") > 0
                    ? (
                      ((watch("price") - watch("cost")) / watch("cost")) *
                      100
                    ).toFixed(1)
                    : "∞"}%)
                </span>
              </span>
            </div>
          )}
        </div>

        {/* ── Tallas ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Ruler className="w-4 h-4 text-zinc-600" />
              Tallas
              {selectedSizes.length > 0 && (
                <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full">
                  {selectedSizes.length}
                </span>
              )}
            </div>
            {selectedSizes.length > 0 && (
              <button
                type="button"
                onClick={clearAllSizes}
                className="text-xs text-red-600 hover:text-red-700 font-semibold underline"
              >
                Eliminar todas
              </button>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs text-zinc-600">
              Selecciona las tallas disponibles para este producto:
            </p>
            <div className="grid grid-cols-4 gap-3">
              {ALLOWED_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleSize(size)}
                  className={`px-4 py-3 rounded-lg text-sm font-bold border-2 transition-all ${selectedSizes.includes(size)
                    ? "bg-zinc-600 border-zinc-600 text-white shadow-md transform scale-105"
                    : "bg-white border-zinc-300 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              S, M, L, XL → para ropa superior | 38, 40, 42, 44 → para pantalones y calzado
            </p>
            {/* Talla personalizada */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSize();
                  }
                }}
                placeholder="Talla personalizada"
                className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={addCustomSize}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Selected sizes display */}
          {selectedSizes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedSizes.map((size) => (
                <span
                  key={size}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700"
                >
                  {size}
                  <button
                    type="button"
                    onClick={() => removeSize(size)}
                    className="hover:text-zinc-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Color del Producto ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Palette className="w-4 h-4 text-zinc-600" />
            Color de este producto <span className="text-red-500">*</span>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-700">
              Selecciona el color (solo uno):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {COMMON_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all ${selectedColor === color
                    ? "border-zinc-600 bg-zinc-50 shadow-md transform scale-105"
                    : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                >
                  <div className="w-5 h-5 rounded-full border-2 border-zinc-300 flex-shrink-0" style={{
                    backgroundColor: color === 'Negro' ? '#000' :
                      color === 'Blanco' ? '#FFF' :
                        color === 'Gris' ? '#9CA3AF' :
                          color === 'Azul' ? '#3B82F6' :
                            color === 'Azul marino' ? '#1E3A8A' :
                              color === 'Verde' ? '#22C55E' :
                                color === 'Verde militar' ? '#4D7C0F' :
                                  color === 'Rojo' ? '#EF4444' :
                                    color === 'Beige' ? '#D4A574' :
                                      color === 'Café' ? '#92400E' :
                                        color === 'Celeste' ? '#7DD3FC' : '#CCC'
                  }} />
                  <span className="text-sm font-medium text-zinc-700">{color}</span>
                </button>
              ))}
            </div>

            {/* Color personalizado */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-600">
                ¿No encuentras el color? Escríbelo aquí:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customColorInput}
                  onChange={(e) => setCustomColorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (customColorInput.trim()) {
                        setSelectedColor(customColorInput.trim());
                        setCustomColorInput("");
                      }
                    }
                  }}
                  placeholder="Ej: Gris Oxford, Verde esmeralda..."
                  className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customColorInput.trim()) {
                      setSelectedColor(customColorInput.trim());
                      setCustomColorInput("");
                    }
                  }}
                  className="px-4 py-2 bg-zinc-600 hover:bg-zinc-700 text-white font-semibold rounded-lg text-sm transition"
                >
                  Usar
                </button>
              </div>
            </div>

            {/* Color seleccionado */}
            {selectedColor && (
              <div className="bg-zinc-50 border-2 border-zinc-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900">Color seleccionado:</span>
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-bold bg-zinc-100 text-zinc-700 border border-zinc-300">
                    {selectedColor}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedColor("")}
                  className="text-zinc-600 hover:text-zinc-800 font-semibold text-sm"
                >
                  Cambiar
                </button>
              </div>
            )}

            <p className="text-xs text-zinc-500">
              💡 Tip: Si vendes el mismo modelo en varios colores, crea un producto separado para cada color y usa el mismo SKU Group
            </p>
          </div>
        </div>

        {/* ── SKU Group (Grupo de variantes) ──────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Tag className="w-4 h-4 text-zinc-600" />
            Grupo de variantes (Opcional)
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-700">
              SKU Base para agrupar variantes de color:
            </label>
            <input
              type="text"
              {...register("sku_group")}
              placeholder="JEAN-LEV-501"
              className="w-full px-4 py-3 border-2 border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900 placeholder:text-zinc-400 font-mono uppercase"
            />
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-zinc-900">💡 ¿Cuándo usar SKU Group?</p>
              <div className="text-xs text-zinc-800 space-y-1">
                <p><strong>Ejemplo:</strong> Vendes "Jean Levi's 501" en 3 colores:</p>
                <ul className="list-disc list-inside pl-2 space-y-0.5">
                  <li>Jean Levi's 501 - Azul → SKU: <code className="bg-zinc-100 px-1 rounded">JEAN-LEV-501-AZUL</code></li>
                  <li>Jean Levi's 501 - Negro → SKU: <code className="bg-zinc-100 px-1 rounded">JEAN-LEV-501-NEGRO</code></li>
                  <li>Jean Levi's 501 - Gris → SKU: <code className="bg-zinc-100 px-1 rounded">JEAN-LEV-501-GRIS</code></li>
                </ul>
                <p className="text-zinc-700 mt-2"><strong>SKU Group:</strong> <code className="bg-zinc-100 px-1 rounded">JEAN-LEV-501</code> (sin el color)</p>
                <p className="mt-1">Esto permite mostrarlos juntos en la web como variantes del mismo modelo.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stock Inicial por Talla y Ubicación ───────────────────────────── */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <MapPin className="w-4 h-4 text-emerald-600" />
              Stock inicial por talla y ubicación
            </div>
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-500">
                Umbral bajo stock:
              </span>
              <input
                type="number"
                {...register("low_stock_threshold", { valueAsNumber: true })}
                className="w-16 px-2 py-1 border border-zinc-300 rounded-md text-xs text-center focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 outline-none transition text-zinc-900"
              />
            </div>
          </div>
          {errors.low_stock_threshold && (
            <p className="text-xs text-red-600">{errors.low_stock_threshold.message}</p>
          )}

          {selectedSizes.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 italic">
                Accesorio sin talla (cinturones, gorras, billeteras) — se guardará con talla "Unitalla" automáticamente.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {locations.map((loc) => (
                  <div key={loc.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-zinc-200">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-zinc-900">{loc.name}</p>
                      {loc.address && <p className="text-xs text-zinc-500">{loc.address}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={stockByLocationAndSize[loc.id]?.['Unitalla'] || ""}
                        onChange={(e) => {
                          const value = e.target.value === "" ? 0 : parseInt(e.target.value) || 0;
                          setStockByLocationAndSize(prev => ({
                            ...prev,
                            [loc.id]: {
                              ...prev[loc.id],
                              'Unitalla': value
                            }
                          }));
                        }}
                        className="w-20 px-2 py-1.5 border-2 border-zinc-300 rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition text-zinc-900"
                      />
                      <span className="text-xs text-zinc-600">uds</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedSizes.map((size) => (
                <div key={size} className="border-2 border-zinc-200 rounded-lg p-4 bg-zinc-50/30">
                  <h4 className="text-sm font-bold text-zinc-900 mb-3 flex items-center gap-2">
                    <Ruler className="w-4 h-4" />
                    Talla {size}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {locations.map((loc) => (
                      <div key={loc.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-zinc-200">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-zinc-900">{loc.name}</p>
                          {loc.address && <p className="text-xs text-zinc-500">{loc.address}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={stockByLocationAndSize[loc.id]?.[size] || ""}
                            onChange={(e) => {
                              const value = e.target.value === "" ? 0 : parseInt(e.target.value) || 0;
                              setStockByLocationAndSize(prev => ({
                                ...prev,
                                [loc.id]: {
                                  ...prev[loc.id],
                                  [size]: value
                                }
                              }));
                            }}
                            className="w-20 px-2 py-1.5 border-2 border-zinc-300 rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition text-zinc-900"
                          />
                          <span className="text-xs text-zinc-600">uds</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-emerald-50 rounded-lg px-4 py-2.5 flex items-center justify-between border-2 border-emerald-200">
            <span className="text-sm text-emerald-700 font-medium">
              Stock total inicial
            </span>
            <span className="text-lg font-bold text-emerald-700">
              {Object.values(stockByLocationAndSize).reduce((total, sizeStock) =>
                total + Object.values(sizeStock).reduce((sum, qty) => sum + qty, 0), 0
              )} unidades
            </span>
          </div>
        </div>

        {/* ── Tienda Online ─────────────────────────────────────────────── */}
        <div className={`rounded-xl border-2 p-5 ${publishedToLanding ? "bg-green-50 border-green-200" : "bg-zinc-50 border-zinc-200"
          }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${publishedToLanding ? "bg-green-100" : "bg-zinc-100"
                }`}>
                <Globe className={`w-5 h-5 ${publishedToLanding ? "text-green-600" : "text-zinc-500"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">Tienda Online</p>
                <p className="text-xs text-zinc-500 mt-0.5">Publicar en la landing page</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPublishedToLanding((v) => !v)}
              title={publishedToLanding ? "Ocultar de la tienda online" : "Publicar en la tienda online"}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${publishedToLanding ? "bg-green-500" : "bg-zinc-300"
                }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${publishedToLanding ? "translate-x-8" : "translate-x-1"
                  }`}
              />
            </button>
          </div>
        </div>

        {/* ── Nota de auditoría ────────────────────────────────────────── */}
        <div className="bg-yellow-50 rounded-xl border-2 border-yellow-200 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-yellow-900">
            📝 Nota para el historial (opcional)
          </div>
          <textarea
            value={auditNote}
            onChange={(e) => setAuditNote(e.target.value)}
            rows={3}
            placeholder="Ej: Cliente fiel, producto en promoción, pedido especial..."
            className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none transition resize-none text-zinc-900 placeholder:text-zinc-400 bg-white"
          />
          <p className="text-xs text-yellow-700">
            Esta nota aparecerá en el historial de cambios para que todos sepan el motivo de la creación.
          </p>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <Link
            href="/inventario"
            className="px-6 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-100 rounded-xl transition"
          >
            Cancelar
          </Link>
          <LoadingButton
            type="submit"
            loading={saving}
            loadingText="Guardando..."
            variant="primary"
          >
            <Save className="w-5 h-5" />
            Crear Producto
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}
