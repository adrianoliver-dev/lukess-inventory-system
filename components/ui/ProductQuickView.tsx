"use client";

import { useState, useEffect } from "react";
import { X, Package, TrendingUp, MapPin, Tag, QrCode } from "lucide-react";
import QRCode from "qrcode";
import type { Product, Inventory, Category } from "@/lib/types";

interface ProductQuickViewProps {
  product: Product & {
    inventory?: Inventory[];
    category?: Category | null;
  };
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
}

export function ProductQuickView({
  product,
  isOpen,
  onClose,
  onEdit,
  onAddToCart,
}: ProductQuickViewProps) {
  const [qrCode, setQrCode] = useState<string>("");

  // Generar código QR
  useEffect(() => {
    if (isOpen && product.id) {
      QRCode.toDataURL(
        `https://lukess-inventory-system.vercel.app/ventas?product=${product.id}`,
        {
          width: 200,
          margin: 2,
          color: {
            dark: "#1e40af", // Azul oscuro
            light: "#ffffff",
          },
        }
      )
        .then(setQrCode)
        .catch((err) => console.error("Error generando QR:", err));
    }
  }, [isOpen, product.id]);

  if (!isOpen) return null;

  // Calcular stock total
  const totalStock =
    product.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;

  // Calcular margen de ganancia
  const profitMargin =
    product.price && product.cost
      ? ((product.price - product.cost) / product.cost) * 100
      : 0;
  const profitAmount = product.price - product.cost;

  // Verificar bajo stock
  const minStock =
    product.inventory?.reduce((sum, inv) => sum + inv.min_stock, 0) || 0;
  const isLowStock = totalStock > 0 && totalStock <= minStock;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{product.name}</h2>
                <p className="text-blue-100">SKU: {product.sku}</p>
              </div>
              <button
                onClick={onClose}
                className="bg-white bg-opacity-20 hover:bg-opacity-30 p-2 rounded-lg transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* Imagen o placeholder */}
            <div className="bg-blue-50 rounded-xl p-8 border-2 border-blue-200 flex items-center justify-center">
              <Package className="w-24 h-24 text-blue-600" />
            </div>

            {/* Información básica */}
            <div className="grid grid-cols-2 gap-4">
              {/* Precio */}
              <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                <p className="text-sm text-blue-700 font-medium mb-1">
                  Precio de Venta
                </p>
                <p className="text-3xl font-bold text-blue-600">
                  Bs {product.price.toFixed(2)}
                </p>
              </div>

              {/* Costo */}
              <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                <p className="text-sm text-gray-700 font-medium mb-1">Costo</p>
                <p className="text-3xl font-bold text-gray-600">
                  Bs {product.cost.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Margen de ganancia */}
            <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700 font-medium">
                    Margen de Ganancia
                  </p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {profitMargin.toFixed(1)}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-green-700 font-medium">
                    Ganancia por unidad
                  </p>
                  <p className="text-xl font-bold text-green-600 mt-1">
                    +Bs {profitAmount.toFixed(2)}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
            </div>

            {/* Stock */}
            <div
              className={`rounded-lg p-4 border-2 ${isLowStock
                ? "bg-red-50 border-red-200"
                : totalStock === 0
                  ? "bg-gray-50 border-gray-200"
                  : "bg-green-50 border-green-200"
                }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className={`text-sm font-medium ${isLowStock
                      ? "text-red-700"
                      : totalStock === 0
                        ? "text-gray-700"
                        : "text-green-700"
                      }`}
                  >
                    Stock Total
                  </p>
                  <p
                    className={`text-3xl font-bold mt-1 ${isLowStock
                      ? "text-red-600"
                      : totalStock === 0
                        ? "text-gray-400"
                        : "text-green-600"
                      }`}
                  >
                    {totalStock} unidades
                  </p>
                </div>
                <MapPin
                  className={`w-8 h-8 ${isLowStock
                    ? "text-red-500"
                    : totalStock === 0
                      ? "text-gray-400"
                      : "text-green-500"
                    }`}
                />
              </div>
            </div>

            {/* Stock por ubicación */}
            {product.inventory && product.inventory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Stock por Ubicación
                </h3>
                <div className="space-y-1">
                  {product.inventory.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <span className="text-sm text-gray-700">
                        {(inv as any).locations?.name || `Ubicación ${inv.location_id.slice(0, 8)}...`}
                      </span>
                      <div className="text-right">
                        <span
                          className={`text-base font-bold ${inv.quantity <= inv.min_stock
                            ? "text-red-600"
                            : "text-green-600"
                            }`}
                        >
                          {inv.quantity}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">
                          unidades
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Categoría */}
            {product.category && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Categoría
                </h3>
                <span className="inline-block px-4 py-2 bg-purple-50 text-purple-700 font-medium rounded-lg border-2 border-purple-200">
                  {product.category.name}
                </span>
              </div>
            )}

            {/* Marca */}
            {product.brand && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Marca
                </h3>
                <p className="text-gray-600">{product.brand}</p>
              </div>
            )}

            {/* Descripción */}
            {product.description && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Descripción
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {product.description}
                </p>
              </div>
            )}

            {/* Tallas */}
            {product.sizes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Tallas Disponibles
                </h3>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <span
                      key={size}
                      className="px-3 py-1 bg-gray-100 text-gray-700 font-medium rounded-lg border border-gray-300"
                    >
                      {size}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Color */}
            {product.color && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Color Disponible
                </h3>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 font-medium rounded-lg border border-gray-300">
                    {product.color}
                  </span>
                </div>
              </div>
            )}

            {/* Código QR */}
            {qrCode && (
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-5 border-2 border-blue-200">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-blue-600" />
                      Código QR del Producto
                    </h3>
                    <p className="text-xs text-gray-600 mb-3">
                      Escanea este código para agregar el producto directamente al carrito de ventas
                    </p>
                    <div className="bg-white rounded-lg p-3 inline-block border-2 border-blue-300 shadow-lg">
                      <img
                        src={qrCode}
                        alt="QR Code"
                        className="w-40 h-40"
                      />
                    </div>
                    <p className="text-xs text-blue-600 font-medium mt-2">
                      📱 Usa cualquier lector QR
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer con acciones */}
          <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-2xl border-t-2 border-gray-200">
            <div className="flex gap-3">
              {onAddToCart && totalStock > 0 && (
                <button
                  onClick={() => {
                    onAddToCart(product);
                    onClose();
                  }}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
                >
                  Agregar al Carrito
                </button>
              )}

              {onEdit && (
                <button
                  onClick={() => {
                    onEdit(product);
                    onClose();
                  }}
                  className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-all"
                >
                  Editar Producto
                </button>
              )}

              <button
                onClick={onClose}
                className="px-6 py-3 bg-white text-gray-700 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
