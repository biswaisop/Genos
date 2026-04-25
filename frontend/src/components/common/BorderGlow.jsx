import { useRef, useCallback } from 'react'
import './BorderGlow.css'

function BorderGlow({
  as: Component = 'div',
  className = '',
  glowColor = '48 100% 54%',
  borderRadius = 12,
  children,
  ...rest
}) {
  const cardRef = useRef(null)

  const handlePointerMove = useCallback((event) => {
    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const angle = Math.atan2(y - cy, x - cx) * (180 / Math.PI) + 90

    const dx = Math.abs(x - cx) / Math.max(cx, 1)
    const dy = Math.abs(y - cy) / Math.max(cy, 1)
    const edgeProximity = Math.min(1, Math.max(dx, dy))

    card.style.setProperty('--cursor-angle', `${angle}deg`)
    card.style.setProperty('--edge-proximity', `${edgeProximity}`)
  }, [])

  return (
    <Component
      ref={cardRef}
      className={`border-glow-card ${className}`.trim()}
      style={{
        '--glow-color': `hsl(${glowColor})`,
        '--border-radius': `${borderRadius}px`,
      }}
      onPointerMove={handlePointerMove}
      {...rest}
    >
      <div className="border-glow-inner">{children}</div>
    </Component>
  )
}

export default BorderGlow
