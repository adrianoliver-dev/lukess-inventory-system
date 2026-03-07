// Use the server-only LANDING_URL (no NEXT_PUBLIC_ prefix needed — this file only runs server-side)
// Trim trailing slash to prevent double slashes when concatenating paths
const LANDING_BASE_URL = (process.env.LANDING_URL ?? 'https://lukess-home.vercel.app').replace(/\/+$/, '')

// Shape of each order item forwarded to the Landing email builder
interface EmailOrderItem {
    products?: { name?: string } | null
    unit_price: number
    quantity: number
    size?: string | null
    color?: string | null
    image_url?: string | null
}

type EmailTriggerData = {
    orderId: string
    customerName: string
    customerEmail: string
    oldStatus?: string
    newStatus: string
    deliveryMethod: 'delivery' | 'pickup' | string
    paymentMethod?: 'qr' | 'cash_on_pickup' | string
    pickupLocation?: string
    cancellationReason?: string
    customCancellationReason?: string
    // Full order financials — required by the Landing’s buildCostBreakdown()
    total?: number
    subtotal?: number
    shippingCost?: number
    discountAmount?: number
    items?: EmailOrderItem[]
    // Loyalty discount code shown in completion emails
    discountCode?: string
}

export async function triggerOrderStatusEmail(data: EmailTriggerData): Promise<void> {
    const {
        deliveryMethod,
        paymentMethod,
        newStatus,
        orderId,
        customerName,
        customerEmail,
        pickupLocation,
        cancellationReason,
        customCancellationReason
    } = data

    let emailType: string | null = null
    let emailData: Record<string, unknown> = {
        orderId,
        customerName,
        customerEmail,
    }

    // Delivery flow (QR only for now)
    if (deliveryMethod === 'delivery') {
        if (newStatus === 'pending') emailType = 'order_confirmation'
        if (newStatus === 'confirmed') emailType = 'order_paid'
        if (newStatus === 'shipped') emailType = 'order_shipped'
        if (newStatus === 'completed') emailType = 'order_completed'
        if (newStatus === 'cancelled') {
            emailType = 'order_cancelled'
            emailData.cancellationReason = cancellationReason || 'other'
            emailData.customCancellationReason = customCancellationReason
        }
    }

    // Pickup flow
    if (deliveryMethod === 'pickup') {
        if (paymentMethod === 'cash_on_pickup' || paymentMethod === 'efectivo' || paymentMethod === 'cash') {
            if (newStatus === 'pending_payment') emailType = 'pickup_reservation_received'
            if (newStatus === 'ready_for_pickup' || newStatus === 'shipped') {
                emailType = 'pickup_ready_for_collection'
                emailData.pickupLocationName = pickupLocation || 'Mercado Mutualista'
                emailData.pickupLocationAddress = 'Pasillo B3, Puesto 3'
                emailData.expiresInHours = 48
            }
            if (newStatus === 'completed') emailType = 'pickup_completed'
        } else {
            // Pickup + QR
            if (newStatus === 'pending') emailType = 'pickup_order_received'
            if (newStatus === 'confirmed') {
                emailType = 'pickup_payment_confirmed'
                emailData.pickupLocationName = pickupLocation || 'Mercado Mutualista'
            }
            if (newStatus === 'ready_for_pickup' || newStatus === 'shipped') {
                emailType = 'pickup_ready_for_collection'
                emailData.pickupLocationName = pickupLocation || 'Mercado Mutualista'
                emailData.pickupLocationAddress = 'Pasillo B3, Puesto 3'
                emailData.expiresInHours = 48
            }
            if (newStatus === 'completed') emailType = 'pickup_completed'
        }
        if (newStatus === 'cancelled') {
            emailType = 'order_cancelled'
            emailData.cancellationReason = cancellationReason || 'other'
            emailData.customCancellationReason = customCancellationReason
        }
    }

    if (!emailType) return

    try {
        const endpoint = `${LANDING_BASE_URL}/api/send-email`
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: emailType,
                orderData: {
                    orderId,
                    customerName,
                    customerEmail,
                    // Financial fields — required by Landing's buildCostBreakdown (total.toFixed() crashes without these)
                    total: data.total ?? 0,
                    subtotal: data.subtotal,
                    shippingCost: data.shippingCost,
                    discountAmount: data.discountAmount,
                    // Items for the product list in the email body
                    items: data.items ?? [],
                    // Loyalty discount code for completion emails
                    discountCode: data.discountCode,
                    // Contextual fields
                    deliveryMethod: deliveryMethod as 'delivery' | 'pickup',
                    pickupLocationName: pickupLocation || 'Mercado Mutualista', // Default if not provided
                    pickupLocationAddress: 'Pasillo B3, Puesto 3', // Hardcoded for now
                    expiresInHours: 48, // Hardcoded for now
                    cancellationReason: cancellationReason || 'other', // Default if not provided
                    customCancellationReason: customCancellationReason,
                },
            }),
        })

        if (!response.ok) {
            let errorBody: string
            try { errorBody = await response.text() } catch { errorBody = '(unable to read body)' }
            console.error('[triggerOrderStatusEmail] HTTP error:', {
                status: response.status,
                emailType,
                orderId,
                endpoint,
                errorBody,
            })
        } else {
            console.log(`[triggerOrderStatusEmail] Sent ${emailType} for order ${orderId}`)
        }
    } catch (err) {
        console.error('[triggerOrderStatusEmail] Exception:', err)
    }
}
