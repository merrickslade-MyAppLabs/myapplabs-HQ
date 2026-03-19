import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { stripHtml } from '../utils/sanitise'

// ── Rate limit helper ──────────────────────────────────────────────────────────

async function checkRateLimit() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { allowed: false, error: 'Session expired. Please refresh the page.' }

  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-limit-messages`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
    )

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}))
      return {
        allowed: false,
        error: body.error ?? "You've sent a lot of messages recently. Please wait a moment before sending more.",
      }
    }

    if (!res.ok) return { allowed: true } // fail open on unexpected errors

    return { allowed: true }
  } catch {
    return { allowed: true } // fail open on network errors
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts) {
  if (!ts) return ''
  const d   = new Date(ts)
  const now = new Date()
  const diffMs   = now - d
  const diffDays = Math.floor(diffMs / 86400000)
  const time     = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return time
  if (diffDays === 1) return `Yesterday at ${time}`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` at ${time}`
}

function fmtDateLabel(ts) {
  if (!ts) return ''
  const d   = new Date(ts)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Whether to show a date separator before a message
function needsDateLabel(messages, index) {
  if (index === 0) return true
  const prev = new Date(messages[index - 1].created_at)
  const curr = new Date(messages[index].created_at)
  return prev.toDateString() !== curr.toDateString()
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, isSending }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isSending ? 0.65 : 1, y: 0 }}
      transition={{ duration: 0.16 }}
      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-3`}
    >
      {/* Sender label */}
      <div className={`flex items-center gap-1.5 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
        <span className="text-xs font-semibold"
          style={{ color: isOwn ? '#E8622A' : '#0B1F3A' }}>
          {isOwn ? 'You' : (msg.profiles?.full_name ?? 'MyAppLabs')}
        </span>
        <span className="text-xs text-gray-400">{fmtTimestamp(msg.created_at)}</span>
        {isSending && (
          <span className="text-xs text-gray-400 italic">sending…</span>
        )}
      </div>

      {/* Bubble */}
      <div
        className="max-w-[75%] sm:max-w-[60%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words"
        style={{
          background:   isOwn ? '#E8622A' : '#0B1F3A',
          color:        '#fff',
          borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          boxShadow:    '0 1px 4px rgba(0,0,0,0.1)',
          opacity:      isSending ? 0.8 : 1,
        }}
      >
        {msg.body}
      </div>
    </motion.div>
  )
}

// ── Date separator ────────────────────────────────────────────────────────────

function DateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs font-medium text-gray-400 flex-shrink-0">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// ── Chat thread ───────────────────────────────────────────────────────────────

function ChatThread({ projectId, projectName, isLocked, userId, userProfile }) {
  const [messages,   setMessages]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [body,       setBody]       = useState('')
  const [sending,    setSending]    = useState(false)
  const [sendError,  setSendError]  = useState('')

  const channelRef  = useRef(null)
  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)

  // ── Fetch ───────────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at, read_at, profiles!sender_id(full_name, role)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (!error) {
      setMessages(data ?? [])
    }
    setLoading(false)
  }, [projectId])

  // ── Realtime subscription ────────────────────────────────────────────────

  useEffect(() => {
    fetchMessages()

    const channel = supabase
      .channel(`portal-messages-${projectId}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages',
          filter: `project_id=eq.${projectId}` },
        () => fetchMessages()
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [projectId, fetchMessages])

  // ── Mark team messages as read on open ──────────────────────────────────

  useEffect(() => {
    if (!projectId || loading) return
    supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .neq('sender_id', userId)
      .is('read_at', null)
      .then(() => {}) // fire and forget — Realtime will sync the count
  }, [projectId, loading, userId])

  // ── Auto-scroll to bottom ────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // ── Send ─────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const sanitised = stripHtml(body)
    if (!sanitised || sending || isLocked) return

    setSending(true)
    setSendError('')
    setBody('')

    // ── Rate limit check ───────────────────────────────────────────────────
    const { allowed, error: rlError } = await checkRateLimit()
    if (!allowed) {
      setSendError(rlError ?? "You've sent a lot of messages recently. Please wait a moment before sending more.")
      setBody(sanitised)   // restore input
      setSending(false)
      return
    }

    // Optimistic update — add message locally before DB write
    const tempId = `temp-${Date.now()}`
    const optimistic = {
      id:         tempId,
      sender_id:  userId,
      body:       sanitised,
      created_at: new Date().toISOString(),
      read_at:    null,
      profiles:   { full_name: userProfile?.full_name ?? 'You', role: 'client' },
      _sending:   true,
    }
    setMessages(prev => [...prev, optimistic])

    const { error } = await supabase.from('messages').insert({
      project_id: projectId,
      sender_id:  userId,
      body:       sanitised,
    })

    if (error) {
      // Rollback optimistic message
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setSendError('Failed to send. Please try again.')
      setBody(sanitised)   // restore the typed text
    }
    // On success: Realtime fires → fetchMessages() replaces the temp message

    setSending(false)
  }, [body, sending, isLocked, projectId, userId, userProfile])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">

      {/* Thread header */}
      <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0"
        style={{ background: '#fafafa' }}>
        <div className="text-sm font-bold text-navy">{projectName}</div>
        <div className="text-xs text-gray-400 mt-0.5">
          {isLocked ? 'Project complete — thread archived' : 'Messages with the MyAppLabs team'}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-gray-300 text-sm">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3 text-center">
            <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 3h12v8H9l-3 3v-3H2V3z" stroke="#d1d5db" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-400">No messages yet</div>
              <div className="text-xs text-gray-300 mt-0.5">
                {isLocked ? 'This thread is archived.' : 'Send a message to start the conversation.'}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={msg.id}>
                {needsDateLabel(messages, i) && (
                  <DateSeparator label={fmtDateLabel(msg.created_at)} />
                )}
                <MessageBubble
                  msg={msg}
                  isOwn={msg.sender_id === userId}
                  isSending={!!msg._sending}
                />
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Reply bar */}
      {isLocked ? (
        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 text-center"
          style={{ background: '#fafafa' }}>
          <p className="text-xs text-gray-400 leading-relaxed">
            This project is complete — the message thread is archived.{' '}
            To get in touch, email{' '}
            <a href="mailto:hello@myapplabs.co.uk" className="text-brand hover:underline font-medium">
              hello@myapplabs.co.uk
            </a>
          </p>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
          {sendError && (
            <div className="text-xs text-red-500 mb-2 px-1">{sendError}</div>
          )}
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => { setBody(e.target.value); setSendError('') }}
              onKeyDown={handleKeyDown}
              placeholder="Write a message… (Enter to send, Shift+Enter for new line)"
              aria-label="Message input"
              rows={3}
              className="flex-1 resize-none text-sm leading-relaxed outline-none font-sans"
              style={{
                padding: '9px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                background: '#fafafa',
                color: '#0B1F3A',
                transition: 'border-color 0.15s',
                fontFamily: 'inherit',
              }}
              onFocus={e => { e.target.style.borderColor = '#E8622A' }}
              onBlur={e => { e.target.style.borderColor = '#e5e7eb' }}
            />
            <button
              onClick={handleSend}
              disabled={!body.trim() || sending}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: (!body.trim() || sending) ? '#f3f4f6' : '#E8622A',
                color:      (!body.trim() || sending) ? '#9ca3af' : '#fff',
                cursor:     (!body.trim() || sending) ? 'default' : 'pointer',
                alignSelf: 'flex-end',
                marginBottom: 1,
              }}
              aria-label="Send message"
            >
              {sending ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin" aria-hidden="true">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3"/>
                  <path d="M12.5 7A5.5 5.5 0 017 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1.5 7l10.5-5-4 10-2-5-4.5 0z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              )}
              <span className="hidden sm:inline">{sending ? 'Sending' : 'Send'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonThread() {
  return (
    <div className="card flex-1 p-6 space-y-4">
      {[40, 60, 35, 55].map((w, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? '' : 'justify-end'}`}>
          <div
            className="h-10 rounded-2xl bg-gray-100 animate-pulse"
            style={{ width: `${w}%` }}
          />
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user, profile } = useAuth()

  const [projects,   setProjects]   = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('projects')
      .select('id, name, status')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) {
          const rows = data ?? []
          setProjects(rows)
          if (rows.length > 0) setSelectedId(rows[0].id)
        }
        setLoading(false)
      })
  }, [user])

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedId) ?? null,
    [projects, selectedId]
  )

  const isLocked = selectedProject?.status === 'complete'

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50">
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col flex-1 min-h-0">

        <div className="mb-5 flex-shrink-0">
          <h1 className="text-2xl font-bold text-navy">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your conversation with the MyAppLabs team.
          </p>
        </div>

        {/* Project selector (multiple projects only) */}
        {!loading && projects.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-5 flex-shrink-0">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="px-4 py-2 rounded-xl text-sm font-medium border transition-all"
                style={{
                  background:  selectedId === p.id ? '#0B1F3A' : '#fff',
                  color:       selectedId === p.id ? '#fff' : '#0B1F3A',
                  borderColor: selectedId === p.id ? '#0B1F3A' : '#d1d5db',
                }}
              >
                {p.name}
                {p.status === 'complete' && (
                  <span className="ml-1.5 text-xs opacity-60">· done</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Chat area */}
        {loading ? (
          <SkeletonThread />
        ) : projects.length === 0 ? (
          <div className="card flex-1 flex items-center justify-center text-center p-10">
            <div>
              <div className="text-sm font-semibold text-gray-400 mb-1">No projects yet</div>
              <div className="text-xs text-gray-300">Messages will appear here once your project begins.</div>
            </div>
          </div>
        ) : selectedProject ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col flex-1 min-h-0"
              style={{ minHeight: 400 }}
            >
              <ChatThread
                projectId={selectedProject.id}
                projectName={selectedProject.name}
                isLocked={isLocked}
                userId={user.id}
                userProfile={profile}
              />
            </motion.div>
          </AnimatePresence>
        ) : null}

      </div>
    </div>
  )
}
