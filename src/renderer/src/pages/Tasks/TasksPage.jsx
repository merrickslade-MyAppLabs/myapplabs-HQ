import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { motion, AnimatePresence } from 'framer-motion'
import { SkeletonCard } from '../../components/ui/Skeleton'
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
import TaskForm from './TaskForm'
import TaskCard from './TaskCard'

const COLUMNS = [
  { id: 'todo', label: 'To Do', color: 'var(--text-muted)' },
  { id: 'inprogress', label: 'In Progress', color: 'var(--info)' },
  { id: 'done', label: 'Done', color: 'var(--success)' }
]

export default function TasksPage() {
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [defaultColumn, setDefaultColumn] = useState('todo')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Real-time subscription to tasks
  useEffect(() => {
    const unsubscribe = subscribeToTable(
      TABLES.TASKS,
      (docs, err) => {
        if (err) setError('Failed to load tasks.')
        else { setTasks(docs); setError(null) }
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Group tasks by column
  const tasksByColumn = COLUMNS.reduce((acc, col) => {
    acc[col.id] = tasks.filter((t) => t.column === col.id)
    return acc
  }, {})

  async function handleDragEnd(result) {
    const { destination, source, draggableId } = result

    // Dropped outside any droppable or same spot
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    // Optimistically update local state first for instant UI feedback
    const task = tasks.find((t) => t.id === draggableId)
    if (!task) return

    setTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, column: destination.droppableId } : t))
    )

    // Persist to Firestore
    const { error: err } = await updateRecord(TABLES.TASKS, draggableId, {
      column: destination.droppableId
    })
    if (err) {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === draggableId ? { ...t, column: source.droppableId } : t))
      )
      toast('Failed to move task. Please try again.', 'error')
    }
  }

  function openAddModal(columnId = 'todo') {
    setEditingTask(null)
    setDefaultColumn(columnId)
    setModalOpen(true)
  }

  function openEditModal(task) {
    setEditingTask(task)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingTask(null)
  }

  async function handleSaveTask(formData) {
    setSaving(true)
    if (editingTask) {
      const { error: err } = await updateRecord(TABLES.TASKS, editingTask.id, formData)
      if (err) toast('Failed to update task.', 'error')
      else { toast('Task updated.', 'success'); closeModal() }
    } else {
      const { error: err } = await addRecord(TABLES.TASKS, { ...formData, column: formData.column || defaultColumn })
      if (err) toast('Failed to add task.', 'error')
      else { toast('Task added.', 'success'); closeModal() }
    }
    setSaving(false)
  }

  async function handleDeleteTask() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error: err } = await deleteRecord(TABLES.TASKS, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (err) toast('Failed to delete task.', 'error')
    else toast('Task deleted.', 'info')
  }

  if (error) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--danger)', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Connection Error</div>
          <div style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text-secondary)' }}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}
      >
        <div>
          <div className="page-title">Task Board</div>
          <div className="page-subtitle">{tasks.length} task{tasks.length !== 1 ? 's' : ''} total</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => openAddModal()}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Add Task
        </button>
      </div>

      {/* Kanban Board */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '20px 24px' }}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              height: '100%'
            }}
          >
            {COLUMNS.map((col) => {
              const colTasks = tasksByColumn[col.id] || []

              return (
                <div
                  key={col.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden'
                  }}
                >
                  {/* Column Header */}
                  <div
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexShrink: 0
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: col.color
                        }}
                      />
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                        {col.label}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 99,
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-muted)'
                        }}
                      >
                        {colTasks.length}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => openAddModal(col.id)}
                      title={`Add task to ${col.label}`}
                      style={{ width: 26, height: 26, padding: 0 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>

                  {/* Droppable task list */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          flex: 1,
                          overflowY: 'auto',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          minHeight: '60px',
                          background: snapshot.isDraggingOver
                            ? 'var(--accent-primary-muted)'
                            : 'transparent',
                          transition: 'background 0.15s ease',
                          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
                        }}
                      >
                        {loading ? (
                          Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)
                        ) : colTasks.length === 0 && !snapshot.isDraggingOver ? (
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-muted)',
                              fontSize: '12px',
                              fontStyle: 'italic',
                              padding: '20px 0'
                            }}
                          >
                            Drop tasks here
                          </div>
                        ) : (
                          colTasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={{
                                    ...provided.draggableProps.style,
                                    opacity: snapshot.isDragging ? 0.85 : 1
                                  }}
                                >
                                  <TaskCard
                                    task={task}
                                    isDragging={snapshot.isDragging}
                                    onEdit={() => openEditModal(task)}
                                    onDelete={() => setDeleteTarget(task)}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingTask ? 'Edit Task' : 'Add New Task'}
        size="md"
      >
        <TaskForm
          initialData={editingTask}
          defaultColumn={defaultColumn}
          onSave={handleSaveTask}
          onCancel={closeModal}
          saving={saving}
        />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTask}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmText="Delete Task"
        loading={deleteLoading}
      />
    </div>
  )
}
