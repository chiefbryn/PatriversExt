import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const MAX_ATTEMPTS = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData } = await userClient.auth.getUser()
    const user = userData?.user
    if (!user) return jr({ error: 'Unauthorized' }, 401)

    const { code } = await req.json().catch(() => ({}))
    if (!code || !/^\d{6}$/.test(String(code))) return jr({ error: 'Invalid code format' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: row } = await admin
      .from('login_otp_codes')
      .select('id, code_hash, expires_at, attempts, consumed_at')
      .eq('user_id', user.id)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!row) return jr({ error: 'No active code. Request a new one.' }, 400)
    if (new Date(row.expires_at) < new Date()) return jr({ error: 'Code expired. Request a new one.' }, 400)
    if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
      await admin.from('login_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)
      return jr({ error: 'Too many attempts. Request a new code.' }, 429)
    }

    const hash = await sha256(String(code))
    if (hash !== row.code_hash) {
      await admin.from('login_otp_codes').update({ attempts: (row.attempts ?? 0) + 1 }).eq('id', row.id)
      const remaining = MAX_ATTEMPTS - ((row.attempts ?? 0) + 1)
      return jr({ error: `Incorrect code. ${Math.max(remaining, 0)} attempts left.` }, 400)
    }

    await admin.from('login_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)
    return jr({ success: true })
  } catch (err) {
    console.error('verify-login-otp error', err)
    return jr({ error: err instanceof Error ? err.message : 'error' }, 500)
  }
})

function jr(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
