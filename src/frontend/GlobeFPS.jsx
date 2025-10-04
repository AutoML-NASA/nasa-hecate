// src/GlobeFPS.jsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import FPSCamera from './FPSCamera'
import Globe from './Globe'
import Annotations from './Annotations'
import { Suspense, useState } from 'react'

export default function GlobeFPS() {
  // FPS(1인칭) 모드 on/off 상태
  const [fpsMode, setFpsMode] = useState(true)

  // ✅ Reset 기능 추가
  const [resetKey, setResetKey] = useState(0)   // 리셋 트리거
  const initialCamera = [0, 2, 6]               // 초기 카메라 위치

  return (
    // 전체 화면을 캔버스로 덮기 위한 fixed 컨테이너
    <div style={{ position: 'fixed', inset: 0, background: 'black' }}>
      {/* ✅ Reset 버튼 추가 */}
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

      {/* 
        Canvas: three.js 렌더러를 React 트리로 감쌈
        - shadows: 그림자 활성화
        - dpr: 디스플레이 픽셀 비율
        - onCreated: WebGLRenderer 생성 시 배경색 초기화
      */}
      <Canvas
        key={resetKey} // ✅ key가 바뀌면 Canvas 전체 리셋
        shadows
        dpr={[1, 2]}
        onCreated={({ gl, camera }) => {
          gl.setClearColor('#000000')
          camera.position.set(...initialCamera) // ✅ 카메라 초기화
        }}
      >
        {/* 
          Suspense: 하위 컴포넌트(텍스처/모델 등) 로딩 대기
          - fallback={null}: 로딩 중엔 비표시(필요 시 로딩 UI로 교체 가능)
        */}
        <Suspense fallback={null}>
          {fpsMode ? (
            <FPSCamera initial={[0, 2, 6]} speed={8} />
          ) : (
            // OrbitControls: 궤도 방식 회전/줌 (패닝 비활성화)
            <OrbitControls enablePan={false} enableDamping dampingFactor={0.1} />
          )}

          <Globe radius={2} />
          <Annotations sphereRadius={2} />
        </Suspense>
      </Canvas>
    </div>
  )
}
