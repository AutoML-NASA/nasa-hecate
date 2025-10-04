// src/app.jsx
import { useEffect, useRef, useState } from 'react'
import { Viewer, Cesium3DTileset } from 'resium'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjU0NDZjOC0xMWMwLTQ5ZWEtYTg5MC02NTljMmZiNWFiMzUiLCJpZCI6MzQ3MDUzLCJpYXQiOjE3NTk1NjU2ODZ9.yuChdxYa0oW-6WWuYXE_JMBhzd9DjzXRTcEX0cH4pD8'
const MOON_ASSET_ID = 2684829

Cesium.Ellipsoid.WGS84 = Cesium.Ellipsoid.MOON
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON

export default function MoonCesium() {
  const viewerRef = useRef(null)
  const tilesetRef = useRef(null)
  const containerRef = useRef(null)

  const [isFPS, setIsFPS] = useState(false)
  const keysRef = useRef(Object.create(null))
  const preRenderCbRef = useRef(null)

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

      // scene.globe.show = false
      // scene.globe.enableLighting = true
      scene.shadowMap.enabled = true
      scene.moon.show = false
      scene.sun.show = true

      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 18_000_000),
        orientation: { pitch: Cesium.Math.toRadians(-20) },
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

  // 모드별 입력/이동
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const { scene, camera } = viewer

    const bumpSpeed = (dir) => {
      setSpeedMul(v => {
        const next = dir > 0 ? Math.min(v * 1.6, 5000) : Math.max(v / 1.6, 0.02)
        return Number(next.toFixed(3))
      })
    }

    const onKeyDown = (e) => {
      keysRef.current[e.code] = true

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

        // 🏎️ 훨씬 빠른 고도 비례 속도 + 배수
        //   - 기존 대비 10배 강화: h * 0.02
        //   - 범위: 200 m/s ~ 1,500,000 m/s
        //   - Shift: ×5 스프린트
        const h = camera.positionCartographic?.height ?? 1
        let speed = Math.min(Math.max(h * 0.02, 200), 1_500_000)
        speed *= speedMulRef.current
        if (k.ShiftLeft || k.ShiftRight) speed *= 5
        const amt = speed * dt

        if (k.KeyW || k.ArrowUp)    camera.moveForward(amt)
        if (k.KeyS || k.ArrowDown)  camera.moveBackward(amt)
        if (k.KeyA || k.ArrowLeft)  camera.moveLeft(amt)
        if (k.KeyD || k.ArrowRight) camera.moveRight(amt)
        if (k.Space)                camera.moveUp(amt)
        if (k.ControlLeft || k.ControlRight) camera.moveDown(amt)
      }

      scene.preRender.addEventListener(preRender)
      preRenderCbRef.current = preRender

      return () => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        if (preRenderCbRef.current) {
          scene.preRender.removeEventListener(preRenderCbRef.current)
          preRenderCbRef.current = null
        }
        keysRef.current = Object.create(null)
      }
    } else {
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
    const h = viewer.camera.positionCartographic?.height ?? 1
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
            {' '}<small>([-] / [+])</small>
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
        // terrainProvider={new Cesium.EllipsoidTerrainProvider()}
        terrainProvider={false}
        requestRenderMode={false}
        shouldAnimate
      >
        <Cesium3DTileset
          ref={tilesetRef}
          url={Cesium.IonResource.fromAssetId(MOON_ASSET_ID)}
        />
      </Viewer>
    </div>
  )
}