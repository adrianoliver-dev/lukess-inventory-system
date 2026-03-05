const LANDING_API_URL = process.env.NEXT_PUBLIC_LANDING_API_URL || 'https://lukess-home.vercel.app'

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
}

export async function triggerOrderStatusEmail(data: EmailTriggerData): Promise<void> {
    // Only send emails for pickup orders with specific transitions
    if (data.deliveryMethod !== 'pickup') return

    let emailType: string | null = null
    let emailData: Record<string, unknown> = {}

    // Determine which email to send based on status transition
    if (data.oldStatus === 'pending_payment' && data.newStatus === 'confirmed') {
        emailType = 'pickup_payment_confirmed'
        emailData = {
            orderId: data.orderId,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            pickupLocationName: data.pickupLocation || 'Mercado Mutualista',
        }
    } else if (
        (data.oldStatus === 'confirmed' || data.oldStatus === 'pending') &&
        data.newStatus === 'shipped'
    ) {
        emailType = 'pickup_ready_for_collection'
        emailData = {
            orderId: data.orderId,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            pickupLocationName: data.pickupLocation || 'Mercado Mutualista',
            pickupLocationAddress: 'Pasillo B3, Puesto 3', // TODO: Get from PICKUP_LOCATIONS
            expiresInHours: 48,
        }
    } else if (data.newStatus === 'cancelled') {
        emailType = 'order_cancelled'
        emailData = {
            orderId: data.orderId,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            cancellationReason: data.cancellationReason || 'other',
            customCancellationReason: data.customCancellationReason,
        }
    }

    if (!emailType) return

    try {
        const response = await fetch(`${LANDING_API_URL}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: emailType,
                orderData: emailData,
            }),
        })

        if (!response.ok) {
            const error = await response.json()
            console.error('[triggerOrderStatusEmail] API error:', error)
        } else {
            console.log(`[triggerOrderStatusEmail] Sent ${emailType} for order ${data.orderId}`)
        }
    } catch (err) {
        console.error('[triggerOrderStatusEmail] Exception:', err)
    }
}
