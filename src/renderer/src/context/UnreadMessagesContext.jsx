import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './AuthContext'

const UnreadMessagesContext = createContext({ unreadCount: 0 })

/**
 * Provides a live unread message count to any component in the tree.
 * Subscribes to the messages table via Supabase Realtime and refetches
 * the count on any INSERT or UPDATE (e.g. when read_at is set).
 * Used by the Sidebar to show the badge on the Messages nav item.
 */
export function UnreadMessagesProvider({ children }) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const channelRef = useRef(null)

  useEffect(() => {
    // If there's no authenticated user, clear the count and don't subscribe.
    if (!user) {
      setUnreadCount(0)
      return
    }

    /** Fetch the count of messages where read_at is null (unread). */
    async function fetchUnread() {
      try {
        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null)

        if (error) {
          console.error('[UnreadMessages] fetch error:', error.message)
          return
        }
        setUnreadCount(count ?? 0)
      } catch (err) {
        console.error('[UnreadMessages] unexpected error:', err)
      }
    }

    // Fetch immediately on mount.
    fetchUnread()

    // Subscribe to any change on the messages table so the badge
    // updates in real time when a new message arrives or is read.
    const channel = supabase
      .channel(`unread-messages-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => fetchUnread()
      )
      .subscribe()

    channelRef.current = channel

    // Clean up subscription on unmount or when user changes.
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user])

  return (
    <UnreadMessagesContext.Provider value={{ unreadCount }}>
      {children}
    </UnreadMessagesContext.Provider>
  )
}

/** Hook to read the live unread message count. */
export function useUnreadMessages() {
  return useContext(UnreadMessagesContext)
}
