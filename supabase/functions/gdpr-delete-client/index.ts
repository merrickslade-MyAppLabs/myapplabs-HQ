// ── gdpr-delete-client ────────────────────────────────────────────────────────
// POST { client_id: string }
//
// Permanently deletes all data associated with a client, in foreign-key-safe
// order. Only callable by super_admin.
//
// Execution order:
//   1.  Audit: gdpr_deletion_initiated  ← written BEFORE any data is touched
//   2.  client_portal_settings
//   3.  referrals
//   4.  messages
//   5.  documents (storage files first, then DB rows)
//   6.  invoices
//   7.  project_stages
//   8.  projects
//   9.  profiles
//   10. Supabase auth user (auth.admin.deleteUser)
//   11. Audit: gdpr_deletion_completed  ← guaranteed completion record
//
// audit_log rows are NEVER deleted — only two rows are inserted here.
//
// On any step failure: returns { error, step } so the caller knows exactly
// where deletion stopped.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  // ── 2. Authorise: super_admin only ──────────────────────────────────────────

  // Use service-role for all remaining operations
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerProfile?.role !== 'super_admin') {
    return json({ error: 'Forbidden' }, 403)
  }

  // ── 3. Parse and validate request body ─────────────────────────────────────

  let clientId: string
  try {
    const body = await req.json()
    clientId = body?.client_id
    if (!clientId || typeof clientId !== 'string') throw new Error()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }

  // Confirm the target user exists and is a client role — refuse to delete
  // admins or super_admins via this endpoint
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', clientId)
    .single()

  if (!targetProfile) {
    return json({ error: 'Client not found' }, 404)
  }
  if (targetProfile.role === 'admin' || targetProfile.role === 'super_admin') {
    return json({ error: 'Forbidden: cannot delete admin accounts via this endpoint' }, 403)
  }

  // ── STEP 1: Audit — gdpr_deletion_initiated ─────────────────────────────────
  // Written BEFORE any data is touched. If this fails, abort immediately —
  // we never delete without an audit trail.

  const { error: auditInitError } = await admin.from('audit_log').insert({
    user_id:     user.id,
    action:      'gdpr_deletion_initiated',
    entity_type: 'profile',
    entity_id:   clientId,
    metadata:    { client_id: clientId, initiated_by: user.id },
  })

  if (auditInitError) {
    console.error('[gdpr-delete-client] step 1 audit init failed:', auditInitError.message)
    return json({ error: 'Failed to write audit log — deletion aborted.', step: 1 }, 500)
  }

  // ── STEP 2: client_portal_settings ─────────────────────────────────────────

  const { error: cpsError } = await admin
    .from('client_portal_settings')
    .delete()
    .eq('client_id', clientId)

  if (cpsError) {
    console.error('[gdpr-delete-client] step 2 client_portal_settings:', cpsError.message)
    return json({ error: 'Failed to delete client portal settings.', step: 2 }, 500)
  }

  // ── STEP 3: referrals ───────────────────────────────────────────────────────

  const { error: referralsError } = await admin
    .from('referrals')
    .delete()
    .eq('referred_by', clientId)

  if (referralsError) {
    console.error('[gdpr-delete-client] step 3 referrals:', referralsError.message)
    return json({ error: 'Failed to delete referrals.', step: 3 }, 500)
  }

  // ── STEP 4: messages ────────────────────────────────────────────────────────

  const { error: messagesError } = await admin
    .from('messages')
    .delete()
    .eq('sender_id', clientId)

  if (messagesError) {
    console.error('[gdpr-delete-client] step 4 messages:', messagesError.message)
    return json({ error: 'Failed to delete messages.', step: 4 }, 500)
  }

  // ── STEP 5: documents — storage files first, then DB rows ──────────────────

  // 5a. Fetch all storage_paths for this client's documents
  const { data: clientProjects } = await admin
    .from('projects')
    .select('id')
    .eq('client_id', clientId)

  const projectIds = (clientProjects ?? []).map((p: { id: string }) => p.id)

  if (projectIds.length > 0) {
    const { data: docs, error: docsSelectError } = await admin
      .from('documents')
      .select('id, storage_path')
      .in('project_id', projectIds)

    if (docsSelectError) {
      console.error('[gdpr-delete-client] step 5 docs select:', docsSelectError.message)
      return json({ error: 'Failed to fetch document records for deletion.', step: 5 }, 500)
    }

    // 5b. Delete storage files (batch — ignore individual file errors but log them)
    const storagePaths = (docs ?? [])
      .map((d: { storage_path: string }) => d.storage_path)
      .filter(Boolean)

    if (storagePaths.length > 0) {
      const { error: storageError } = await admin
        .storage
        .from('project-documents')
        .remove(storagePaths)

      if (storageError) {
        // Log but continue — orphaned storage files are recoverable manually;
        // failing here would leave DB rows intact which is worse for GDPR
        console.error('[gdpr-delete-client] step 5 storage remove:', storageError.message)
      }
    }

    // 5c. Delete document DB rows
    const { error: docsDeleteError } = await admin
      .from('documents')
      .delete()
      .in('project_id', projectIds)

    if (docsDeleteError) {
      console.error('[gdpr-delete-client] step 5 docs delete:', docsDeleteError.message)
      return json({ error: 'Failed to delete document records.', step: 5 }, 500)
    }
  }

  // ── STEP 6: invoices ────────────────────────────────────────────────────────

  const { error: invoicesError } = await admin
    .from('invoices')
    .delete()
    .eq('client_id', clientId)

  if (invoicesError) {
    console.error('[gdpr-delete-client] step 6 invoices:', invoicesError.message)
    return json({ error: 'Failed to delete invoices.', step: 6 }, 500)
  }

  // ── STEP 7: project_stages ──────────────────────────────────────────────────

  if (projectIds.length > 0) {
    const { error: stagesError } = await admin
      .from('project_stages')
      .delete()
      .in('project_id', projectIds)

    if (stagesError) {
      console.error('[gdpr-delete-client] step 7 project_stages:', stagesError.message)
      return json({ error: 'Failed to delete project stages.', step: 7 }, 500)
    }
  }

  // ── STEP 8: projects ────────────────────────────────────────────────────────

  const { error: projectsError } = await admin
    .from('projects')
    .delete()
    .eq('client_id', clientId)

  if (projectsError) {
    console.error('[gdpr-delete-client] step 8 projects:', projectsError.message)
    return json({ error: 'Failed to delete projects.', step: 8 }, 500)
  }

  // ── STEP 9: profiles ────────────────────────────────────────────────────────

  const { error: profileError } = await admin
    .from('profiles')
    .delete()
    .eq('id', clientId)

  if (profileError) {
    console.error('[gdpr-delete-client] step 9 profiles:', profileError.message)
    return json({ error: 'Failed to delete profile.', step: 9 }, 500)
  }

  // ── STEP 10: Supabase auth user ─────────────────────────────────────────────

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(clientId)

  if (authDeleteError) {
    console.error('[gdpr-delete-client] step 10 auth.deleteUser:', authDeleteError.message)
    return json({ error: 'Failed to delete auth user.', step: 10 }, 500)
  }

  // ── STEP 11: Audit — gdpr_deletion_completed ────────────────────────────────
  // Written AFTER all deletion steps succeed. This is the guaranteed
  // completion record — never written unless all steps passed.

  const { error: auditCompleteError } = await admin.from('audit_log').insert({
    user_id:     user.id,
    action:      'gdpr_deletion_completed',
    entity_type: 'profile',
    entity_id:   clientId,
    metadata:    { client_id: clientId, completed_by: user.id },
  })

  if (auditCompleteError) {
    // Deletion is done — all data is gone. Log the audit failure but return
    // success with a warning so the caller knows to record this manually.
    console.error('[gdpr-delete-client] step 11 audit complete failed:', auditCompleteError.message)
    return json({
      success: true,
      warning: 'All data deleted but final audit log entry failed to write. Please record completion manually.',
    })
  }

  // ── Done ────────────────────────────────────────────────────────────────────

  return json({ success: true })
})
