// src/CompareView.jsx
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import FPSCamera from './FPSCamera'
import Globe from './GlobeWithRef' // ← 위에서 만든 래퍼(또는 ref 내보내는 기존 Globe)

function AnnotationPoints({ annotations }) {
  return (
    <>
      {annotations.map((a) => (
        <group key={a.id} position={a.position}>
          <mesh>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial
              color={a.confirmed ? '#00d68f' : '#ff6b6b'}
              emissiveIntensity={0.8}
            />
          </mesh>
          <Html center distanceFactor={8}>
            <div
              style={{
                padding: '2px 6px',
                borderRadius: 6,
                fontSize: 12,
                background: a.confirmed ? 'rgba(0, 214, 143, 0.85)' : 'rgba(255, 107, 107, 0.85)',
                color: 'white',
                whiteSpace: 'nowrap',
              }}
            >
              {a.label ?? (a.confirmed ? 'Confirmed' : 'Pending')}
            </div>
          </Html>
        </group>
      ))}
    </>
  )
}

function AnnotationController({ targetMeshRef, annotations, setAnnotations }) {
  const { gl, camera } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const ndc = useRef(new THREE.Vector2())

  const getNDC = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect()
    ndc.current.x = ((clientX - rect.left) / rect.width) * 2 - 1
    ndc.current.y = -((clientY - rect.top) / rect.height) * 2 + 1
  }

  const addAnnotationAt = useCallback((clientX, clientY) => {
    const globeMesh = targetMeshRef?.current?.mesh || targetMeshRef?.current
    if (!globeMesh) return
    getNDC(clientX, clientY)
    raycaster.current.setFromCamera(ndc.current, camera)
    const hit = raycaster.current.intersectObject(globeMesh, true)[0]
    if (hit) {
      const p = hit.point
      setAnnotations((prev) => [
        ...prev,
        { id: crypto.randomUUID(), position: [p.x, p.y, p.z], confirmed: false, label: null },
      ])
    }
  }, [camera, setAnnotations, targetMeshRef])

  const toggleConfirmIfHit = useCallback((clientX, clientY) => {
    getNDC(clientX, clientY)
    raycaster.current.setFromCamera(ndc.current, camera)
    // annotation sphere에만 반응하도록 scene 전체 대신 현재 캔버스의 렌더 트리에서 sphere만 필터링할 수도 있지만,
    // 여기서는 간단히 화면상 가까운 annotation을 거리 기반으로 토글합니다.
    // (정교한 메쉬 피킹을 원하면 AnnotationPoints의 mesh들을 별도 리스트로 관리하세요)
    // 가장 가까운 annotation 찾기
    const globePos = new THREE.Vector3(0,0,0)
    const camPos = new THREE.Vector3().copy(camera.position)
    // 레이 ↔ 점 거리 측정
    const ray = new THREE.Ray()
    raycaster.current.ray.at(1, globePos) // dummy
    ray.origin.copy(raycaster.current.ray.origin)
    ray.direction.copy(raycaster.current.ray.direction)

    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < annotations.length; i++) {
      const a = annotations[i]
      const pt = new THREE.Vector3(a.position[0], a.position[1], a.position[2])
      // ray와 점의 최단거리
      const dist = ray.distanceToPoint(pt)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    const PICK_EPS = 0.15 // 클릭 허용 반경
    if (bestIdx >= 0 && bestDist <= PICK_EPS) {
      setAnnotations(prev => prev.map((a, i) => i === bestIdx ? ({ ...a, confirmed: !a.confirmed }) : a))
    }
  }, [annotations, camera, setAnnotations])

  useEffect(() => {
    const el = gl.domElement
    const onContextMenu = (e) => { e.preventDefault(); addAnnotationAt(e.clientX, e.clientY) }
    const onMouseDown = (e) => { if (e.button === 0) toggleConfirmIfHit(e.clientX, e.clientY) }
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('mousedown', onMouseDown)
    return () => {
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('mousedown', onMouseDown)
    }
  }, [gl, addAnnotationAt, toggleConfirmIfHit])

  return null
}

function FollowCamera({ followRef }) {
  const cam = useRef()
  useFrame(() => {
    if (!followRef.current || !cam.current) return
    cam.current.position.copy(followRef.current.position)
    cam.current.rotation.copy(followRef.current.rotation)
    cam.current.fov = followRef.current.fov
    cam.current.near = followRef.current.near
    cam.current.far = followRef.current.far
    cam.current.updateProjectionMatrix()
  })
  return <perspectiveCamera ref={cam} makeDefault position={[0, 2, 6]} fov={60} />
}

export default function CompareView() {
  const [annotations, setAnnotations] = useState([])
  const leftDefaultCamRef = useRef(null)

  // 좌우 Globe의 mesh ref
  const leftGlobeRef = useRef(null)
  const rightGlobeRef = useRef(null)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', height: '100vh' }}>
      {/* LEFT: ORIGINAL */}
      <div style={{ borderRight: '1px solid #e5e7eb' }}>
        <Canvas shadows onCreated={({ camera }) => { leftDefaultCamRef.current = camera }}>
          <FPSCamera moveMode="view" />
          <Globe ref={leftGlobeRef} variant="original" />
          <AnnotationPoints annotations={annotations} />
          <AnnotationController
            targetMeshRef={leftGlobeRef}
            annotations={annotations}
            setAnnotations={setAnnotations}
          />
        </Canvas>
      </div>

      {/* RIGHT: AI */}
      <div>
        <Canvas shadows>
          <FollowCamera followRef={leftDefaultCamRef} />
          <Globe ref={rightGlobeRef} variant="ai" />
          <AnnotationPoints annotations={annotations} />
          <AnnotationController
            targetMeshRef={rightGlobeRef}
            annotations={annotations}
            setAnnotations={setAnnotations}
          />
        </Canvas>
      </div>

      {/* 라벨 */}
      <div style={{
        position: 'fixed', top: 12, left: 16, padding: '6px 10px',
        background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 6, fontSize: 12
      }}>
        LEFT: ORIGINAL
      </div>
      <div style={{
        position: 'fixed', top: 12, right: 16, padding: '6px 10px',
        background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 6, fontSize: 12
      }}>
        RIGHT: AI (Live)
      </div>
    </div>
  )
}
