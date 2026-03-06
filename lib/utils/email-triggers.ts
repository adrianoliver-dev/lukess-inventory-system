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
            console.log(`[triggerOrderStatusEmail] Sent ${emailType} for order ${orderId}`)
        }
    } catch (err) {
        console.error('[triggerOrderStatusEmail] Exception:', err)
    }
}
