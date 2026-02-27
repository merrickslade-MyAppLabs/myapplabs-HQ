// ============================================================
// MyAppLabs HQ — Supabase Database Helpers
// All data operations go through here. Mirrors the Firebase
// firestore.js API so page components need minimal changes.
// ============================================================

import { supabase } from './client'

// ── Table names ──
export const TABLES = {
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  TASKS: 'tasks',
  PROMPTS: 'prompts',
  REVENUE: 'revenue',
  IDEAS: 'ideas',
  EXPENSES: 'expenses',
  NOTES: 'notes',
  INTERNAL_PROJECTS: 'internal_projects'
}

// ── Case conversion helpers ──

/**
 * Convert a camelCase JS object to snake_case for writing to Postgres.
 * e.g. { clientId: '123', dueDate: '2025-01-01' }
 *   -> { client_id: '123', due_date: '2025-01-01' }
 */
function toSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  Object.keys(obj).forEach((key) => {
    const snakeKey = key.replace(/([A-Z])/g, (char) => `_${char.toLowerCase()}`)
    const val = obj[key]
    // Convert empty strings to null so Postgres doesn't reject them
    // for typed columns like DATE, NUMERIC, etc.
    result[snakeKey] = val === '' ? null : val
  })
  return result
}

/**
 * Convert a snake_case Postgres row to camelCase for JS consumption.
 * e.g. { client_id: '123', due_date: '2025-01-01' }
 *   -> { clientId: '123', dueDate: '2025-01-01' }
 */
function toCamel(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  Object.keys(obj).forEach((key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    result[camelKey] = obj[key]
  })
  return result
}

// ── Channel counter for unique channel names per subscription ──
let _channelId = 0

// ── Real-time subscriptions ──

/**
 * Subscribe to ALL rows in a table, ordered by created_at desc.
 * Calls callback(rows, error) immediately with initial data, then on every change.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeToTable(tableName, callback) {
  const channelName = `${tableName}-${++_channelId}`

  async function fetchAll() {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(`[Supabase] Error fetching ${tableName}:`, error)
      callback([], error.message)
    } else {
      callback(data.map(toCamel), null)
    }
  }

  // Fetch initial data immediately
  fetchAll()

  // Subscribe to any INSERT / UPDATE / DELETE on this table
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableName },
      () => fetchAll() // Re-fetch the full list on any change (simple & reliable)
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Channel active — real-time updates will now flow in
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Subscribe to projects belonging to a specific client, ordered by created_at desc.
 * Returns { unsubscribe, refetch } so callers can manually refetch after mutations.
 */
export function subscribeToProjectsByClient(clientId, callback) {
  const channelName = `projects-client-${clientId}-${++_channelId}`

  async function fetchProjects() {
    const { data, error } = await supabase
      .from(TABLES.PROJECTS)
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Supabase] Error fetching projects:', error)
      callback([], error.message)
    } else {
      callback(data.map(toCamel), null)
    }
  }

  fetchProjects()

  // Subscribe to any change on the projects table; fetchProjects() already filters by client_id
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLES.PROJECTS },
      () => fetchProjects()
    )
    .subscribe()

  return {
    unsubscribe: () => supabase.removeChannel(channel),
    refetch: fetchProjects
  }
}

// ── One-time fetch ──

/**
 * Fetch all rows from a table once (no subscription). Returns { data, error }.
 */
export async function getRecords(tableName, { orderBy = 'created_at', ascending = false } = {}) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .order(orderBy, { ascending })

  if (error) {
    console.error(`[Supabase] Error fetching ${tableName}:`, error)
    return { data: [], error: error.message }
  }
  return { data: data.map(toCamel), error: null }
}

// ── CRUD operations ──

/**
 * Insert a new row. Returns { id, error }.
 */
export async function addRecord(tableName, data) {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert(toSnake(data))
      .select('id')
      .single()

    if (error) {
      console.error(`[Supabase] Error inserting into ${tableName}:`, error)
      return { id: null, error: error.message }
    }
    return { id: result.id, error: null }
  } catch (err) {
    console.error(`[Supabase] Unexpected error inserting into ${tableName}:`, err)
    return { id: null, error: err.message }
  }
}

/**
 * Update a row by id. Returns { error }.
 */
export async function updateRecord(tableName, id, data) {
  try {
    const { error } = await supabase
      .from(tableName)
      .update({
        ...toSnake(data),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) {
      console.error(`[Supabase] Error updating ${tableName} id=${id}:`, error)
      return { error: error.message }
    }
    return { error: null }
  } catch (err) {
    console.error(`[Supabase] Unexpected error updating ${tableName}:`, err)
    return { error: err.message }
  }
}

/**
 * Delete a row by id. Returns { error }.
 */
export async function deleteRecord(tableName, id) {
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id)

    if (error) {
      console.error(`[Supabase] Error deleting from ${tableName} id=${id}:`, error)
      return { error: error.message }
    }
    return { error: null }
  } catch (err) {
    console.error(`[Supabase] Unexpected error deleting from ${tableName}:`, err)
    return { error: err.message }
  }
}
