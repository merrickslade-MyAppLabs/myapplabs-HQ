import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'

const SECTION_CARDS = [
  {
    path: '/clients',
    title: 'Clients & Projects',
    subtitle: 'Manage clients, track project status and deadlines',
    color: '#6c63ff',
    bgMuted: 'rgba(108, 99, 255, 0.12)',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="9" r="4.5" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M5 25c0-5 4-9 9-9s9 4 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    path: '/tasks',
    title: 'Task Board',
    subtitle: 'Kanban board — drag tasks through To Do, In Progress, Done',
    color: '#22c55e',
    bgMuted: 'rgba(34, 197, 94, 0.12)',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="3" width="8" height="22" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="14" y="3" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
    )
  },
  {
    path: '/prompts',
    title: 'Prompt Builder',
    subtitle: 'Build, save and reuse structured AI prompts for your projects',
    color: '#f59e0b',
    bgMuted: 'rgba(245, 158, 11, 0.12)',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M4 7h20M4 12h14M4 17h16M4 22h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="22" cy="21" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M22 19.5v3M20.5 21h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    path: '/revenue',
    title: 'Revenue & Financials',
    subtitle: 'Log income, track invoices and view financial summaries',
    color: '#3b82f6',
    bgMuted: 'rgba(59, 130, 246, 0.12)',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 3v22M9 8c0-1.7 2.2-3 5-3s5 1.3 5 3-2.2 3-5 3-5 1.3-5 3 2.2 3 5 3 5-1.3 5-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    )
  }
]

// Stagger animation for the cards
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] }
  }
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const displayName = user?.email?.split('@')[0]?.replace(/[._-]/g, ' ')
  // Capitalise first letter
  const capitalisedName = displayName
    ? displayName.charAt(0).toUpperCase() + displayName.slice(1)
    : 'there'

  return (
    <div className="page-container" style={{ height: '100%' }}>
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ marginBottom: '36px' }}
      >
        <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
          {getGreeting()}, {capitalisedName} 👋
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginTop: '6px' }}>
          Welcome to your business operations hub. What are you working on today?
        </p>
      </motion.div>

      {/* Section Cards Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '18px',
          maxWidth: '900px'
        }}
      >
        {SECTION_CARDS.map((card) => (
          <motion.button
            key={card.path}
            variants={cardVariants}
            onClick={() => navigate(card.path)}
            whileHover={{ scale: 1.015, y: -2 }}
            whileTap={{ scale: 0.99 }}
            className="card"
            style={{
              cursor: 'pointer',
              padding: '28px 26px',
              textAlign: 'left',
              background: 'var(--bg-card)',
              border: '1.5px solid var(--border-color)',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              minHeight: '160px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = card.color
              e.currentTarget.style.boxShadow = `0 8px 24px ${card.bgMuted}`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)'
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: card.bgMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: card.color
              }}
            >
              {card.icon}
            </div>

            {/* Text */}
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '-0.2px' }}>
                {card.title}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {card.subtitle}
              </div>
            </div>

            {/* Arrow */}
            <div style={{ marginTop: 'auto', color: card.color, opacity: 0.6 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* Quick stats row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        style={{ marginTop: '32px', display: 'flex', gap: '12px', alignItems: 'center' }}
      >
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Real-time sync active — both partners see changes instantly
        </div>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} />
      </motion.div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
