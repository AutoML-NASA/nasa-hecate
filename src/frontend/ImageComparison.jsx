import { useState, useRef, useEffect } from 'react'

export default function ImageComparison({ isOpen, onClose }) {
  const [sliderPosition, setSliderPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const containerRef = useRef(null)

  // List of image pairs - matching before and after images
  const imagePairs = [
    { before: '/images/before/IMG_1602_4.png', after: '/images/after/IMG_1602_4_SMFAN_x4.png', name: 'IMG_1602_4' },
    { before: '/images/before/IMG_1602_5.png', after: '/images/after/IMG_1602_5_SMFAN_x4.png', name: 'IMG_1602_5' },
    { before: '/images/before/IMG_1602_6.png', after: '/images/after/IMG_1602_6_SMFAN_x4.png', name: 'IMG_1602_6' },
    { before: '/images/before/IMG_1602_7.png', after: '/images/after/IMG_1602_7_SMFAN_x4.png', name: 'IMG_1602_7' },
    { before: '/images/before/IMG_1603_2.png', after: '/images/after/IMG_1603_2_SMFAN_x4.png', name: 'IMG_1603_2' },
    { before: '/images/before/IMG_1603_3.png', after: '/images/after/IMG_1603_3_SMFAN_x4.png', name: 'IMG_1603_3' },
    { before: '/images/before/IMG_1603_4.png', after: '/images/after/IMG_1603_4_SMFAN_x4.png', name: 'IMG_1603_4' },
    { before: '/images/before/IMG_1603_5.png', after: '/images/after/IMG_1603_5_SMFAN_x4.png', name: 'IMG_1603_5' },
    { before: '/images/before/IMG_1603_6.png', after: '/images/after/IMG_1603_6_SMFAN_x4.png', name: 'IMG_1603_6' },
    { before: '/images/before/IMG_1603_7.png', after: '/images/after/IMG_1603_7_SMFAN_x4.png', name: 'IMG_1603_7' },
    { before: '/images/before/IMG_1604_2.png', after: '/images/after/IMG_1604_2_SMFAN_x4.png', name: 'IMG_1604_2' },
    { before: '/images/before/IMG_1604_3.png', after: '/images/after/IMG_1604_3_SMFAN_x4.png', name: 'IMG_1604_3' },
    { before: '/images/before/IMG_1604_4.png', after: '/images/after/IMG_1604_4_SMFAN_x4.png', name: 'IMG_1604_4' },
    { before: '/images/before/IMG_1604_5.png', after: '/images/after/IMG_1604_5_SMFAN_x4.png', name: 'IMG_1604_5' },
    { before: '/images/before/IMG_1604_6.png', after: '/images/after/IMG_1604_6_SMFAN_x4.png', name: 'IMG_1604_6' },
    { before: '/images/before/IMG_1604_7.png', after: '/images/after/IMG_1604_7_SMFAN_x4.png', name: 'IMG_1604_7' },
    { before: '/images/before/IMG_1605_2.png', after: '/images/after/IMG_1605_2_SMFAN_x4.png', name: 'IMG_1605_2' },
    { before: '/images/before/IMG_1605_3.png', after: '/images/after/IMG_1605_3_SMFAN_x4.png', name: 'IMG_1605_3' },
    { before: '/images/before/IMG_1605_4.png', after: '/images/after/IMG_1605_4_SMFAN_x4.png', name: 'IMG_1605_4' },
    { before: '/images/before/IMG_1605_5.png', after: '/images/after/IMG_1605_5_SMFAN_x4.png', name: 'IMG_1605_5' },
  ]

  useEffect(() => {
    if (!isOpen) return

    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const percentage = (x / rect.width) * 100
      setSliderPosition(percentage)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        handlePrevImage()
      } else if (e.key === 'ArrowRight') {
        handleNextImage()
      }
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDragging, isOpen, onClose])

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : imagePairs.length - 1))
    setSliderPosition(50)
  }

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev < imagePairs.length - 1 ? prev + 1 : 0))
    setSliderPosition(50)
  }

  if (!isOpen) return null

  const currentPair = imagePairs[currentImageIndex]

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%',
          maxWidth: '1200px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
          <h2 style={{ margin: 0, fontSize: '24px' }}>Super Resolution Comparison</h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#ef4444',
              color: 'white',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Close (ESC)
          </button>
        </div>

        {/* Image info */}
        <div style={{ textAlign: 'center', color: 'white', fontSize: '18px' }}>
          {currentPair.name} ({currentImageIndex + 1} / {imagePairs.length})
        </div>

        {/* Comparison container */}
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            width: '100%',
            height: '600px',
            overflow: 'hidden',
            borderRadius: '8px',
            cursor: isDragging ? 'ew-resize' : 'default',
            userSelect: 'none',
          }}
        >
          {/* After image (background) */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            <img
              src={currentPair.after}
              alt="After"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'rgba(0, 0, 0, 0.7)',
                color: '#31c48d',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              AFTER (Super Resolution)
            </div>
          </div>

          {/* Before image (clipped) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
            }}
          >
            <img
              src={currentPair.before}
              alt="Before"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(0, 0, 0, 0.7)',
                color: '#ef4444',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              BEFORE (Original)
            </div>
          </div>

          {/* Slider line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${sliderPosition}%`,
              width: '4px',
              height: '100%',
              background: 'white',
              cursor: 'ew-resize',
              transform: 'translateX(-50%)',
            }}
            onMouseDown={handleMouseDown}
          >
            {/* Slider handle */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '40px',
                height: '40px',
                background: 'white',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                cursor: 'ew-resize',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M7 14L3 10L7 6" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 6L17 10L13 14" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
          <button
            onClick={handlePrevImage}
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              background: '#4a5568',
              color: 'white',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ← Previous
          </button>
          <button
            onClick={handleNextImage}
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              background: '#4a5568',
              color: 'white',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Next →
          </button>
        </div>

        {/* Instructions */}
        <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px' }}>
          Drag the slider to compare | Use arrow buttons to switch images | Press ESC to close
        </div>
      </div>
    </div>
  )
}
