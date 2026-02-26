/**
 * Skeleton loading component.
 * width and height can be any CSS value string or number (px).
 */
export function Skeleton({ width = '100%', height = 16, borderRadius, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: borderRadius || 'var(--radius-sm)',
        flexShrink: 0
      }}
    />
  )
}

/**
 * Skeleton for a card row (icon + two lines of text).
 */
export function SkeletonCard() {
  return (
    <div
      className="card"
      style={{ padding: '16px 20px', display: 'flex', gap: '14px', alignItems: 'center' }}
    >
      <Skeleton width={40} height={40} borderRadius="var(--radius-md)" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} />
      </div>
    </div>
  )
}

/**
 * A list of skeleton cards for loading states.
 */
export function SkeletonList({ count = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
