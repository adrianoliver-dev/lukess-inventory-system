import { supabaseAdmin } from '@/lib/supabase/admin'

export async function generateWelcomeBackDiscount(orderId: string, customerEmail?: string | null): Promise<string> {
    const discountCode = `GRACIAS-${orderId.slice(0, 8).toUpperCase()}`

    const { error } = await supabaseAdmin.from('discount_codes').insert({
        code: discountCode,
        discount_type: 'percentage',
        discount_percentage: 10,
        max_uses: 1,
        is_active: true,
        assigned_email: customerEmail?.toLowerCase().trim() || null,
        expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    })

    // 23505 is the unique key violation code in Postgres. 
    // We ignore it because we might be re-triggering the same order completion status.
    if (error && error.code !== '23505') {
        console.error('[generateWelcomeBackDiscount] Error inserting discount code:', error)
    }

    return discountCode;
}
