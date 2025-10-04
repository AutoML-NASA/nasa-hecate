// src/Globe.jsx
import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { Stars } from '@react-three/drei'

// 지구 표면 텍스쳐 이미지 URL
const TEX = '/moon.png'

export default function Globe({ radius = 2 }) {
  const tex = useLoader(TextureLoader, TEX)
  console.log('Loaded texture:', tex)

  // 불필요한 지오메트리 재생성 방지용
  const geoArgs = useMemo(() => [radius, 64, 64], [radius])

  return (
    <>
      {/* 주변광 */}
      <ambientLight intensity={0.6} />
      {/* 그림자/입체감 */}
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      {/* 별 배경 */}
      <Stars radius={100} depth={50} count={5000} fade speed={0.5} />

      {/* 지구본 메쉬 */}
      <mesh>
        {/* 구 형태 지오메트리 */}
        <sphereGeometry args={geoArgs} />
        {/* 텍스처가 있으면 텍스처 material, 없으면 파란 단색 material */}
        {tex ? (
          <meshStandardMaterial map={tex} />
        ) : (
          <meshStandardMaterial color="#3a6ea5" />
        )}
      </mesh>
    </>
  )
}
