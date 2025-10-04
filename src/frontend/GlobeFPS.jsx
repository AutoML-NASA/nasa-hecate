// src/GlobeFPS.jsx
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import FPSCamera from './FPSCamera'
import Globe from './Globe'
import Annotations from './Annotations'
import MoonMap2D from './MoonMap2D'
import { Suspense, useState, useRef, useEffect } from 'react'
import * as THREE from 'three'

export default function GlobeFPS() {
  const [fpsMode, setFpsMode] = useState(false)
  const [is3DView, setIs3DView] = useState(true)
  const globeRef = useRef()
  const [isWalkMode, setIsWalkMode] = useState(false)
  const walkToFnRef = useRef(null)

  const [_resetKey, setResetKey] = useState(0)   // 리셋 트리거
  const initialCamera = [0, 2, 6]                // 초기 카메라 위치

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'black' }}>
      <button
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 10,
          padding: '8px 12px',
          borderRadius: '6px',
          background: '#333',
          color: 'white',
          cursor: 'pointer',
          border: 'none',
        }}
        onClick={() => {
          // Orbit 모드로 강제 전환 + key 리셋
          setFpsMode(false)
          setResetKey(k => k + 1)
        }}
      >
        Reset
      </button>

      {is3DView ? (
        <Canvas shadows dpr={[1, 2]} onCreated={({ gl, camera }) => {
            gl.setClearColor('#000000')
            camera.position.set(...initialCamera)
          }}>
        <Suspense fallback={null}>
          {fpsMode ? (
            <FPSCamera 
              initial={[0, 2, 6]} 
              speed={0.8}
              walkSpeed={1.2}
              rotateTarget={globeRef}
              blockSphere={true}
              collideSphereRef={globeRef}
              sphereRadius={2}
              padding={0.15}
              terrainFollow={true}
              cameraHeight={0.15}
              onWalkToPoint={(fn) => { 
                console.log('✅ walkTo 함수 등록됨')
                walkToFnRef.current = fn 
              }}
            />
          ) : (
            <OrbitControls enablePan={false} enableDamping dampingFactor={0.1} />
          )}

          <Globe ref={globeRef} radius={2} />
          <Annotations sphereRadius={2} />
          
          {/* 걷기 모드 클릭 감지를 Canvas 내부로 이동 */}
          {isWalkMode && fpsMode && (
            <ClickDetector
              globeRef={globeRef}
              walkToFnRef={walkToFnRef}
              onComplete={() => setIsWalkMode(false)}
            />
          )}
        </Suspense>
      </Canvas>
      ) : (
        <MoonMap2D />
      )}

      {/* 2D/3D View toggle button */}
      <button
        onClick={() => setIs3DView(!is3DView)}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          padding: '12px 20px',
          background: 'rgba(50, 50, 50, 0.8)',
          color: '#fff',
          border: '2px solid #666',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(70, 70, 70, 0.9)'
          e.target.style.borderColor = '#888'
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(50, 50, 50, 0.8)'
          e.target.style.borderColor = '#666'
        }}
      >
        {is3DView ? '2D Map' : '3D View'}
      </button>

      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 1000,
        pointerEvents: 'none',
      }}>
        <button
          onClick={() => {
            setFpsMode(!fpsMode)
            setIsWalkMode(false)
          }}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: fpsMode ? '#FF9800' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            pointerEvents: 'auto',
          }}
        >
          {fpsMode ? '🌍 궤도 모드로' : '🎮 FPS 모드로'}
        </button>

        {fpsMode && (
          <button
            onClick={() => setIsWalkMode(!isWalkMode)}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: isWalkMode ? '#ff4444' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              pointerEvents: 'auto',
            }}
          >
            {isWalkMode ? '❌ 취소' : '🚶 걷기'}
          </button>
        )}

        {isWalkMode && fpsMode && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(76, 175, 80, 0.95)',
            color: 'white',
            borderRadius: '8px',
            fontSize: '15px',
            textAlign: 'center',
            fontWeight: 'bold',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            👆 지구본을 클릭하세요!
          </div>
        )}

        <div style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: 'white',
          borderRadius: '6px',
          fontSize: '12px',
          textAlign: 'center',
        }}>
          현재: {fpsMode ? 'FPS 모드' : '궤도 모드'}
          {fpsMode && <div style={{ fontSize: '11px', marginTop: '4px' }}>WASD로 이동</div>}
        </div>
      </div>
    </div>
  )
}

// Canvas 내부에서 클릭 감지
function ClickDetector({ globeRef, walkToFnRef, onComplete }) {
  const { camera, gl, scene } = useThree()
  const raycaster = useRef(new THREE.Raycaster())

  useEffect(() => {
    const handleClick = (e) => {
      console.log('=== 클릭 이벤트 감지 ===')
      console.log('walkToFnRef:', !!walkToFnRef.current)
      console.log('globeRef:', !!globeRef.current)
      
      if (!walkToFnRef.current) {
        console.error('❌ walkTo 함수 없음')
        return
      }

      if (!globeRef.current) {
        console.error('❌ Globe ref 없음')
        return
      }

      const rect = gl.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )

      raycaster.current.setFromCamera(mouse, camera)
      
      // Scene 전체에서 Globe 찾기
      const allObjects = []
      scene.traverse((obj) => {
        if (obj.isMesh) {
          allObjects.push(obj)
        }
      })
      
      console.log('Scene의 모든 메쉬 개수:', allObjects.length)
      
      // Globe의 모든 자식 포함
      const intersects = raycaster.current.intersectObject(globeRef.current, true)
      console.log('Globe와의 Intersects:', intersects.length)
      
      // Globe에서 교차 없으면 전체 Scene에서 시도
      let targetIntersect = null
      if (intersects.length > 0) {
        targetIntersect = intersects[0]
        console.log('✅ Globe에서 발견:', targetIntersect.point)
      } else {
        const sceneIntersects = raycaster.current.intersectObjects(allObjects, false)
        console.log('Scene 전체 Intersects:', sceneIntersects.length)
        if (sceneIntersects.length > 0) {
          targetIntersect = sceneIntersects[0]
          console.log('✅ Scene에서 발견:', targetIntersect.point)
        }
      }

      if (targetIntersect) {
        const point = targetIntersect.point
        console.log('📍 클릭 위치:', point)
        
        // 구의 중심 (0, 0, 0으로 가정)
        const center = new THREE.Vector3(0, 0, 0)
        
        const direction = point.clone().sub(center).normalize()
        const targetPos = center.clone().add(direction.multiplyScalar(2.15))

        console.log('🎯 목표 위치:', targetPos)
        console.log('🚀 walkTo 호출!')
        
        walkToFnRef.current(targetPos.x, targetPos.y, targetPos.z)
        onComplete()
      } else {
        console.warn('⚠️ 아무것도 클릭되지 않음')
      }
    }

    gl.domElement.addEventListener('click', handleClick)
    console.log('👂 클릭 리스너 등록됨')
    
    return () => {
      gl.domElement.removeEventListener('click', handleClick)
      console.log('👋 클릭 리스너 해제됨')
    }
  }, [camera, gl, scene, globeRef, walkToFnRef, onComplete])

  return null
}