/**
 * Lightweight HTML tag stripper for user-supplied text before it is
 * written to Supabase. Removes all HTML/XML tags so angle-bracket
 * payloads cannot be stored and later rendered as markup.
 *
 * Not a full XSS sanitiser — we don't render user content as HTML anyway —
 * but it ensures the database only ever holds plain text.
 *
 * @param {string} str
 * @returns {string}
 */
export function stripHtml(str) {
  if (!str || typeof str !== 'string') return ''
  return str.replace(/<[^>]*>/g, '').trim()
}
