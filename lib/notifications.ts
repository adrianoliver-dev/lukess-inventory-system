export interface OrderItemForEmail {
  name: string
  quantity: number
  unit_price: number
  size: string | null
  color: string | null
}

export interface OrderForEmail {
  id: string
  customer_name: string
  customer_email: string | null
  notify_email: boolean
  maps_link: string | null
  shipping_address: string | null
  shipping_cost: number
  gps_distance_km: number | null
  subtotal: number
  total: number
  cancellationReason?: string
  items?: OrderItemForEmail[]
}

const STATUS_TO_EMAIL_TYPE: Record<string, string> = {
  confirmed: 'order_paid',
  paid: 'order_paid',
  shipped: 'order_shipped',
  completed: 'order_completed',
  cancelled: 'order_cancelled',
}

export async function sendOrderStatusEmail(
  order: OrderForEmail,
  newStatus: string
): Promise<void> {
  const emailType = STATUS_TO_EMAIL_TYPE[newStatus]


  if (!emailType) return
  if (!order.notify_email) return
  if (!order.customer_email) return

  const landingUrl = process.env.LANDING_URL ?? 'https://lukess-home.vercel.app'

  try {

    const res = await fetch(`${landingUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: emailType,
        orderData: {
          orderId: order.id,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          items: order.items ?? [],
          subtotal: order.subtotal,
          shippingCost: order.shipping_cost,
          shippingDistance: order.gps_distance_km,
          deliveryAddress: order.shipping_address,
          locationUrl: order.maps_link,
          discountAmount: 0,
          discountCode: null,
          total: order.total,
          cancellationReason: order.cancellationReason ?? null,
        },
      }),
    })


    if (!res.ok) {
      const body = await res.text()
      console.error('[email] error body:', body)
    }
  } catch (err) {
    console.error('[sendOrderStatusEmail] Error enviando notificación de email:', err)
  }
}
