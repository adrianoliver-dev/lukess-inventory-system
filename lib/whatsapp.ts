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

/** URL for the header image on the `pedido_entregado` template */
const ENTREGADO_HEADER_IMAGE =
  'https://lukess-home.vercel.app/images/entregado.png'

export function getWhatsAppTemplate(
  order: OrderForWhatsApp,
  newStatus: string,
  nextPurchaseDiscountCode?: string
): WhatsAppTemplateConfig | null {

  const orderNumber = order.id.substring(0, 8).toUpperCase();
  const name = order.customer_name;

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
          variables: [orderNumber, name]
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
        templateName: 'pago_confirmado',
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
          variables: [orderNumber, name, nextPurchaseDiscountCode], // {{1}}=order, {{2}}=name, {{3}}=discount
          headerImage: ENTREGADO_HEADER_IMAGE
        };
      }
      return {
        templateName: 'pedido_entregado_simple',
        variables: [orderNumber, name], // {{1}}=order, {{2}}=name
        headerImage: ENTREGADO_HEADER_IMAGE
      };

    case 'cancelled':
      return {
        templateName: 'pedido_cancelado',
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

  const landingUrl = process.env.LANDING_URL ?? 'https://lukess-home.vercel.app'
  const url = `${landingUrl}/api/send-whatsapp`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: formattedPhone, templateName, variables, headerImage }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[whatsapp] ${res.status} — ${text}`)
  }
}
