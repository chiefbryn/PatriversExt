import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const OTP_TTL_MIN = 10

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
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, otp_enabled, otp_email')
      .eq('user_id', user.id)
      .single()

    if (!profile?.otp_enabled || !profile?.otp_email) {
      return new Response(JSON.stringify({ error: 'OTP not enabled for this user' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Server-side send limits: at most one code per 60 seconds and five per hour per account
    const { data: recent } = await admin
      .from('login_otp_codes')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
      .order('created_at', { ascending: false })
    const recentList = recent ?? []
    const lastAt = recentList[0]?.created_at ? new Date(recentList[0].created_at).getTime() : 0
    if (Date.now() - lastAt < 60_000 || recentList.length >= 5) {
      return new Response(JSON.stringify({ error: 'Please wait before requesting another code' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const hash = await sha256(code)
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString()

    // Invalidate prior unused codes for this user
    await admin.from('login_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('user_id', user.id).is('consumed_at', null)

    const { error: insErr } = await admin.from('login_otp_codes').insert({
      user_id: user.id,
      code_hash: hash,
      expires_at: expiresAt,
    })
    if (insErr) throw insErr

    // Fire-and-forget: respond fast, send email in the background
    const sendPromise = fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: 'login-otp',
        recipientEmail: profile.otp_email,
        idempotencyKey: `login-otp-${user.id}-${Date.now()}`,
        templateData: { code, fullName: profile.full_name, expiresInMinutes: OTP_TTL_MIN },
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('send-transactional-email failed', r.status, await r.text())
    }).catch((e) => console.error('send-transactional-email error', e))

    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(sendPromise)

    return new Response(JSON.stringify({ success: true, expiresAt }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('send-login-otp error', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
