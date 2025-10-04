// src/Annotations.jsx
import { useCallback, useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

export default function Annotations({ sphereRadius = 2 }) {
  const [points, setPoints] = useState([]) // { id, pos: THREE.Vector3, text }
  useMemo(() => new THREE.Sphere(new THREE.Vector3(0,0,0), sphereRadius), [sphereRadius])

  const onPointerDown = useCallback((e) => {
    // Shift+클릭에서만 추가 (원하면 조건 제거)
    if (!e.shiftKey) return
    const p = e.point.clone().normalize().multiplyScalar(sphereRadius)
    setPoints((ps) => [...ps, { id: crypto.randomUUID(), pos: p, text: `Anno ${ps.length + 1}` }])
  }, [sphereRadius])

  return (
    <group onPointerDown={onPointerDown}>
      {points.map((p) => (
        <group key={p.id} position={p.pos}>
          <mesh>
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshStandardMaterial color="#ffcc00" emissive="#553300" emissiveIntensity={0.5} />
          </mesh>
          <Html distanceFactor={10} position={[0.05, 0.05, 0]} occlude style={{ pointerEvents: 'none' }}>
            <div style={{
              background: 'rgba(0,0,0,0.55)', color: 'white', padding: '2px 6px',
              borderRadius: 6, fontSize: 12, backdropFilter: 'blur(2px)'
            }}>{p.text}</div>
          </Html>
        </group>
      ))}
    </group>
  )
}
