// ── get-signed-url ─────────────────────────────────────────────────────────────
// POST { document_id: string }
//
// Returns a 1-hour signed URL for the requested document.
//
// Permission rules:
//   admin / super_admin  → any document
//   client               → visible_to_client = true AND project.client_id = user.id
//
// Never exposes storage_path, bucket name, or internal error details to the caller.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'project-documents'
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour

const ADMIN_ROLES = new Set(['admin', 'super_admin'])

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

  // User-scoped client — validates JWT and gives us the caller's identity
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // ── 2. Parse request body ───────────────────────────────────────────────────

  let documentId: string
  try {
    const body = await req.json()
    documentId = body?.document_id
    if (!documentId || typeof documentId !== 'string') throw new Error()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }

  // ── 3. Service-role client — used for all DB reads and storage ops ──────────

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 4. Fetch the document record ────────────────────────────────────────────

  const { data: doc, error: docError } = await adminClient
    .from('documents')
    .select('id, storage_path, visible_to_client, project_id')
    .eq('id', documentId)
    .single()

  if (docError || !doc) {
    // Return 403 rather than 404 — don't reveal whether the document exists
    return json({ error: 'Access denied' }, 403)
  }

  // ── 5. Permission check ─────────────────────────────────────────────────────

  // Fetch the caller's role
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'client'

  if (ADMIN_ROLES.has(role)) {
    // Admins: no further checks needed
  } else {
    // Clients: document must be visible + belong to one of their projects
    if (!doc.visible_to_client) {
      return json({ error: 'Access denied' }, 403)
    }

    const { data: project } = await adminClient
      .from('projects')
      .select('client_id')
      .eq('id', doc.project_id)
      .single()

    if (!project || project.client_id !== user.id) {
      return json({ error: 'Access denied' }, 403)
    }
  }

  // ── 6. Generate signed URL ──────────────────────────────────────────────────

  const { data: signedData, error: signedError } = await adminClient
    .storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_EXPIRY_SECONDS)

  if (signedError || !signedData?.signedUrl) {
    // Log the real error server-side only — never send to client
    console.error('[get-signed-url] storage error:', signedError?.message)
    return json({ error: 'Unable to generate download link' }, 500)
  }

  // ── 7. Audit log ────────────────────────────────────────────────────────────

  try {
    await adminClient.from('audit_log').insert({
      user_id:     user.id,
      action:      'document_downloaded',
      entity_type: 'document',
      entity_id:   documentId,
      metadata:    { role },
    })
  } catch (e) {
    // Non-fatal — don't fail the request if audit write fails
    console.error('[get-signed-url] audit log error:', e)
  }

  // ── 8. Return signed URL ────────────────────────────────────────────────────

  return json({ signedUrl: signedData.signedUrl })
})
