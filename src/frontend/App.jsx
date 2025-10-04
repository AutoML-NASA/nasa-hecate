// src/frontend/App.jsx
import { useEffect, useRef, useState } from 'react'
import { Viewer, Cesium3DTileset, Entity } from 'resium'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// ⛽️ Ion 토큰 (필요 시 채워 넣기)
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjU0NDZjOC0xMWMwLTQ5ZWEtYTg5MC02NTljMmZiNWFiMzUiLCJpZCI6MzQ3MDUzLCJpYXQiOjE3NTk1NjU2ODZ9.yuChdxYa0oW-6WWuYXE_JMBhzd9DjzXRTcEX0cH4pD8'
const MOON_ASSET_ID = 2684829

// 🌕 달 좌표계 사용
Cesium.Ellipsoid.WGS84 = Cesium.Ellipsoid.MOON
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON

// 아폴로 착륙 지점 데이터
const apolloSites = [
  { name: 'Apollo 11', lat: 0.66413, lon: 23.46991 },
  { name: 'Apollo 15', lat: 25.97552, lon: 3.56152 },
  { name: 'Apollo 17', lat: 20.029, lon: 30.462 },
]

export default function MoonCesium() {
  const viewerRef = useRef(null)
  const tilesetRef = useRef(null)
  const containerRef = useRef(null)

  const [isFPS, setIsFPS] = useState(false)
  const keysRef = useRef(Object.create(null))
  const preRenderCbRef = useRef(null)

  // 🚁 표면 위 호버(AGL) 제어 파라미터 & 스크래치
  const hoverRef = useRef({
    enabled: true,  // FPS에서는 강제 ON (토글 불가)
    target: 1500,   // 목표 AGL (m)
    min: 300,       // 최소 AGL (m) — 절대 이 아래로 못감
    max: 6000,      // 최대 AGL (m)
    k: 1.0,         // 스프링 강성
    d: 8,         // 감쇠
    v: 0            // 누적 수직 속도
  })
  const scratch = useRef({
    normal: new Cesium.Cartesian3(),
    down:   new Cesium.Cartesian3(),
    offs:   new Cesium.Cartesian3(),
    surf:   new Cesium.Cartesian3(),
    groundCarto: new Cesium.Cartographic()
  }).current

  // 🔥 스피드 배수 (±로 조절)
  const [speedMul, setSpeedMul] = useState(1)
  const speedMulRef = useRef(1)
  useEffect(() => { speedMulRef.current = speedMul }, [speedMul])

  // 포맷터: m/s → 보기 좋은 단위
  const fmtSpeed = (mps) => {
    if (mps >= 1_000_000) return `${(mps/1_000_000).toFixed(2)} Mm/s`
    if (mps >= 1_000) return `${(mps/1_000).toFixed(1)} km/s`
    return `${Math.round(mps)} m/s`
  }

  useEffect(() => { containerRef.current?.focus() }, [])

  // F로 모드 토글
  useEffect(() => {
    const onToggle = (e) => { if (e.code === 'KeyF') setIsFPS(v => !v) }
    window.addEventListener('keydown', onToggle)
    return () => window.removeEventListener('keydown', onToggle)
  }, [])

  // 공통 초기화
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    const tileset = tilesetRef.current?.cesiumElement
    if (!viewer || !tileset) return

    let destroyed = false
    const { scene, camera } = viewer
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)

    ;(async () => {
      try { await tileset.readyPromise } catch (e) { console.error(e); return }
      if (destroyed) return

      // 연속 렌더
      scene.requestRenderMode = false

      scene.shadowMap.enabled = true
      scene.moon.show = false
      scene.sun.show = true

      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 18_000_000),
        orientation: { pitch: Cesium.Math.toRadians(-5) },
      })

      const ctrl = scene.screenSpaceCameraController
      ctrl.enableTilt = ctrl.enableLook = ctrl.enableTranslate = ctrl.enableZoom = true
      ctrl.minimumZoomDistance = 5.0
      ctrl.maximumZoomDistance = 10_000_000.0

      handler.setInputAction((e) => {
        if (!scene.pickPositionSupported) return
        const picked = scene.pickPosition(e.position)
        if (Cesium.defined(picked)) {
          const carto = Cesium.Cartographic.fromCartesian(picked)
          console.log(
            `위도: ${Cesium.Math.toDegrees(carto.latitude).toFixed(4)}, 경도: ${Cesium.Math.toDegrees(carto.longitude).toFixed(4)}`
          )
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    })()

    return () => { destroyed = true; handler.destroy() }
  }, [])

  // 모드별 입력/이동 + AGL 유지
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const { scene, camera } = viewer
    const ellipsoid = Cesium.Ellipsoid.MOON

    // ⚠️ FPS 진입 시 호버 강제 ON
    if (isFPS) hoverRef.current.enabled = true
    
    // ✨ [여기 추가]
    if (isFPS) {
      const canvas = viewer.scene.canvas
      canvas.requestPointerLock = canvas.requestPointerLock || 
                           canvas.mozRequestPointerLock || 
                           canvas.webkitRequestPointerLock

      // 클릭 시 포인터 락
      const lockPointer = () => {
        canvas.requestPointerLock()
      }
      canvas.addEventListener('click', lockPointer)

      // 마우스 이동으로 카메라 회전
      const onMouseMove = (e) => {
        if (document.pointerLockElement === canvas ||
            document.mozPointerLockElement === canvas ||
            document.webkitPointerLockElement === canvas) {
            
          const sensitivity = 0.002
          camera.lookLeft(-e.movementX * sensitivity)
          camera.lookUp(-e.movementY * sensitivity)
        }
      }

      // ESC로 포인터 락 해제 시 FPS 모드 종료
      const onPointerLockChange = () => {
        if (!document.pointerLockElement && 
            !document.mozPointerLockElement && 
            !document.webkitPointerLockElement) {
          // 포인터 락이 해제되면 Original 모드로 전환
          setIsFPS(false)
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('pointerlockchange', onPointerLockChange)
      document.addEventListener('mozpointerlockchange', onPointerLockChange)
      document.addEventListener('webkitpointerlockchange', onPointerLockChange)

      const carto = new Cesium.Cartographic(
        Cesium.Math.toRadians(0),
        Cesium.Math.toRadians(0),
        hoverRef.current.target
      )
      const pos = Cesium.Cartesian3.fromRadians(
        carto.longitude,
        carto.latitude,
        carto.height,
        ellipsoid
      )

      camera.flyTo({
        destination: pos,
        orientation: {
          heading: 0.0,
          pitch: 0.0,
          roll: 0.0
        },
        duration: 0.5
      })
      scene.screenSpaceCameraController.enableRotate = false
      scene.screenSpaceCameraController.enableTranslate = false
      scene.screenSpaceCameraController.enableZoom = false
      scene.screenSpaceCameraController.enableTilt = false
      scene.screenSpaceCameraController.enableLook = false
    }

    const bumpSpeed = (dir) => {
      setSpeedMul(v => {
        const next = dir > 0 ? Math.min(v * 1.6, 5000) : Math.max(v / 1.6, 0.02)
        return Number(next.toFixed(3))
      })
    }

    const onKeyDown = (e) => {
      keysRef.current[e.code] = true

      // (FPS에서는 Hover 토글 금지) — G키 동작 없음
      if (e.code === 'PageUp')   { hoverRef.current.target = Math.min(hoverRef.current.target + 200, 20000) }
      if (e.code === 'PageDown') { hoverRef.current.target = Math.max(hoverRef.current.target - 200, 50) }

      // ±로 속도 배수 변경
      if (e.code === 'BracketRight' || e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault(); bumpSpeed(+1)
      }
      if (e.code === 'BracketLeft' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault(); bumpSpeed(-1)
      }

      if (isFPS && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault()
      scene.requestRender?.()
    }
    const onKeyUp = (e) => { keysRef.current[e.code] = false; scene.requestRender?.() }

    // 카메라 높이 헬퍼
    const getHeight = () => {
      const carto = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
      return carto?.height ?? 1
    }

    // AGL/지면 위치 구하기
    const sampleGround = (carto) => {
      // 1) 빠른 경로: 타일/지형에서 높이 샘플
      let groundH = scene.sampleHeight?.(carto, undefined, 3.0)
      if (groundH !== undefined) {
        scratch.groundCarto.longitude = carto.longitude
        scratch.groundCarto.latitude  = carto.latitude
        scratch.groundCarto.height    = groundH
        const groundPos = Cesium.Cartesian3.fromRadians(
          scratch.groundCarto.longitude,
          scratch.groundCarto.latitude,
          scratch.groundCarto.height,
          ellipsoid
        )
        return {
          agl: carto.height - groundH,
          groundPos
        }
      }
      // 2) 레이캐스트 보강
      Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(carto, scratch.normal)
      Cesium.Cartesian3.multiplyByScalar(scratch.normal, -1, scratch.down)
      const hit = scene.pickFromRay?.(new Cesium.Ray(camera.position, scratch.down))
      if (hit && hit.position) {
        return {
          agl: Cesium.Cartesian3.distance(camera.position, hit.position),
          groundPos: hit.position
        }
      }
      // 3) 최후: 타원체 표면
      const onSurf = ellipsoid.scaleToGeodeticSurface(camera.position, scratch.surf)
      return {
        agl: onSurf ? Cesium.Cartesian3.distance(camera.position, onSurf) : undefined,
        groundPos: onSurf ?? undefined
      }
    }

    if (isFPS) {
      scene.requestRenderMode = false
      window.addEventListener('keydown', onKeyDown, { passive: false })
      window.addEventListener('keyup', onKeyUp)

      let lastTime
      const preRender = (_scn, time) => {
        let dt = 0
        if (lastTime) dt = Cesium.JulianDate.secondsDifference(time, lastTime)
        lastTime = time
        if (dt <= 0) return

        const k = keysRef.current

        // 🏎️ 고도 비례 속도 + 배수
        const h = getHeight()
        let speed = Math.min(Math.max(h * 0.02, 200), 1_500_000)
        speed *= speedMulRef.current
        if (k.ShiftLeft || k.ShiftRight) speed *= 5
        const amt = speed * dt

        // 이동 적용
        if (k.KeyW || k.ArrowUp)    camera.moveForward(amt)
        if (k.KeyS || k.ArrowDown)  camera.moveBackward(amt)
        if (k.KeyA || k.ArrowLeft)  camera.moveLeft(amt)
        if (k.KeyD || k.ArrowRight) camera.moveRight(amt)
        if (k.Space)                camera.moveUp(amt)
        if (k.ControlLeft || k.ControlRight) camera.moveDown(amt)

        // === 표면 법선 계산
        const carto = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
        if (!carto) return
        ellipsoid.geodeticSurfaceNormalCartographic(carto, scratch.normal)
        Cesium.Cartesian3.multiplyByScalar(scratch.normal, -1, scratch.down)

        // === 현재 AGL/지면 위치
        let { agl, groundPos } = sampleGround(carto)
        if (agl === undefined || !groundPos) return

        const hover = hoverRef.current

        // (0) 지면 충돌 클램프 1차 — 절대 침투 금지
        if (agl < hover.min) {
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.min, scratch.offs)
          Cesium.Cartesian3.add(groundPos, scratch.offs, camera.position)
          const carto2 = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
          const res2 = sampleGround(carto2)
          agl = res2.agl
          groundPos = res2.groundPos
        }

        // (a) 상한 클램프: 너무 높이 떠 있으면 max까지 당김
        if (agl > hover.max) {
          const delta = -(agl - hover.max)
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, delta, scratch.offs)
          Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)
          const carto3 = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
          const res3 = sampleGround(carto3)
          agl = res3.agl
          groundPos = res3.groundPos
        }

        // (b) 스프링(중력 느낌): target AGL로 부드럽게 복원
        const err = Cesium.Math.clamp(hover.target - agl, -5000, 5000)
        hover.v += (hover.k * err - hover.d * hover.v) * dt
        const dz = hover.v * dt
        Cesium.Cartesian3.multiplyByScalar(scratch.normal, dz, scratch.offs)
        Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)

        // (c) 지면 충돌 클램프 2차 — 스프링 이동 후에도 보장
        const carto4 = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
        const res4 = sampleGround(carto4)
        if (res4.agl !== undefined && res4.groundPos && res4.agl < hover.min) {
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.min, scratch.offs)
          Cesium.Cartesian3.add(res4.groundPos, scratch.offs, camera.position)
          hover.v = Math.max(0, hover.v) // 지면 반작용: 아래로 가는 속도 제거
        }
      }

      scene.preRender.addEventListener(preRender)
      preRenderCbRef.current = preRender

      return () => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        canvas.removeEventListener('click', lockPointer)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('pointerlockchange', onPointerLockChange)
        document.removeEventListener('mozpointerlockchange', onPointerLockChange)
        document.removeEventListener('webkitpointerlockchange', onPointerLockChange)
              
        if (document.exitPointerLock) {
          document.exitPointerLock()
        }

        scene.screenSpaceCameraController.enableRotate = true
        scene.screenSpaceCameraController.enableTranslate = true
        scene.screenSpaceCameraController.enableZoom = true
        scene.screenSpaceCameraController.enableTilt = true
        scene.screenSpaceCameraController.enableLook = true

        if (preRenderCbRef.current) {
          scene.preRender.removeEventListener(preRenderCbRef.current)
          preRenderCbRef.current = null
        }
        keysRef.current = Object.create(null)
      }
    } else {
      const ctrl = scene.screenSpaceCameraController
      ctrl.enableRotate = true
      ctrl.enableTranslate = true
      ctrl.enableZoom = true
      ctrl.enableTilt = true
      ctrl.enableLook = true
      if (preRenderCbRef.current) {
        scene.preRender.removeEventListener(preRenderCbRef.current)
        preRenderCbRef.current = null
      }
      keysRef.current = Object.create(null)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [isFPS])

  // HUD용: 현재 예상 속도 표시(대략값)
  const viewer = viewerRef.current?.cesiumElement
  const approxSpeed = (() => {
    if (!viewer) return 0
    const ellipsoid = Cesium.Ellipsoid.MOON
    const carto = Cesium.Cartographic.fromCartesian(viewer.camera.position, ellipsoid)
    const h = carto?.height ?? 1
    let base = Math.min(Math.max(h * 0.02, 200), 1_500_000)
    return base * speedMul
  })()

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onClick={() => containerRef.current?.focus()}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        margin: 0, padding: 0, overflow: 'hidden',
        zIndex: 0, background: 'black',
      }}
    >
      {/* HUD */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        display: 'flex', gap: 8, alignItems: 'center',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        <span style={{
          padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)',
          color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)',
          backdropFilter: 'blur(4px)',
        }}>
          Mode: {isFPS ? 'FPS (W/A/S/D, Shift, Space, Ctrl)' : 'Original (Mouse)'}
        </span>
        <button
          onClick={() => setIsFPS(v => !v)}
          style={{
            padding: '6px 10px', borderRadius: 8, background: isFPS ? '#2d6cdf' : '#444',
            color: '#fff', border: 'none', cursor: 'pointer'
          }}
          title="F 키로도 전환 가능"
        >
          {isFPS ? 'Switch to Original (F)' : 'Switch to FPS (F)'}
        </button>
        {isFPS && (
          <span style={{
            padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(4px)',
          }}>
            Speed: {fmtSpeed(approxSpeed)} ×{speedMul}
            {' '}<small>([-] / [+]) · Hover: LOCKED · Target AGL: {hoverRef.current.target} m (PgUp/PgDn)</small>
          </span>
        )}
      </div>

      <Viewer
        ref={viewerRef}
        full
        style={{ width: '100%', height: '100%' }}
        baseLayerPicker={false}
        timeline={false}
        animation={false}
        skyBox={false}
        skyAtmosphere={false}
        imageryProvider={false}
        terrainProvider={false}
        requestRenderMode={false}
        shouldAnimate
      >
        <Cesium3DTileset
          ref={tilesetRef}
          url={Cesium.IonResource.fromAssetId(MOON_ASSET_ID)}
        />
        
        {apolloSites.map((site) => (
          <Entity
            key={site.name}
            name={site.name}
            position={Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 100)}
            point={{
              pixelSize: 8,
              color: Cesium.Color.YELLOW,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
            }}
            label={{
              text: site.name,
              font: '14px sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY, // 가까이 가도 라벨이 보이도록 설정 (추가)
            }}
          />
        ))}

      </Viewer>
    </div>
  )
}