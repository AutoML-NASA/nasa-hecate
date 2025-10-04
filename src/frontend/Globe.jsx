// src/frontend/Globe.jsx
import { Suspense, useMemo, forwardRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { Stars } from '@react-three/drei'
import moonUrl from '../../public/moon.png'

const GlobeInner = forwardRef(({ radius = 2 }, ref) => {
  // 모듈 import URL을 그대로 사용
  const tex = useLoader(TextureLoader, moonUrl)
  console.log('Loaded texture:', tex)
  const geoArgs = useMemo(() => [radius, 64, 64], [radius])

  return (
    <>
      {/* 라이트 */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />

      {/* 별 배경 */}
      <Stars radius={100} depth={50} count={5000} fade speed={0.5} />

      {/* 구 - ref 연결 */}
      <mesh ref={ref}>
        <sphereGeometry args={geoArgs} />
        <meshStandardMaterial map={tex} />
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