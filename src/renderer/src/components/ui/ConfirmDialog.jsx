import Modal from './Modal'

/**
 * Reusable confirm/delete dialog.
 * Usage: <ConfirmDialog isOpen onConfirm onCancel title message confirmText confirmVariant />
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  confirmVariant = 'danger',
  loading = false
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button
          className={`btn btn-${confirmVariant}`}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Working...' : confirmText}
        </button>
      </div>
    </Modal>
  )
}
