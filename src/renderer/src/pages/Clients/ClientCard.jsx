import { motion } from 'framer-motion'

const STATUS_STYLES = {
  lead: { bg: 'var(--info-muted)', color: 'var(--info)', label: 'Lead' },
  active: { bg: 'var(--success-muted)', color: 'var(--success)', label: 'Active' },
  completed: { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)', label: 'Completed' }
}

/**
 * Displays a single client in the list.
 */
export default function ClientCard({ client, isSelected, onClick, onEdit, onDelete }) {
  const statusStyle = STATUS_STYLES[client.status] || STATUS_STYLES.lead
  const initials = client.name
    ?.split(' ')
    .map((n) => n[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || '?'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="card"
      style={{
        padding: '14px 16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-color)',
        background: isSelected ? 'var(--accent-primary-muted)' : 'var(--bg-card)'
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 700,
          color: isSelected ? '#fff' : 'var(--text-secondary)',
          flexShrink: 0
        }}
      >
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {client.name}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {client.email || client.phone || 'No contact info'}
        </div>
      </div>

      {/* Status badge */}
      <span
        className="badge"
        style={{ background: statusStyle.bg, color: statusStyle.color, flexShrink: 0 }}
      >
        {statusStyle.label}
      </span>

      {/* Action buttons */}
      <div
        style={{ display: 'flex', gap: '4px', flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()} // Prevent triggering the card click
      >
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onEdit}
          title="Edit client"
          aria-label="Edit client"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M9.5 1.5l2 2-8 8H1.5v-2l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onDelete}
          title="Delete client"
          aria-label="Delete client"
          style={{ color: 'var(--danger)' }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 5.5v4M8.5 5.5v4M3 3.5l.5 7.5h6L10 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
