'use client'

import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown, Loader2, MapPin, Package, Paperclip, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import type { OrderWithItems, OrderStatus } from '@/lib/types'
import { ORDER_STATUS_CONFIG } from '@/lib/types'
import { updateOrderStatus, saveInternalNote, getReceiptSignedUrl } from './actions'
import { createClient } from '@/lib/supabase/client'
import CancelOrderModal from '@/components/orders/CancelOrderModal'

interface ReservationRow {
  location_name: string
  product_name: string
  size: string | null
  quantity: number
}

interface Props {
  order: OrderWithItems | null
  isOpen: boolean
  onClose: () => void
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void
  userRole: 'admin' | 'manager' | 'staff'
}

const STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'completed']

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  pending_payment: ['confirmed', 'cancelled'],
  reserved: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-BO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function StatusStepper({ status }: { status: OrderStatus }) {
  const cancelled = status === 'cancelled'
  const reserved = status === 'reserved'
  // 'reserved' se muestra entre pending (idx 0) y confirmed (idx 1)
  const currentIdx = reserved ? 0 : STATUS_FLOW.indexOf(status)

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        {STATUS_FLOW.map((step, idx) => {
          const cfg = ORDER_STATUS_CONFIG[step]
          const isDone = !cancelled && idx < currentIdx
          const isCurrent = !cancelled && !reserved && idx === currentIdx
          const isFuture = cancelled || (reserved ? idx > 0 : idx > currentIdx)

          return (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center relative">
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                    ${isDone ? 'bg-green-500 border-green-500 text-white' : ''}
                    ${isCurrent ? `${cfg.bgColor} ${cfg.borderColor} ${cfg.color} ring-2 ring-offset-1 ring-current` : ''}
                    ${isFuture ? 'bg-gray-100 border-gray-300 text-gray-400' : ''}
                  `}
                >
                  {isDone ? '✓' : cfg.icon}
                </div>
                <span
                  className={`
                    mt-1.5 text-xs font-medium whitespace-nowrap
                    ${isDone ? 'text-green-600' : ''}
                    ${isCurrent ? cfg.color : ''}
                    ${isFuture ? 'text-gray-400' : ''}
                  `}
                >
                  {cfg.label}
                </span>
              </div>
              {idx < STATUS_FLOW.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-1 mb-5
                    ${isDone ? 'bg-green-400' : 'bg-gray-200'}
                  `}
                />
              )}
            </div>
          )
        })}
      </div>

      {cancelled && (
        <div className="absolute inset-0 flex items-center justify-center pb-5">
          <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full border border-red-200">
            ❌ Cancelado
          </span>
        </div>
      )}
      {reserved && (
        <div className="absolute inset-0 flex items-center justify-center pb-5">
          <span className="bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full border border-orange-200">
            💳 Pago pendiente de confirmación
          </span>
        </div>
      )}
    </div>
  )
}

