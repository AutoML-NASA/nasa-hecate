// src/MoonMap2D.jsx
import { useRef, useEffect, useState } from 'react'

export default function MoonMap2D() {
  const canvasRef = useRef(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height

    // Loading placeholder
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#666'
    ctx.font = '16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Loading NASA Moon Map...', width / 2, height / 2)

    // Load NASA moon texture from local assets (4K quality)
    // This will be auto-downloaded on first run via scripts/download-textures.sh
    const moonImage = new Image()
    moonImage.src = '/assets/lroc_color_poles_4k.jpg'

    moonImage.onload = () => {
      // Draw moon surface texture
      ctx.drawImage(moonImage, 0, 0, width, height)
      setImageLoaded(true)

      // Draw grid overlay
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 1

      // Vertical lines (longitude)
      for (let i = 0; i <= 360; i += 30) {
        const x = (i / 360) * width
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }

      // Horizontal lines (latitude)
      for (let i = 0; i <= 180; i += 30) {
        const y = (i / 180) * height
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Draw map projection text with background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.fillRect(10, 10, 210, 30)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px Arial'
      ctx.textAlign = 'left'
      ctx.fillText('Moon Surface Map (NASA LROC)', 20, 30)

      // Draw coordinates with semi-transparent background
      ctx.font = '11px Arial'

      // Longitude labels
      for (let i = 0; i <= 360; i += 60) {
        const x = (i / 360) * width
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.fillRect(x + 3, height - 22, 30, 16)
        ctx.fillStyle = '#fff'
        ctx.fillText(`${i}°`, x + 5, height - 8)
      }

      // Latitude labels
      for (let i = 0; i <= 180; i += 60) {
        const y = (i / 180) * height
        const lat = 90 - i
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.fillRect(5, y + 2, 35, 16)
        ctx.fillStyle = '#fff'
        ctx.fillText(`${lat}°`, 10, y + 15)
      }
    }

  }, [])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <canvas
        ref={canvasRef}
        width={1200}
        height={600}
        style={{
          maxWidth: '95%',
          maxHeight: '95%',
          border: '2px solid #444'
        }}
      />
    </div>
  )
}
