/**
 * Strip all HTML tags from a string before saving to Supabase.
 * Prevents stored-XSS via message bodies.
 */
export function stripHtml(str) {
  if (!str || typeof str !== 'string') return ''
  return str.replace(/<[^>]*>/g, '').trim()
}
