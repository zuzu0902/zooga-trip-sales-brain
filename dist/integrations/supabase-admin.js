import { createClient } from '@supabase/supabase-js';
let cached = null;
export function getSupabaseAdmin() {
    if (cached)
        return cached;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        const missing = [!url ? 'SUPABASE_URL' : null, !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null].filter(Boolean).join(', ');
        throw new Error(`Missing Supabase environment variables: ${missing}`);
    }
    cached = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
    return cached;
}
