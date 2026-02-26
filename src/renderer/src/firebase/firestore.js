// ============================================================
// Firestore helper functions — all data operations go through here
// ============================================================

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore'
import { db } from './config'

// ── Collection References ──
export const COLLECTIONS = {
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  TASKS: 'tasks',
  PROMPTS: 'prompts',
  REVENUE: 'revenue'
}

// ── Generic CRUD Helpers ──

/**
 * Add a document to a collection with an auto-generated ID.
 * Automatically adds createdAt and updatedAt server timestamps.
 */
export async function addDocument(collectionName, data) {
  try {
    const ref = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return { id: ref.id, error: null }
  } catch (error) {
    console.error(`Error adding document to ${collectionName}:`, error)
    return { id: null, error: error.message }
  }
}

/**
 * Update a document by ID in a collection.
 * Automatically updates the updatedAt timestamp.
 */
export async function updateDocument(collectionName, id, data) {
  try {
    const ref = doc(db, collectionName, id)
    await updateDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    })
    return { error: null }
  } catch (error) {
    console.error(`Error updating document ${id} in ${collectionName}:`, error)
    return { error: error.message }
  }
}

/**
 * Delete a document by ID from a collection.
 */
export async function deleteDocument(collectionName, id) {
  try {
    await deleteDoc(doc(db, collectionName, id))
    return { error: null }
  } catch (error) {
    console.error(`Error deleting document ${id} from ${collectionName}:`, error)
    return { error: error.message }
  }
}

/**
 * Subscribe to a collection in real time, ordered by a field.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeToCollection(collectionName, orderByField, callback) {
  const q = query(
    collection(db, collectionName),
    orderBy(orderByField, 'desc')
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        // Convert Firestore Timestamps to JS Date objects for easy use
        createdAt: docSnap.data().createdAt instanceof Timestamp
          ? docSnap.data().createdAt.toDate()
          : docSnap.data().createdAt,
        updatedAt: docSnap.data().updatedAt instanceof Timestamp
          ? docSnap.data().updatedAt.toDate()
          : docSnap.data().updatedAt
      }))
      callback(docs, null)
    },
    (error) => {
      console.error(`Error subscribing to ${collectionName}:`, error)
      callback([], error.message)
    }
  )
}

/**
 * Helper to convert any Timestamp fields in a document to Dates.
 */
export function convertTimestamps(data) {
  if (!data) return data
  const result = { ...data }
  Object.keys(result).forEach((key) => {
    if (result[key] instanceof Timestamp) {
      result[key] = result[key].toDate()
    }
  })
  return result
}
