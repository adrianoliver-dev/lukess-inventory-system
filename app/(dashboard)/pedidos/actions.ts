'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { OrderStatus } from '@/lib/types'
import { sendOrderStatusWhatsApp } from '@/lib/whatsapp'
import type { OrderForWhatsApp } from '@/lib/whatsapp'
import { triggerOrderStatusEmail } from '@/lib/utils/email-triggers'
import { generateWelcomeBackDiscount } from '@/lib/utils/discounts'

type OrderQueryResult = {
  id: string
  customer_name: string
  customer_email: string | null
  notify_email: boolean
  customer_phone: string | null
  notify_whatsapp: boolean
  delivery_method: string
  maps_link: string | null
  shipping_address: string | null
  pickup_location: string | null
  shipping_cost: number
  gps_distance_km: number | null
  subtotal: number
  total: number
  order_items: {
    quantity: number
    unit_price: number
    size: string | null
    color: string | null
    products: { name: string; image_url: string | null } | null
  }[]
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  internalNote?: string,
  fulfillmentNotes?: string,
  cancellationReason?: string
) {
  try {
    // Obtener estado anterior
    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('status, delivery_method, payment_method, pickup_location')
      .eq('id', orderId)
      .single()

    const oldStatus = currentOrder?.status

    const isCashOnPickup = currentOrder?.delivery_method === 'pickup' &&
      (currentOrder?.payment_method === 'cash_on_pickup' ||
        currentOrder?.payment_method === 'efectivo' ||
        currentOrder?.payment_method === 'cash')

    if (isCashOnPickup && newStatus === 'confirmed') {
      return { error: 'Los pedidos con pago en efectivo al recoger saltan el estado Confirmado. Marca como "Listo para recoger" directamente.' }
    }

    // Validar autenticación y permisos con el cliente de sesión
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!profile?.is_active || profile.role === 'staff') {
      return { error: 'Sin permisos para cambiar estado de pedidos' }
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      managed_by: user.id,
      updated_at: new Date().toISOString(),
    }

    if (internalNote?.trim()) {
      updateData.internal_notes = internalNote.trim()
    }

    if (fulfillmentNotes?.trim()) {
      updateData.fulfillment_notes = fulfillmentNotes.trim()
    }

    if (newStatus === 'cancelled' && cancellationReason?.trim()) {
      updateData.notes = cancellationReason.trim()
    }

    // Usar service role para el UPDATE: evita problemas de RLS con cookies
    const { data: updated, error } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select('id, discount_code_id')

    if (error) return { error: error.message }

    if (!updated || updated.length === 0) {
      return { error: 'Pedido no encontrado o no se pudo actualizar.' }
    }


    try {
      const { data: orderData } = await supabaseAdmin
        .from('orders')
        .select(`
          id,
          customer_name,
          customer_email,
          notify_email,
          customer_phone,
          notify_whatsapp,
          delivery_method,
          payment_method,
          whatsapp_last_status_sent,
          maps_link,
          shipping_address,
          pickup_location,
          shipping_cost,
          gps_distance_km,
          subtotal,
          total,
          discount_code_id,
          order_items (
            quantity,
            unit_price,
            size,
            color,
            products ( name, image_url )
          )
        `)
        .eq('id', orderId)
        .single()

      if (orderData) {
        const raw = orderData as unknown as OrderQueryResult & { delivery_method: string; payment_method: string; whatsapp_last_status_sent: string | null; discount_code_id: string | null }

        // ── Email trigger ─────────────────────────────────────────────────────
        // Fire-and-forget; pass the FULL financial payload so Landing buildCostBreakdown()
        // never crashes with undefined.toFixed()

        // Generate loyalty discount code ONCE upfront so both Email and WhatsApp can use it.
        // Only generate if order is completed AND no existing discount was used on this order.
        let discountCodeForEmail: string | undefined = undefined
        if (newStatus === 'completed' && !raw.discount_code_id) {
          try {
            discountCodeForEmail = await generateWelcomeBackDiscount(raw.id, raw.customer_email)
          } catch (discountErr) {
            console.error('[generateWelcomeBackDiscount] Error:', discountErr)
          }
        }

        triggerOrderStatusEmail({
          orderId: raw.id,
          customerName: raw.customer_name,
          customerEmail: raw.customer_email || '',
          oldStatus: oldStatus || undefined,
          newStatus: newStatus,
          deliveryMethod: raw.delivery_method,
          paymentMethod: raw.payment_method || undefined,
          pickupLocation: raw.pickup_location || undefined,
          cancellationReason: cancellationReason?.trim() || undefined,
          // Financial fields required by Landing email templates
          total: raw.total ?? 0,
          subtotal: raw.subtotal ?? raw.total ?? 0,
          shippingCost: raw.shipping_cost ?? 0,
          items: (raw.order_items ?? []).map((item) => ({
            ...item,
            image_url: item.products?.image_url ?? null,
          })),
          // Loyalty code for the completion email
          discountCode: discountCodeForEmail,
        }).catch((err) => console.error('[triggerOrderStatusEmail] Error:', err))

        // ── WhatsApp trigger ──────────────────────────────────────────────────
        // Fully independent from Email: if WA fails, email still fires.
        if (raw.whatsapp_last_status_sent !== newStatus) {
          try {
            // Reuse the discount code already generated for Email above.
            // For non-completed statuses discountCodeForEmail is undefined, which is correct.
            const orderForWhatsApp: OrderForWhatsApp = {
              id: raw.id,
              customer_name: raw.customer_name,
              customer_phone: raw.customer_phone,
              notify_whatsapp: raw.notify_whatsapp ?? false,
              delivery_method: raw.delivery_method ?? 'delivery',
              payment_method: raw.payment_method ?? 'qr',
              shipping_address: raw.shipping_address,
              pickup_location: raw.pickup_location ?? null,
              total: raw.total ?? 0,
              cancellation_reason: cancellationReason?.trim() || null,
            }

            await sendOrderStatusWhatsApp(orderForWhatsApp, newStatus, discountCodeForEmail)
            // Mark WA as sent ONLY after successful dispatch
            await supabaseAdmin.from('orders').update({ whatsapp_last_status_sent: newStatus }).eq('id', raw.id)
          } catch (waErr) {
            console.error('[sendOrderStatusWhatsApp] Error (email still fires):', waErr)
          }
        }
      }
    } catch (triggerErr) {
      console.error('[updateOrderStatus] Error al obtener pedido para triggers:', triggerErr)
    }

    revalidatePath('/pedidos')
    return { success: true }
  } catch (err) {
    console.error('updateOrderStatus error:', err)
    return { error: 'Error interno del servidor' }
  }
}

export async function getReceiptSignedUrl(receiptPath: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!profile?.is_active || profile.role === 'staff') {
      return { error: 'Sin permisos para ver comprobantes' }
    }

    const { data, error } = await supabaseAdmin.storage
      .from('payment-receipts')
      .createSignedUrl(receiptPath, 3600)

    if (error) return { error: error.message }

    return { signedUrl: data.signedUrl }
  } catch (err) {
    console.error('getReceiptSignedUrl error:', err)
    return { error: 'Error interno del servidor' }
  }
}

export async function saveInternalNote(orderId: string, note: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!profile?.is_active || profile.role === 'staff') {
      return { error: 'Sin permisos' }
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .update({ internal_notes: note.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    if (error) return { error: error.message }

    revalidatePath('/pedidos')
    return { success: true }
  } catch (err) {
    console.error('saveInternalNote error:', err)
    return { error: 'Error interno del servidor' }
  }
}
