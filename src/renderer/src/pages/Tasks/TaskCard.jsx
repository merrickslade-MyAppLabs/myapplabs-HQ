const PRIORITY_STYLES = {
  low: { bg: 'var(--success-muted)', color: 'var(--success)', label: 'Low' },
  medium: { bg: 'var(--warning-muted)', color: 'var(--warning)', label: 'Medium' },
  high: { bg: 'var(--danger-muted)', color: 'var(--danger)', label: 'High' }
}

/**
 * Individual task card — used inside the Draggable wrapper.
 */
export default function TaskCard({ task, isDragging, onEdit, onDelete }) {
  const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()

  return (
    <div
      className="card"
      style={{
        padding: '12px 14px',
        cursor: 'grab',
        userSelect: 'none',
        transform: isDragging ? 'rotate(1.5deg) scale(1.02)' : 'none',
        boxShadow: isDragging ? 'var(--shadow-xl)' : 'var(--shadow-sm)',
        transition: isDragging ? 'none' : 'all 0.15s ease',
        borderLeft: `3px solid ${priority.color}`
      }}
    >
      {/* Title + actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {task.title}
        </div>
        <div
          style={{ display: 'flex', gap: '2px', flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn btn-ghost btn-icon"
            onClick={onEdit}
            title="Edit task"
            style={{ width: 24, height: 24, padding: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M7.5 1l2.5 2.5-6.5 6.5H1v-2.5L7.5 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onDelete}
            title="Delete task"
            style={{ width: 24, height: 24, padding: 0, color: 'var(--danger)' }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M2 2.5h7M4 2.5V1.5h3v1M3.5 4v4.5M7.5 4v4.5M2 2.5l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: '10px',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {task.description}
        </div>
      )}

      {/* Footer meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {/* Priority */}
        <span className="badge" style={{ background: priority.bg, color: priority.color }}>
          {priority.label}
        </span>

        {/* Assignee */}
        {task.assignedTo && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <circle cx="5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1"/>
              <path d="M1 9c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            {task.assignedTo}
          </span>
        )}

        {/* Due date */}
        {task.dueDate && (
          <span
            style={{
              fontSize: '11px',
              color: isOverdue ? 'var(--danger)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              marginLeft: 'auto'
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1" y="2" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1"/>
              <path d="M3 1v2M7 1v2M1 5h8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
    </div>
  )
}
