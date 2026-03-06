'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { OrderStatus } from '@/lib/types'
import { sendOrderStatusWhatsApp } from '@/lib/whatsapp'
import type { OrderForWhatsApp } from '@/lib/whatsapp'
import { triggerOrderStatusEmail } from '@/lib/utils/email-triggers'

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
    products: { name: string } | null
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
          maps_link,
          shipping_address,
          pickup_location,
          shipping_cost,
          gps_distance_km,
          subtotal,
          total,
          order_items (
            quantity,
            unit_price,
            size,
            color,
            products ( name )
          )
        `)
        .eq('id', orderId)
        .single()

      if (orderData) {
        const raw = orderData as unknown as OrderQueryResult & { delivery_method: string; payment_method: string }

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
        }).catch((err) => console.error('[triggerOrderStatusEmail] Error:', err))


        // WhatsApp (works for both)
        const orderForWhatsApp: OrderForWhatsApp = {
          id: raw.id,
          customer_name: raw.customer_name,
          customer_phone: raw.customer_phone,
          notify_whatsapp: raw.notify_whatsapp ?? false,
          delivery_method: raw.delivery_method ?? 'delivery',
          shipping_address: raw.shipping_address,
          pickup_location: raw.pickup_location ?? null,
          total: raw.total ?? 0,
          cancellation_reason: cancellationReason?.trim() || null,
        }
        await sendOrderStatusWhatsApp(
          orderForWhatsApp,
          newStatus
        ).catch(() => {
          // WhatsApp failure must never block the order status update
        })
      }
    } catch (emailErr) {
      console.error('[updateOrderStatus] Error al obtener pedido para email:', emailErr)
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
