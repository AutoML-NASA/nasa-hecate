// src/frontend/Globe.jsx
import { Suspense, useMemo, forwardRef, useEffect } from 'react'
import { useLoader } from '@react-three/fiber'
import { TextureLoader, SRGBColorSpace, CanvasTexture } from 'three'
import { Stars } from '@react-three/drei'

const APOLLO15_BOUNDS = {
  west: -49.77115,
  east: -48.00357,
  north: 26.09425,
  south: 23.42617,
}

const clamp01 = (value) => Math.min(1, Math.max(0, value))
const lonToU = (lon) => (lon + 180) / 360
const latToV = (lat) => 1 - ((lat + 90) / 180)

const GlobeInner = forwardRef(({ radius = 2 }, ref) => {
  const moonTexture = useLoader(TextureLoader, '/moon_small.png')
  const apolloTexture = useLoader(TextureLoader, '/apollo15_small.png')

  moonTexture.colorSpace = SRGBColorSpace
  apolloTexture.colorSpace = SRGBColorSpace

  const geoArgs = useMemo(() => [radius, 64, 64], [radius])

  const blendedTexture = useMemo(() => {
    if (typeof document === 'undefined') return null
    if (!moonTexture.image || !apolloTexture.image) return null

    const width = moonTexture.image.width || 2048
    const height = moonTexture.image.height || 1024
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(moonTexture.image, 0, 0, width, height)

    const overlayImage = apolloTexture.image
    const overlayWidth = overlayImage.width || width
    const overlayHeight = overlayImage.height || height

    const overlayCanvas = document.createElement('canvas')
    overlayCanvas.width = overlayWidth
    overlayCanvas.height = overlayHeight
    const overlayCtx = overlayCanvas.getContext('2d', { willReadFrequently: true })
    if (!overlayCtx) return null

    overlayCtx.drawImage(overlayImage, 0, 0, overlayWidth, overlayHeight)
    const overlayData = overlayCtx.getImageData(0, 0, overlayWidth, overlayHeight)
    const data = overlayData.data
    const threshold = 18

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const brightness = Math.max(r, g, b)
      data[i + 3] = brightness <= threshold ? 0 : 255
    }

    overlayCtx.putImageData(overlayData, 0, 0)

    const uMin = clamp01(lonToU(APOLLO15_BOUNDS.west))
    const uMax = clamp01(lonToU(APOLLO15_BOUNDS.east))
    const vMin = clamp01(latToV(APOLLO15_BOUNDS.north))
    const vMax = clamp01(latToV(APOLLO15_BOUNDS.south))

    const destX = uMin * width
    const destY = vMin * height
    const destWidth = Math.max(1, (uMax - uMin) * width)
    const destHeight = Math.max(1, (vMax - vMin) * height)

    ctx.drawImage(overlayCanvas, 0, 0, overlayWidth, overlayHeight, destX, destY, destWidth, destHeight)

    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }, [moonTexture, apolloTexture])

  useEffect(() => {
    return () => {
      blendedTexture?.dispose()
    }
  }, [blendedTexture])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <Stars radius={100} depth={50} count={5000} fade speed={0.5} />

      <mesh ref={ref}>
        <sphereGeometry args={geoArgs} />
        <meshStandardMaterial map={blendedTexture ?? moonTexture} />
      </mesh>
    </>
  )
})

const Globe = forwardRef((props, ref) => {
  return (
    <Suspense fallback={null}>
      <GlobeInner ref={ref} {...props} />
    </Suspense>
  )
})

export default Globe
