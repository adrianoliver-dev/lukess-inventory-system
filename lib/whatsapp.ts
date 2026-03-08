export interface OrderForWhatsApp {
  id: string
  customer_name: string
  customer_phone: string | null
  notify_whatsapp: boolean
  delivery_method: string
  payment_method: string
  shipping_address: string | null
  pickup_location: string | null
  total: number
  cancellation_reason?: string | null
}

export type WhatsAppTemplateConfig = {
  templateName: string;
  variables: string[];
  headerImage?: string;
};



export function getWhatsAppTemplate(
  order: OrderForWhatsApp,
  newStatus: string,
  nextPurchaseDiscountCode?: string
): WhatsAppTemplateConfig | null {

  const orderNumber = order.id.substring(0, 8).toUpperCase();
  const name = (order.customer_name || '').trim().replace(/\n/g, ' ');

  const isPickup = order.delivery_method === 'pickup';
  const isCashOnPickup = isPickup && (order.payment_method === 'cash_on_pickup' || order.payment_method === 'efectivo' || order.payment_method === 'cash');

  switch (newStatus) {
    case 'pending':
      return {
        templateName: 'pedido_recibido',
        variables: [name, orderNumber, order.total.toFixed(2)] // {{1}}=name, {{2}}=order, {{3}}=total
      };

    case 'pending_payment':
      if (isCashOnPickup) {
        return {
          templateName: 'pedido_reservado_pago_en_tienda_',
          variables: [name, orderNumber, order.total.toFixed(2)]
        };
      }
      return null;

    case 'confirmed':
      if (isPickup) {
        return {
          templateName: 'pago_confirmado_pickup_qr',
          variables: [orderNumber, name]
        };
      }
      return {
        templateName: 'pago_confirmado_u',
        variables: [orderNumber, name] // {{1}}=order, {{2}}=name
      };

    case 'shipped':
      // 'shipped' in DB represents 'En camino' or 'Listo para recoger'
      if (isPickup) {
        return {
          templateName: 'pedido_listo_recojo',
          variables: [orderNumber, name, order.pickup_location ?? 'tienda'] // {{3}}=location
        };
      }
      return {
        templateName: 'pedido_en_camino',
        variables: [orderNumber, name, order.shipping_address ?? 'tu dirección'] // {{3}}=address
      };

    case 'completed':
      if (nextPurchaseDiscountCode) {
        return {
          templateName: 'pedido_entregado',
          variables: [name, orderNumber, nextPurchaseDiscountCode],
          headerImage: 'https://lrcggpdgrqltqbxqnjgh.supabase.co/storage/v1/object/public/banners/whatsapp/entregado.png'
        };
      }
      return {
        templateName: 'pedido_entregado_simple',
        variables: [orderNumber, name],
        headerImage: 'https://lrcggpdgrqltqbxqnjgh.supabase.co/storage/v1/object/public/banners/whatsapp/entregado.png'
      };

    case 'cancelled':
      return {
        templateName: 'pedido_cancelado_u',
        variables: [orderNumber, name, order.cancellation_reason ?? 'Motivo no especificado']
      };

    default:
      return null;
  }
}

export async function sendOrderStatusWhatsApp(
  order: OrderForWhatsApp,
  newStatus: string,
  discountCode?: string
): Promise<void> {
  if (!order.notify_whatsapp) return
  if (!order.customer_phone?.trim()) return

  const config = getWhatsAppTemplate(order, newStatus, discountCode)
  if (!config) return

  const { templateName, variables, headerImage } = config

  const rawPhone = order.customer_phone.trim().replace(/\D/g, '')
  const formattedPhone = rawPhone.startsWith('591')
    ? rawPhone
    : `591${rawPhone}`

  // Trim trailing slash to prevent double slashes (e.g. 'https://domain.com/' + '/api/...')
  const landingUrl = (process.env.LANDING_URL ?? 'https://lukess-home.vercel.app').replace(/\/+$/, '')
  const url = `${landingUrl}/api/send-whatsapp`

  console.log('[WhatsApp → Inventory] Sending to:', url, '| template:', templateName)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: formattedPhone, templateName, variables, headerImage }),
  })

  if (!res.ok) {
    // Parse the JSON error body from /api/send-whatsapp for structured Meta API debug info
    let errorBody: unknown;
    try {
      errorBody = await res.json()
    } catch {
      errorBody = await res.text()
    }
    console.error('[WhatsApp → Inventory] API error:', {
      status: res.status,
      templateName,
      to: formattedPhone,
      errorBody,
    })
    throw new Error(JSON.stringify(errorBody))
  }
}
