// ── rate-limit-messages ────────────────────────────────────────────────────────
// POST (no body required — the user is identified from the JWT)
//
// Counts messages sent by the authenticated user in the last 60 minutes.
// Returns:
//   200  { allowed: true }              — under the limit, proceed
//   429  { error: "<friendly message>" } — limit hit, block the send
//
// Never exposes internal error details to the caller.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WINDOW_MINUTES = 60
const MAX_MESSAGES   = 10

const RATE_LIMIT_MESSAGE =
  "You've sent a lot of messages recently. Please wait a moment before sending more."

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── 1. Authenticate the caller ──────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // User-scoped client — validates the JWT
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // ── 2. Count recent messages (service-role for reliable DB access) ──────────

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()

  const { count, error: countError } = await adminClient
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', user.id)
    .gte('created_at', windowStart)

  if (countError) {
    // Log real error server-side only — fail open so a DB hiccup doesn't
    // permanently block legitimate sends
    console.error('[rate-limit-messages] count error:', countError.message)
    return json({ allowed: true })
  }

  // ── 3. Enforce limit ────────────────────────────────────────────────────────

  if ((count ?? 0) >= MAX_MESSAGES) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  return json({ allowed: true })
})
