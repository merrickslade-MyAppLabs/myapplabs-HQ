import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { stripHtml } from '../../utils/sanitise'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function fmtFull(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString([], {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// ── Thread list item ───────────────────────────────────────────────────────────

function ThreadItem({ thread, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '12px 16px',
        background: active ? 'var(--accent-primary-muted)' : 'transparent',
        border: 'none', borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer', transition: 'background 0.15s',
        borderLeft: active ? '3px solid var(--accent-primary)' : '3px solid transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 13, fontWeight: thread.unreadCount > 0 ? 700 : 600,
              color: 'var(--text-primary)', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160
            }}>
              {thread.clientName}
            </span>
            {thread.isLocked && (
              <span style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 4,
                background: 'var(--bg-tertiary)', color: 'var(--text-muted)', flexShrink: 0
              }}>done</span>
            )}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', marginBottom: 4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {thread.projectName}
          </div>
          <div style={{
            fontSize: 12,
            color: thread.unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: thread.unreadCount > 0 ? 500 : 400,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {thread.lastBody || 'No messages yet'}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            {fmtTime(thread.lastAt)}
          </div>
          {thread.unreadCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
              background: 'var(--accent-primary)', color: '#fff',
              fontSize: 11, fontWeight: 700
            }}>
              {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Single message bubble ──────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      {/* Sender name + timestamp */}
      <div style={{
        fontSize: 11, color: 'var(--text-muted)',
        marginBottom: 3,
        display: 'flex', gap: 6, alignItems: 'center',
        flexDirection: isOwn ? 'row-reverse' : 'row'
      }}>
        <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
          {msg.profiles?.full_name ?? 'Unknown'}
        </span>
        <span title={fmtFull(msg.created_at)}>{fmtFull(msg.created_at)}</span>
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '68%', padding: '8px 12px', borderRadius: isOwn ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        background: isOwn ? 'var(--accent-primary)' : 'var(--bg-secondary)',
        color: isOwn ? '#fff' : 'var(--text-primary)',
        fontSize: 13.5, lineHeight: 1.5,
        wordBreak: 'break-word', whiteSpace: 'pre-wrap',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        {msg.body}
      </div>
    </motion.div>
  )
}

// ── Empty right panel ──────────────────────────────────────────────────────────

function EmptyPane() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', gap: 10
    }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="4" y="8" width="32" height="22" rx="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M4 28l8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M36 28l-8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="13" cy="19" r="2" fill="currentColor"/>
        <circle cx="20" cy="19" r="2" fill="currentColor"/>
        <circle cx="27" cy="19" r="2" fill="currentColor"/>
      </svg>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
        Select a thread
      </div>
      <div style={{ fontSize: 13 }}>Choose a project thread from the left to start</div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth()

  // All messages with joined project + sender profile
  const [messages,    setMessages]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeThread, setActiveThread] = useState(null) // project_id string
  const [search,      setSearch]      = useState('')
  const [replyBody,   setReplyBody]   = useState('')
  const [sending,     setSending]     = useState(false)
  const [sendError,   setSendError]   = useState('')

  const channelRef   = useRef(null)
  const bottomRef    = useRef(null)
  const textareaRef  = useRef(null)

  // ── Fetch all messages (with project + profile joins) ─────────────────────

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id, project_id, sender_id, body, created_at, read_at,
        projects!project_id ( id, name, client_id, client_name, status ),
        profiles!sender_id  ( id, full_name )
      `)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[Messages] fetch error:', error.message)
    } else {
      setMessages(data ?? [])
    }
    setLoading(false)
  }, [])

  // ── Realtime subscription ─────────────────────────────────────────────────
  // Mirrors the pattern in UnreadMessagesContext — postgres_changes + refetch-all.

  useEffect(() => {
    if (!user) return

    fetchMessages()

    const channel = supabase
      .channel(`messages-page-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchMessages()
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user, fetchMessages])

  // ── Derive threads from messages ──────────────────────────────────────────

  const threads = useMemo(() => {
    const map = new Map()
    for (const msg of messages) {
      const pid = msg.project_id
      if (!map.has(pid)) {
        map.set(pid, {
          projectId:   pid,
          projectName: msg.projects?.name       ?? 'Unknown project',
          clientName:  msg.projects?.client_name ?? 'Unknown client',
          isLocked:    msg.projects?.status === 'complete',
          messages:    [],
          unreadCount: 0,
          lastAt:      null,
          lastBody:    '',
        })
      }
      const t = map.get(pid)
      t.messages.push(msg)
      if (!msg.read_at) t.unreadCount++
      // messages are already ordered asc, so last item is newest
      t.lastAt   = msg.created_at
      t.lastBody = msg.body.length > 60 ? msg.body.slice(0, 57) + '…' : msg.body
    }
    // Sort threads by last message time descending
    return Array.from(map.values()).sort((a, b) => {
      if (!a.lastAt) return 1
      if (!b.lastAt) return -1
      return new Date(b.lastAt) - new Date(a.lastAt)
    })
  }, [messages])

  // ── Filtered threads (search) ─────────────────────────────────────────────

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads
    const q = search.toLowerCase()
    return threads.filter(t =>
      t.clientName.toLowerCase().includes(q) ||
      t.projectName.toLowerCase().includes(q)
    )
  }, [threads, search])

  // ── Active thread messages ────────────────────────────────────────────────

  const activeMessages = useMemo(() => {
    if (!activeThread) return []
    return messages.filter(m => m.project_id === activeThread)
  }, [messages, activeThread])

  const activeThreadMeta = useMemo(
    () => threads.find(t => t.projectId === activeThread) ?? null,
    [threads, activeThread]
  )

  // ── Mark thread as read on open ───────────────────────────────────────────

  const markThreadRead = useCallback(async (projectId) => {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .is('read_at', null)
    // fetchMessages() will be triggered by the Realtime update
  }, [])

  const openThread = useCallback((projectId) => {
    setActiveThread(projectId)
    setReplyBody('')
    setSendError('')
    markThreadRead(projectId)
  }, [markThreadRead])

  // ── Auto-scroll to bottom when thread or messages change ──────────────────

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeThread, activeMessages.length])

  // ── Send reply ────────────────────────────────────────────────────────────

  const sendReply = useCallback(async () => {
    const body = stripHtml(replyBody)
    if (!body || !activeThread || sending) return

    setSending(true)
    setSendError('')

    const { error } = await supabase.from('messages').insert({
      project_id: activeThread,
      sender_id:  user.id,
      body,
    })

    if (error) {
      setSendError('Failed to send. Please try again.')
    } else {
      setReplyBody('')
    }
    setSending(false)
  }, [replyBody, activeThread, sending, user])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendReply()
    }
  }, [sendReply])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', height: '100%', overflow: 'hidden',
      background: 'var(--bg-primary)'
    }}>

      {/* ── Left: thread list ─────────────────────────────────────────────── */}
      <div style={{
        width: 300, flexShrink: 0,
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-primary)', overflow: 'hidden'
      }}>
        {/* Search */}
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ position: 'relative' }}>
            <svg
              width="14" height="14" viewBox="0 0 20 20" fill="none"
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search threads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px 7px 30px',
                border: '1px solid var(--border-primary)',
                borderRadius: 8, background: 'var(--bg-secondary)',
                color: 'var(--text-primary)', fontSize: 13,
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Thread list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ width: '60%', height: 12, borderRadius: 6, background: 'var(--bg-tertiary)', marginBottom: 6 }} />
                <div style={{ width: '40%', height: 10, borderRadius: 6, background: 'var(--bg-tertiary)', marginBottom: 6 }} />
                <div style={{ width: '80%', height: 10, borderRadius: 6, background: 'var(--bg-tertiary)' }} />
              </div>
            ))
          ) : filteredThreads.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {search ? 'No threads match your search.' : 'No message threads yet.'}
            </div>
          ) : (
            filteredThreads.map(t => (
              <ThreadItem
                key={t.projectId}
                thread={t}
                active={activeThread === t.projectId}
                onClick={() => openThread(t.projectId)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: thread panel ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {!activeThread ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ flex: 1, display: 'flex' }}
            >
              <EmptyPane />
            </motion.div>
          ) : (
            <motion.div
              key={activeThread}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              {/* Thread header */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-primary)',
                display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {activeThreadMeta?.clientName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {activeThreadMeta?.projectName}
                  </div>
                </div>
                {activeThreadMeta?.isLocked && (
                  <span style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 6,
                    background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                    border: '1px solid var(--border-primary)', fontWeight: 500
                  }}>
                    Project complete — read only
                  </span>
                )}
              </div>

              {/* Message list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', minHeight: 0 }}>
                {activeMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>
                    No messages yet in this thread.
                  </div>
                ) : (
                  activeMessages.map(msg => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isOwn={msg.sender_id === user.id}
                    />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Reply bar */}
              {activeThreadMeta?.isLocked ? (
                <div style={{
                  padding: '12px 20px', borderTop: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)', fontSize: 13, textAlign: 'center',
                  background: 'var(--bg-secondary)', flexShrink: 0
                }}>
                  This project is complete. The message thread is archived and read-only.
                </div>
              ) : (
                <div style={{
                  padding: '12px 16px', borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--bg-primary)', flexShrink: 0
                }}>
                  {sendError && (
                    <div style={{ fontSize: 12, color: 'var(--error)', marginBottom: 6 }}>
                      {sendError}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <textarea
                      ref={textareaRef}
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Write a reply… (Enter to send, Shift+Enter for new line)"
                      rows={3}
                      style={{
                        flex: 1, resize: 'none', padding: '9px 12px',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 10, background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)', fontSize: 13.5,
                        lineHeight: 1.5, outline: 'none', fontFamily: 'inherit',
                        transition: 'border-color 0.15s',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border-primary)'}
                    />
                    <button
                      onClick={sendReply}
                      disabled={!replyBody.trim() || sending}
                      style={{
                        padding: '9px 18px', borderRadius: 10, border: 'none',
                        background: (!replyBody.trim() || sending) ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
                        color: (!replyBody.trim() || sending) ? 'var(--text-muted)' : '#fff',
                        fontWeight: 600, fontSize: 13.5, cursor: (!replyBody.trim() || sending) ? 'default' : 'pointer',
                        transition: 'background 0.15s, color 0.15s',
                        flexShrink: 0, alignSelf: 'flex-end', marginBottom: 1
                      }}
                    >
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
