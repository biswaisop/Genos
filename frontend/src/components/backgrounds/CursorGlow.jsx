import { useEffect, useRef } from 'react'

function CursorGlow() {
  const glowRef = useRef(null)

  useEffect(() => {
    const glowEl = glowRef.current
    if (!glowEl) return undefined

    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let currentX = mouseX
    let currentY = mouseY
    let frameId = null

    const updatePosition = () => {
      currentX += (mouseX - currentX) * 0.15
      currentY += (mouseY - currentY) * 0.15
      glowEl.style.transform = `translate(${currentX}px, ${currentY}px) translate(-50%, -50%)`
      frameId = requestAnimationFrame(updatePosition)
    }

    const handleMouseMove = (event) => {
      mouseX = event.clientX
      mouseY = event.clientY
    }

    window.addEventListener('mousemove', handleMouseMove)
    frameId = requestAnimationFrame(updatePosition)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [])

  return (
    <div className="landing-page__cursor-glow" aria-hidden="true">
      <div ref={glowRef} className="cursor-glow__orb" />
    </div>
  )
}

export default CursorGlow
