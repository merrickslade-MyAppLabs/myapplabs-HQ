import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SkeletonList } from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import {
  subscribeToTable,
  addRecord,
  updateRecord,
  deleteRecord,
  TABLES
} from '../../supabase/database'
import ClientForm from './ClientForm'
import ClientCard from './ClientCard'
import ProjectsPanel from './ProjectsPanel'

const STATUS_OPTIONS = ['all', 'lead', 'active', 'completed']

const STATUS_COLORS = {
  lead: { bg: 'var(--info-muted)', color: 'var(--info)' },
  active: { bg: 'var(--success-muted)', color: 'var(--success)' },
  completed: { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' }
}

export { STATUS_COLORS }

export default function ClientsPage() {
  const toast = useToast()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null) // For projects panel
  const [saving, setSaving] = useState(false)

  // Subscribe to clients in real time
  useEffect(() => {
    const unsubscribe = subscribeToTable(
      TABLES.CLIENTS,
      (docs, err) => {
        if (err) {
          setError('Failed to load clients. Please check your connection.')
        } else {
          setClients(docs)
          setError(null)
        }
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Keep selectedClient in sync when realtime updates arrive
  useEffect(() => {
    if (selectedClient) {
      const updated = clients.find((c) => c.id === selectedClient.id)
      if (updated) setSelectedClient(updated)
    }
  }, [clients])

  // Filtered clients
  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      !searchQuery ||
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  function openAddModal() {
    setEditingClient(null)
    setClientModalOpen(true)
  }

  function openEditModal(client) {
    setEditingClient(client)
    setClientModalOpen(true)
  }

  function closeModal() {
    setClientModalOpen(false)
    setEditingClient(null)
  }

  async function handleSaveClient(formData) {
    setSaving(true)
    if (editingClient) {
      const { error: err } = await updateRecord(TABLES.CLIENTS, editingClient.id, formData)
      if (err) {
        toast('Failed to update client. Please try again.', 'error')
      } else {
        toast('Client updated successfully.', 'success')
        closeModal()
      }
    } else {
      const { error: err } = await addRecord(TABLES.CLIENTS, formData)
      if (err) {
        toast('Failed to add client. Please try again.', 'error')
      } else {
        toast('Client added successfully.', 'success')
        closeModal()
      }
    }
    setSaving(false)
  }

  async function handleDeleteClient() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error: err } = await deleteRecord(TABLES.CLIENTS, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (err) {
      toast('Failed to delete client. Please try again.', 'error')
    } else {
      toast('Client deleted.', 'info')
      // Clear selected if it was the deleted one
      if (selectedClient?.id === deleteTarget.id) {
        setSelectedClient(null)
      }
    }
  }

  if (error) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--danger)', maxWidth: '320px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Connection Error</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel — client list */}
      <div
        style={{
          flex: selectedClient ? '0 0 380px' : '1',
          display: 'flex',
          flexDirection: 'column',
          borderRight: selectedClient ? '1px solid var(--border-color)' : 'none',
          overflow: 'hidden',
          transition: 'flex 0.3s ease'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 24px 16px',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
            background: 'var(--bg-secondary)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div className="page-title">Clients & Projects</div>
              <div className="page-subtitle">{clients.length} client{clients.length !== 1 ? 's' : ''}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openAddModal}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Add Client
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <svg
              width="14" height="14" viewBox="0 0 14 14" fill="none"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
            >
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              className="input"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
          </div>

          {/* Status filter */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="btn btn-sm"
                style={{
                  background: statusFilter === s ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: statusFilter === s ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: statusFilter === s ? 'var(--accent-primary)' : 'var(--border-color)',
                  textTransform: 'capitalize',
                  padding: '4px 10px'
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Client List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {loading ? (
            <SkeletonList count={5} />
          ) : filteredClients.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              title={searchQuery || statusFilter !== 'all' ? 'No matching clients' : 'No clients yet'}
              description={
                searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search or filter.'
                  : 'Add your first client to get started.'
              }
              action={
                !searchQuery && statusFilter === 'all' && (
                  <button className="btn btn-primary btn-sm" onClick={openAddModal}>
                    Add First Client
                  </button>
                )
              }
            />
          ) : (
            <AnimatePresence initial={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredClients.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    isSelected={selectedClient?.id === client.id}
                    onClick={() => setSelectedClient(selectedClient?.id === client.id ? null : client)}
                    onEdit={() => openEditModal(client)}
                    onDelete={() => setDeleteTarget(client)}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Right panel — projects */}
      <AnimatePresence>
        {selectedClient && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
            style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <ProjectsPanel
              client={selectedClient}
              onClose={() => setSelectedClient(null)}
              onEditClient={() => openEditModal(selectedClient)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add/Edit Client Modal */}
      <Modal
        isOpen={clientModalOpen}
        onClose={closeModal}
        title={editingClient ? 'Edit Client' : 'Add New Client'}
        size="md"
      >
        <ClientForm
          initialData={editingClient}
          onSave={handleSaveClient}
          onCancel={closeModal}
          saving={saving}
        />
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteClient}
        title="Delete Client"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText="Delete Client"
        loading={deleteLoading}
      />
    </div>
  )
}
