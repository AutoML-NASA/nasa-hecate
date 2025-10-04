// src/frontend/Globe.jsx
import { Suspense, useMemo, forwardRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { Stars } from '@react-three/drei'

const GlobeInner = forwardRef(({ radius = 2 }, ref) => {
  // Load NASA moon textures (4K quality)
  // These will be auto-downloaded on first run via scripts/download-textures.sh
  const colorMap = useLoader(TextureLoader, '/assets/lroc_color_poles_4k.jpg')
  const displacementMap = useLoader(TextureLoader, '/assets/ldem_3_8bit.jpg')

  console.log('Color map loaded:', colorMap)
  console.log('Displacement map loaded:', displacementMap)

  // 불필요한 지오메트리 재생성 방지용 - 균형잡힌 해상도
  const geoArgs = useMemo(() => [radius, 256, 256], [radius])

  return (
    <>
      {/* 주변광 */}
      <ambientLight intensity={0.5} />
      {/* 그림자/입체감 - 태양광처럼 */}
      <directionalLight position={[5, 3, 5]} intensity={1.2} castShadow />
      {/* 보조광 */}
      <pointLight position={[-5, -3, -5]} intensity={0.2} />
      {/* 별 배경 */}
      <Stars radius={100} depth={50} count={5000} fade speed={0.5} />

      {/* 달 메쉬 - ref 연결 */}
      <mesh ref={ref} castShadow receiveShadow>
        {/* 구 형태 지오메트리 - 균형잡힌 세그먼트로 성능과 품질 모두 확보 */}
        <sphereGeometry args={geoArgs} />
        {/* NASA 달 텍스처와 디스플레이스먼트 맵 적용 */}
        <meshStandardMaterial
          map={colorMap}
          displacementMap={displacementMap}
          displacementScale={0.06}
          displacementBias={-0.03}
          roughness={0.95}
          metalness={0.05}
        />
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