function StatusDropdown({
  currentStatus,
  onSelect,
  disabled,
}: {
  currentStatus: OrderStatus
  onSelect: (s: OrderStatus) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cfg = ORDER_STATUS_CONFIG[currentStatus]
  const nextStatuses = VALID_TRANSITIONS[currentStatus]
  const canChange = !disabled && nextStatuses.length > 0

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => canChange && setOpen(!open)}
        disabled={!canChange}
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-all
          ${cfg.bgColor} ${cfg.color} ${cfg.borderColor}
          ${canChange ? 'hover:opacity-80 cursor-pointer' : 'cursor-default opacity-75'}
        `}
      >
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
        {canChange && <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-10 min-w-[180px] overflow-hidden">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-100">
            Cambiar a:
          </p>
          {nextStatuses.map((s) => {
            const c = ORDER_STATUS_CONFIG[s]
            return (
              <button
                key={s}
                onClick={() => {
                  onSelect(s)
                  setOpen(false)
                }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-left
                  hover:${c.bgColor} transition-colors
                `}
              >
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bgColor} ${c.color} border ${c.borderColor}`}>
                  {c.icon} {c.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function OrderDetailModal({
  order,
  isOpen,
  onClose,
  onStatusChange,
  userRole,
}: Props) {
  const [loadingStatus, setLoadingStatus] = useState<OrderStatus | null>(null)
  const [internalNote, setInternalNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [reservations, setReservations] = useState<ReservationRow[]>([])
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [receiptState, setReceiptState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const canEdit = userRole === 'admin' || userRole === 'manager'

  useEffect(() => {
    if (order) {
      setInternalNote(order.internal_notes ?? '')
      setNoteSaved(false)
      setReceiptState('idle')
      setReceiptUrl(null)
      setReceiptError(null)
    }
  }, [order?.id])

  // Cargar reservas de inventory_reservations para pedidos con reservas activas
  useEffect(() => {
    if (!order?.id) { setReservations([]); return }
    const s = order.status
    if (s !== 'confirmed' && s !== 'shipped' && s !== 'pending' && s !== 'reserved') { setReservations([]); return }

    const supabase = createClient()
    supabase
      .from('inventory_reservations')
      .select('quantity, size, locations:location_id(name), products:product_id(name)')
      .eq('order_id', order.id)
      .in('status', ['reserved', 'confirmed'])
      .then(({ data }) => {
        if (data) {
          setReservations(
            data.map((r) => ({
              location_name: (r.locations as unknown as { name: string } | null)?.name ?? 'Ubicación',
              product_name: (r.products as unknown as { name: string } | null)?.name ?? 'Producto',
              size: r.size ?? null,
              quantity: r.quantity,
            }))
          )
        }
      })
  }, [order?.id, order?.status])

  if (!isOpen || !order) return null

  const isTerminal = order.status === 'completed' || order.status === 'cancelled'
  // Treat pending_payment like reserved for action purposes
  const effectiveStatus: OrderStatus = (order.status as string) === 'pending_payment' ? 'reserved' : order.status as OrderStatus

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!order) return
    if (newStatus === 'cancelled') {
      setShowCancelModal(true)
      return
    }
    setLoadingStatus(newStatus)
    try {
      const result = await updateOrderStatus(order.id, newStatus)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Estado actualizado correctamente')
        onStatusChange(order.id, newStatus)
      }
    } finally {
      setLoadingStatus(null)
    }
  }

  async function handleCancelConfirm(reason: string) {
    if (!order) return
    setShowCancelModal(false)
    setLoadingStatus('cancelled')
    try {
      const result = await updateOrderStatus(order.id, 'cancelled', undefined, undefined, reason)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Pedido cancelado')
        onStatusChange(order.id, 'cancelled')
      }
    } finally {
      setLoadingStatus(null)
    }
  }

  async function handleNoteSave() {
    if (!order) return
    setSavingNote(true)
    try {
      const result = await saveInternalNote(order.id, internalNote)
      if (result.error) {
        toast.error(result.error)
      } else {
        setNoteSaved(true)
        setTimeout(() => setNoteSaved(false), 3000)
      }
    } finally {
      setSavingNote(false)
    }
  }

  async function handleViewReceipt() {
    if (!order?.payment_receipt_url) return
    setReceiptState('loading')
    setReceiptError(null)
    try {
      const result = await getReceiptSignedUrl(order.payment_receipt_url)
      if ('error' in result) {
        setReceiptState('error')
        setReceiptError(result.error ?? null)
      } else {
        setReceiptUrl(result.signedUrl)
        setReceiptState('loaded')
      }
    } catch {
      setReceiptState('error')
      setReceiptError('No se pudo cargar el comprobante')
    }
  }

  const getActionButtons = () => {
    const s = order.status as OrderStatus
    if (s === 'completed') {
      return (
        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-green-50 border-2 border-green-200 rounded-xl text-green-700 font-semibold text-sm">
          🎉 Pedido completado
        </div>
      )
    }
    if (s === 'cancelled') {
      return (
        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-red-50 border-2 border-red-200 rounded-xl text-red-700 font-semibold text-sm">
          ❌ Pedido cancelado
        </div>
      )
    }

    const actions: { status: OrderStatus; label: string; variant: 'primary' | 'danger' }[] = []

    if (s === 'pending') {
      actions.push({ status: 'confirmed', label: '✅ Confirmar pago', variant: 'primary' })
      actions.push({ status: 'cancelled', label: '❌ Cancelar', variant: 'danger' })
    } else if (s === 'reserved') {
      actions.push({ status: 'confirmed', label: '✅ Confirmar pago', variant: 'primary' })
      actions.push({ status: 'cancelled', label: '❌ Cancelar', variant: 'danger' })
    } else if (s === 'confirmed') {
      actions.push({ status: 'shipped', label: '🚚 Marcar como enviado', variant: 'primary' })
      actions.push({ status: 'cancelled', label: '❌ Cancelar', variant: 'danger' })
    } else if (s === 'shipped') {
      actions.push({ status: 'completed', label: '🎉 Marcar completado', variant: 'primary' })
    }

    return (
      <div className="flex flex-col sm:flex-row gap-2">
        {actions.map(({ status, label, variant }) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            disabled={loadingStatus !== null}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm focus:outline-hidden focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none
              ${variant === 'primary'
                ? 'bg-gold-500 text-white hover:bg-gold-600 focus:ring-gold-500'
                : 'bg-zinc-900 text-white hover:bg-black focus:ring-zinc-900 border-transparent sm:flex-none sm:px-4'
              }
            `}
          >
            {loadingStatus === status ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            {label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      <CancelOrderModal
        isOpen={showCancelModal}
        orderId={order.id}
        onConfirm={handleCancelConfirm}
        onClose={() => setShowCancelModal(false)}
      />
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">

          {/* HEADER */}
          <div className="flex items-start justify-between p-5 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">
                  🧾 Pedido #{order.id.slice(0, 8).toUpperCase()}
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.created_at)}</p>
              <div className="mt-2">
                <StatusDropdown
                  currentStatus={order.status as OrderStatus}
                  onSelect={handleStatusChange}
                  disabled={!canEdit || loadingStatus !== null}
                />
              </div>
            </div>
            <button
              onClick={onClose}
              className="ml-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* SCROLLABLE CONTENT */}
          <div className="overflow-y-auto flex-1 p-5 space-y-5">

            {/* CUSTOMER */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cliente</h3>
              <p className="font-semibold text-gray-800">👤 {order.customer_name}</p>
              <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                <span>📱 {order.customer_phone}</span>
                {order.customer_email && <span>📧 {order.customer_email}</span>}
              </div>
            </div>

            {/* DELIVERY / PICKUP INFO */}
            {order.delivery_method && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Información de Entrega
                </h3>
                {order.delivery_method === 'pickup' ? (
                  <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                    <p className="text-sm font-semibold text-zinc-900 mb-1">🏪 Recojo en Tienda</p>
                    <p className="text-sm text-zinc-700">
                      Puesto seleccionado:{' '}
                      <span className="font-bold">{order.pickup_location ?? '—'}</span>
                    </p>
                  </div>
                ) : (
                  <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 space-y-1.5">
                    <p className="text-sm font-semibold text-zinc-900 mb-1">🛵 Envío a Domicilio</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-zinc-700">
                      {order.shipping_address && (
                        <p>
                          <span className="font-medium">Dirección:</span> {order.shipping_address}
                        </p>
                      )}
                      {order.shipping_reference && (
                        <p>
                          <span className="font-medium">Referencia:</span> {order.shipping_reference}
                        </p>
                      )}
                      {order.recipient_name && (
                        <p>
                          <span className="font-medium">Recibe:</span> {order.recipient_name}
                          {order.recipient_phone ? ` (${order.recipient_phone})` : ''}
                        </p>
                      )}
                      {order.delivery_instructions && (
                        <p className="sm:col-span-2">
                          <span className="font-medium">Instrucciones:</span>{' '}
                          {order.delivery_instructions}
                        </p>
                      )}
                      {order.maps_link && (
                        <a
                          href={order.maps_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sm:col-span-2 inline-flex items-center gap-1.5 text-blue-600 underline text-sm font-medium hover:text-blue-800 transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          Ver ubicación en GPS
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PRODUCTS */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Productos ({order.order_items?.length ?? 0})
              </h3>
              <div className="space-y-2">
                {order.order_items?.map((item) => {
                  const product = item.product
                  const name = product?.name ?? 'Producto'
                  const imageUrl = product?.image_url
                  const initial = name.charAt(0).toUpperCase()

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl"
                    >
                      {/* Image */}
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        {imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageUrl}
                            alt={name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 text-blue-700 font-bold text-lg">
                            {initial}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.size ? `Talla: ${item.size} · ` : 'Sin talla · '}
                          {item.quantity} {item.quantity === 1 ? 'ud' : 'uds'} · Bs {formatCurrency(item.unit_price)} c/u
                        </p>
                      </div>

                      {/* Subtotal */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-800 text-sm">Bs {formatCurrency(item.subtotal)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* STOCK RESERVADO POR UBICACIÓN */}
            {reservations.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  Stock reservado para este pedido
                </h3>
                <div className="bg-amber-50 border border-amber-200 rounded-xl divide-y divide-amber-100 overflow-hidden">
                  {reservations.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-700 min-w-[120px]">
                        {r.location_name}
                      </span>
                      <span className="text-gray-400 text-sm">→</span>
                      <span className="text-sm text-gray-700 flex-1 truncate">
                        {r.product_name}
                        {r.size ? ` T.${r.size}` : ''}
                      </span>
                      <span className="text-sm font-bold text-amber-700 flex-shrink-0">
                        × {r.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TOTALS */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Resumen</h3>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>Bs {formatCurrency(order.subtotal)}</span>
              </div>
              {/* Descuento */}
              {(() => {
                const discountValue = (order.discount_amount ?? 0) > 0 ? (order.discount_amount ?? 0) : (order.discount ?? 0);
                if (discountValue > 0) {
                  return (
                    <div className="flex justify-between text-sm font-semibold text-red-600">
                      <span>Descuento Aplicado {order.discount_code_id ? '🎟️' : ''}</span>
                      <span>-Bs {formatCurrency(discountValue)}</span>
                    </div>
                  );
                }
                return null;
              })()}
              {/* Envío */}
              {(order.shipping_cost ?? 0) > 0 && (
                <div className="flex justify-between text-sm text-zinc-500">
                  <span>Costo de Envío 🚚</span>
                  <span>+Bs {formatCurrency(order.shipping_cost!)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-gray-600">
                <span>💳 {order.payment_method}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="font-bold text-gray-900">TOTAL</span>
                <span className="text-xl font-bold text-gray-900">Bs {formatCurrency(order.total)}</span>
              </div>
            </div>

            {/* PAYMENT RECEIPT */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                Comprobante de pago
              </h3>

              {!order.payment_receipt_url ? (
                <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-base flex-shrink-0">⚠️</span>
                  <div>
                    <p className="text-sm font-medium text-amber-700">El cliente no subió comprobante.</p>
                    <p className="text-xs text-amber-600 mt-0.5">Verificá el pago en la app del banco.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {receiptState === 'idle' && (
                    <button
                      onClick={handleViewReceipt}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-blue-200 text-blue-700 font-semibold text-sm rounded-xl hover:bg-blue-50 transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />
                      Ver comprobante
                    </button>
                  )}

                  {receiptState === 'loading' && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 p-3 bg-white border border-gray-200 rounded-xl">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      Cargando comprobante...
                    </div>
                  )}

                  {receiptState === 'error' && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                      ❌ {receiptError}
                    </div>
                  )}

                  {receiptState === 'loaded' && receiptUrl && (
                    <div className="space-y-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={receiptUrl}
                        alt="Comprobante de pago"
                        className="w-full rounded-xl border border-gray-200 object-contain bg-white"
                        style={{ maxHeight: '400px' }}
                      />
                      <div className="flex flex-col sm:flex-row gap-2">
                        <a
                          href={receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-200 text-gray-700 font-medium text-sm rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Abrir en tamaño completo
                        </a>
                        {(order.status === 'reserved' || order.status === 'pending') && canEdit && (
                          <button
                            onClick={() => handleStatusChange('confirmed')}
                            disabled={loadingStatus !== null}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gold-500 text-white font-semibold text-sm rounded-xl hover:bg-gold-600 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm"
                          >
                            {loadingStatus === 'confirmed' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span>✓</span>
                            )}
                            Pago verificado → Confirmar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* INTERNAL NOTES */}
            {canEdit && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    📝 Nota interna
                    <span className="ml-1 font-normal text-gray-300">(solo visible para admins)</span>
                  </h3>
                  {noteSaved && (
                    <span className="text-xs text-green-600 font-medium">Guardado ✓</span>
                  )}
                </div>
                <textarea
                  value={internalNote}
                  onChange={(e) => {
                    setInternalNote(e.target.value)
                    setNoteSaved(false)
                  }}
                  onBlur={handleNoteSave}
                  placeholder="Ej: Cliente confirmó pago por WhatsApp, enviar mañana..."
                  rows={3}
                  disabled={savingNote || isTerminal}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition disabled:bg-gray-50 disabled:cursor-not-allowed"
                />
              </div>
            )}

            {/* STATUS FLOW + ACTIONS */}
            {canEdit && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Flujo de estado
                  </h3>
                  <div className="overflow-x-auto pb-1">
                    <div className="min-w-[320px]">
                      <StatusStepper status={order.status as OrderStatus} />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Acciones
                  </h3>
                  {getActionButtons()}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
