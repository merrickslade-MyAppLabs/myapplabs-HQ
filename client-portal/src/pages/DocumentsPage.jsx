import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'

// ── Auth token helper ──────────────────────────────────────────────────────────

async function getBearerToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

// ── Type config ───────────────────────────────────────────────────────────────
// Maps document_type enum values to client-friendly labels and colours.

const TYPE_CONFIG = {
  proposal: { label: 'Proposal',      bg: 'rgba(99,102,241,0.1)',  color: '#6366f1' },
  contract: { label: 'Contract',      bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
  invoice:  { label: 'Invoice',       bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  handover: { label: 'Handover Guide', bg: 'rgba(11,31,58,0.08)',  color: '#0B1F3A' },
  other:    { label: 'Other',         bg: 'rgba(107,114,128,0.1)',color: '#6b7280' },
}

function typeCfg(type) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.other
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const cfg = typeCfg(type)
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

// ── Download handler ──────────────────────────────────────────────────────────

/**
 * Requests a short-lived signed URL from the get-signed-url Edge Function
 * and opens it in a new tab.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO — Part 5: Wire up the Edge Function.
 *
 * Replace the placeholder body below with:
 *
 *   const { data, error } = await supabase.functions.invoke('get-signed-url', {
 *     body: { path: storagePath },
 *   })
 *   if (error || !data?.signedUrl) {
 *     setDownloadError(docId)
 *     return
 *   }
 *   window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
 *
 * The Edge Function runs with service_role, validates that the requesting user
 * owns the project the document belongs to, then calls
 * supabase.storage.from('documents').createSignedUrl(path, 300).
 *
 * storagePath is the internal bucket path (documents/{projectId}/{filename}).
 * It is NEVER shown in the UI — it is only passed server-side.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function requestDownload(storagePath, docId, setDownloading, setDownloadError) {
  void storagePath // storage_path is never sent to the client — document_id is the only identifier
  setDownloading(docId)
  setDownloadError(null)

  try {
    const token = await getBearerToken()
    if (!token) { setDownloadError(docId); return }

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-signed-url`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ document_id: docId }),
      },
    )

    if (!res.ok) { setDownloadError(docId); return }

    const { signedUrl } = await res.json()
    if (!signedUrl) { setDownloadError(docId); return }

    window.open(signedUrl, '_blank', 'noopener,noreferrer')
  } catch {
    setDownloadError(docId)
  } finally {
    setDownloading(null)
  }
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({ doc, downloading, downloadError, onDownload }) {
  const isDownloading = downloading === doc.id
  const hasError      = downloadError === doc.id

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-card transition-all"
    >
      {/* File icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: typeCfg(doc.type).bg }}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"
            stroke={typeCfg(doc.type).color} strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M9 2v4h4" stroke={typeCfg(doc.type).color} strokeWidth="1.4" strokeLinejoin="round"/>
          <path d="M5 9h6M5 11h4" stroke={typeCfg(doc.type).color} strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-navy truncate">{doc.name}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <TypeBadge type={doc.type} />
          {doc.project_name && (
            <span className="text-xs text-gray-400">{doc.project_name}</span>
          )}
          <span className="text-xs text-gray-400">{fmtDate(doc.uploaded_at)}</span>
        </div>
      </div>

      {/* Download button */}
      <div className="flex-shrink-0">
        <button
          onClick={() => onDownload(doc)}
          disabled={isDownloading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all"
          style={{
            background:   isDownloading ? '#f9fafb' : '#fff',
            borderColor:  hasError ? 'rgba(239,68,68,0.3)' : '#e5e7eb',
            color:        hasError ? '#ef4444' : '#0B1F3A',
          }}
          aria-label={`Download ${doc.name}`}
        >
          {isDownloading ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" stroke="#d1d5db" strokeWidth="1.5"/>
                <path d="M10.5 6A4.5 4.5 0 016 1.5" stroke="#E8622A" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>Loading…</span>
            </>
          ) : hasError ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 2v4M6 9.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              <span>Try again</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 1v7M3 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1.5 10h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <span>Download</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'proposal', label: 'Proposals' },
  { value: 'contract', label: 'Contracts' },
  { value: 'invoice',  label: 'Invoices' },
  { value: 'handover', label: 'Handover' },
  { value: 'other',    label: 'Other' },
]

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filtered }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#9ca3af" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M14 2v6h6M9 13h6M9 17h4" stroke="#9ca3af" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="text-sm font-semibold text-gray-500 mb-1">
        {filtered ? 'No documents match this filter' : 'No documents shared yet'}
      </div>
      <div className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
        {filtered
          ? 'Try selecting a different document type above.'
          : "When the team shares proposals, contracts, or deliverables, they'll appear here."}
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-white">
      <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 bg-gray-100 animate-pulse rounded-lg" />
        <div className="h-3 w-32 bg-gray-100 animate-pulse rounded-lg" />
      </div>
      <div className="w-24 h-9 bg-gray-100 animate-pulse rounded-xl flex-shrink-0" />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { user } = useAuth()

  const [docs,          setDocs]          = useState([])
  const [loading,       setLoading]       = useState(true)
  const [typeFilter,    setTypeFilter]    = useState('all')
  const [downloading,   setDownloading]   = useState(null)   // doc.id being downloaded
  const [downloadError, setDownloadError] = useState(null)   // doc.id that errored

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return

    async function fetchDocs() {
      try {
        // Step 1: get this client's project IDs
        const { data: projects, error: projError } = await supabase
          .from('projects')
          .select('id, name')
          .eq('client_id', user.id)

        if (projError) throw projError

        if (!projects?.length) {
          setLoading(false)
          return
        }

        const projectIds   = projects.map(p => p.id)
        const projectNames = Object.fromEntries(projects.map(p => [p.id, p.name]))

        // Step 2: fetch documents visible to client across all their projects.
        // storage_path is selected here for use in the download handler only —
        // it is NEVER rendered in the UI or exposed to the browser DOM.
        const { data, error: docsError } = await supabase
          .from('documents')
          .select('id, name, type, uploaded_at, project_id, storage_path')
          .in('project_id', projectIds)
          .eq('visible_to_client', true)
          .order('uploaded_at', { ascending: false })

        if (docsError) throw docsError

        // Attach project name for display; strip storage_path from the
        // display object so it cannot accidentally appear in the UI.
        const rows = (data ?? []).map(doc => ({
          id:           doc.id,
          name:         doc.name,
          type:         doc.type,
          uploaded_at:  doc.uploaded_at,
          project_id:   doc.project_id,
          project_name: projectNames[doc.project_id] ?? null,
          // storage_path kept on a separate ref — only used in onDownload callback
          _storagePath: doc.storage_path,
        }))

        setDocs(rows)
      } catch (err) {
        console.error('[Documents] fetchDocs:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDocs()
  }, [user])

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = typeFilter === 'all'
    ? docs
    : docs.filter(d => d.type === typeFilter)

  // ── Download ──────────────────────────────────────────────────────────────

  async function handleDownload(doc) {
    setDownloadError(null)
    await requestDownload(
      doc._storagePath,
      doc.id,
      setDownloading,
      setDownloadError,
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-navy">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Files shared with you by the MyAppLabs team.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
          </div>
        ) : docs.length === 0 ? (
          <EmptyState filtered={false} />
        ) : (
          <>
            {/* Type filter pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              {TYPE_FILTERS.filter(f =>
                f.value === 'all' || docs.some(d => d.type === f.value)
              ).map(f => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all"
                  style={{
                    background:  typeFilter === f.value ? '#0B1F3A' : '#fff',
                    color:       typeFilter === f.value ? '#fff' : '#6b7280',
                    borderColor: typeFilter === f.value ? '#0B1F3A' : '#e5e7eb',
                  }}
                >
                  {f.label}
                  {f.value === 'all'
                    ? ` (${docs.length})`
                    : ` (${docs.filter(d => d.type === f.value).length})`
                  }
                </button>
              ))}
            </div>

            {/* Document list */}
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <EmptyState filtered={true} key="empty" />
              ) : (
                <div className="space-y-3">
                  {filtered.map(doc => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      downloading={downloading}
                      downloadError={downloadError}
                      onDownload={handleDownload}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  )
}
