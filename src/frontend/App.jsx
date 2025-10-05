// src/frontend/App.jsx
import { useEffect, useRef, useState } from 'react'
import { Viewer, Cesium3DTileset, Entity } from 'resium'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// ─────────────────────────────────────────────────────────────
// 필요: public/moon.png (equirectangular 텍스처)
// ─────────────────────────────────────────────────────────────
Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjU0NDZjOC0xMWMwLTQ5ZWEtYTg5MC02NTljMmZiNWFiMzUiLCJpZCI6MzQ3MDUzLCJpYXQiOjE3NTk1NjU2ODZ9.yuChdxYa0oW-6WWuYXE_JMBhzd9DjzXRTcEX0cH4pD8'
const MOON_ASSET_ID = 2684829

// 달 타원체 사용(전역 오버라이드)
Cesium.Ellipsoid.WGS84 = Cesium.Ellipsoid.MOON
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON

// ─────────────────────────────────────────────────────────────
// 상수 & 유틸
// ─────────────────────────────────────────────────────────────
const MINIMAP_W = 320
const MINIMAP_H = 160
const ARROW_MINIMAP_FRACTION = 0.01
const ARROW_WIDTH_PX = 8
const COS30 = 0.866025403784
const SIN30 = 0.5

const genId = () => `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
const toDeg = (rad) => Cesium.Math.toDegrees(rad)
const lonLatToXY = (lon, lat, w, h) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h]
const xyToLonLat = (x, y, w, h) => [(x / w) * 360 - 180, 90 - (y / h) * 180]

// ─────────────────────────────────────────────────────────────
// 미니맵
// ─────────────────────────────────────────────────────────────
function MiniMap({
  width = MINIMAP_W, height = MINIMAP_H, backgroundSrc = '/moon.png',
  currentLL, points = [], footprint = [],
  onPickLonLat,
  onCanvasRef,
}) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [hoverLL, setHoverLL] = useState(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; draw() }
    img.src = backgroundSrc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundSrc])

  const draw = () => {
    const cvs = canvasRef.current; if (!cvs) return
    const ctx = cvs.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = width, H = height
    cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr)
    cvs.style.width = W + 'px'; cvs.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, W, H)
    else { ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, W, H) }

    // 경위선
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x] = lonLatToXY(lon, 0, W, H); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      const [, y] = lonLatToXY(0, lat, W, H); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // 시야 폴리곤
    if (footprint?.length >= 3) {
      ctx.beginPath()
      footprint.forEach((p, i) => {
        const [x, y] = lonLatToXY(p.lon, p.lat, W, H)
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      })
      ctx.closePath()
      ctx.fillStyle = 'rgba(80,170,255,0.12)'; ctx.fill()
      ctx.strokeStyle = 'rgba(80,170,255,0.9)'; ctx.lineWidth = 2; ctx.stroke()
    }

    // 저장 포인트
    for (const p of points) {
      const [x, y] = lonLatToXY(p.lon, p.lat, W, H)
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,255,255,1)'; ctx.fill()
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke()
    }

    // 카메라 중심 크로스헤어
    if (currentLL) {
      const [x, y] = lonLatToXY(currentLL.lon, currentLL.lat, W, H)
      ctx.strokeStyle = 'rgba(160,220,255,0.95)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke()
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(0.5, 0.5, W - 1, H - 1)
  }

  useEffect(draw, [width, height, currentLL, points, footprint])

  const onClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const [lon, lat] = xyToLonLat(e.clientX - r.left, e.clientY - r.top, width, height)
    onPickLonLat?.(lon, lat)
  }
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const [lon, lat] = xyToLonLat(e.clientX - r.left, e.clientY - r.top, width, height)
    setHoverLL({ lon, lat })
  }

  return (
    <>
      {/* 미니맵 상단 위경도 바 */}
      <div style={{
        position: 'absolute', right: 12, bottom: 12 + (height + 44),
        zIndex: 15, padding: '6px 10px', borderRadius: 10,
        background: 'rgba(0,0,0,0.55)', color: '#dfe8ff', fontSize: 12,
        border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap'
      }}>
        {hoverLL
          ? <>Minimap Hover — lon: {hoverLL.lon.toFixed(4)}°, lat: {hoverLL.lat.toFixed(4)}°</>
          : currentLL
            ? <>Center — lon: {currentLL.lon.toFixed(4)}°, lat: {currentLL.lat.toFixed(4)}°</>
            : <>Move over the minimap…</>}
      </div>

      {/* 미니맵 */}
      <div style={{
        position: 'absolute', right: 12, bottom: 12, zIndex: 15,
        padding: 6, borderRadius: 10, background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', userSelect: 'none'
      }}>
        <div style={{ color: '#9ecbff', fontSize: 12, marginBottom: 6 }}>
          MiniMap (click to move)
        </div>
        <canvas
          ref={(el) => { canvasRef.current = el; onCanvasRef?.(el) }}
          width={width}
          height={height}
          onClick={onClick}
          onMouseMove={onMove}
          style={{ display: 'block', cursor: 'crosshair' }}
        />
        {currentLL && (
          <div style={{ color: '#ddd', fontSize: 12, marginTop: 6 }}>
            lon: {currentLL.lon.toFixed(3)}°, lat: {currentLL.lat.toFixed(3)}°
          </div>
        )}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// 메인(App)
// ─────────────────────────────────────────────────────────────
export default function App() {
  const viewerRef = useRef(null)
  const tilesetRef = useRef(null)
  const containerRef = useRef(null)

  const [isFPS, setIsFPS] = useState(false)
  const keysRef = useRef(Object.create(null))
  const [speedMul, setSpeedMul] = useState(1)
  const speedMulRef = useRef(1)
  useEffect(() => { speedMulRef.current = speedMul }, [speedMul])

  // 상태
  const [currentLL, setCurrentLL] = useState(null)
  const [savedPoints, setSavedPoints] = useState([])   // [{id, lon, lat}]
  const [footprint, setFootprint] = useState([])
  const [cursorLL3D, setCursorLL3D] = useState(null)
  const [toast, setToast] = useState(null)

  // 좌표 저장
  const lastCanvasPosRef = useRef(new Cesium.Cartesian2(0, 0))   // drawingBuffer
  const lastClientPosRef = useRef({ x: 0, y: 0 })                 // window client
  const minimapCanvasRef = useRef(null)

  useEffect(() => { containerRef.current?.focus() }, [])
  useEffect(() => {
    const el = containerRef.current
    const preventCtx = (e) => e.preventDefault()
    el?.addEventListener('contextmenu', preventCtx)
    return () => el?.removeEventListener('contextmenu', preventCtx)
  }, [])

  // 키 바인딩
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyF') setIsFPS(v => !v)
      if (e.code === 'KeyZ') zMap()
      if (e.code === 'KeyX') {
        setSavedPoints([])
        setToast('Cleared all mappings (X)')
        setTimeout(() => setToast(null), 1000)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line

  // 전역 마우스 추적
  useEffect(() => {
    const onWinMove = (e) => {
      lastClientPosRef.current = { x: e.clientX, y: e.clientY }

      // 캔버스 안이면 drawingBuffer도 갱신
      const viewer = viewerRef.current?.cesiumElement
      const canvasEl = viewer?.scene?.canvas
      if (!canvasEl) return
      const rect = canvasEl.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top  && e.clientY <= rect.bottom) {
        const dpr = canvasEl.width / rect.width
        lastCanvasPosRef.current = new Cesium.Cartesian2(
          (e.clientX - rect.left) * dpr,
          (e.clientY - rect.top)  * dpr
        )
      }
    }
    window.addEventListener('mousemove', onWinMove)
    return () => window.removeEventListener('mousemove', onWinMove)
  }, [])

  // 초기화 & 이벤트
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    const tileset = tilesetRef.current?.cesiumElement
    if (!viewer || !tileset) return

    let destroyed = false
    const { scene, camera } = viewer
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
    const canvasEl = scene.canvas

    const listeners = { mousemove_canvas: null, postRender: null }

    ;(async () => {
      try { await tileset.readyPromise } catch {}
      if (destroyed) return

      // 렌더 환경
      scene.requestRenderMode = false
      scene.backgroundColor = Cesium.Color.BLACK
      scene.clearColor = Cesium.Color.BLACK
      scene.fog.enabled = false

      // 픽 안정화
      scene.pickTranslucentDepth = true
      scene.globe.depthTestAgainstTerrain = true

      // 월 기반
      scene.globe.show = true
      scene.globe.ellipsoid = Cesium.Ellipsoid.MOON
      scene.moon.show = false
      scene.sun.show = true
      scene.useDepthPicking = true

      tileset.backFaceCulling = false

      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 18_000_000),
        orientation: { pitch: Cesium.Math.toRadians(-20) },
      })

      const ctrl = scene.screenSpaceCameraController
      ctrl.enableTilt = ctrl.enableLook = ctrl.enableTranslate = ctrl.enableZoom = true
      ctrl.minimumZoomDistance = 5.0
      ctrl.maximumZoomDistance = 10_000_000.0

      // 좌클릭 저장
      handler.setInputAction((e) => {
        const p = scene.pickPositionSupported ? scene.pickPosition(e.position) : undefined
        if (Cesium.defined(p)) {
          const cc = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MOON)
          setSavedPoints(ps => [...ps, { id: genId(), lon: toDeg(cc.longitude), lat: toDeg(cc.latitude) }])
          scene.requestRender()
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      // 캔버스 마우스 이동 → drawingBuffer 좌표 저장 + 3D 커서 HUD
      listeners.mousemove_canvas = (e) => {
        const rect = canvasEl.getBoundingClientRect()
        const dpr = canvasEl.width / rect.width
        const dbPos = new Cesium.Cartesian2(
          (e.clientX - rect.left) * dpr,
          (e.clientY - rect.top)  * dpr
        )
        lastCanvasPosRef.current = dbPos

        // 커서 위경도 HUD
        let cart = null
        if (scene.pickPositionSupported) {
          const pp = scene.pickPosition(dbPos)
          if (Cesium.defined(pp)) cart = pp
        }
        if (!cart) {
          const pe = camera.pickEllipsoid(dbPos, Cesium.Ellipsoid.MOON)
          if (Cesium.defined(pe)) cart = pe
        }
        if (cart) {
          const cc = Cesium.Cartographic.fromCartesian(cart, Cesium.Ellipsoid.MOON)
          setCursorLL3D({ lon: toDeg(cc.longitude), lat: toDeg(cc.latitude) })
        } else {
          setCursorLL3D(null)
        }
      }
      canvasEl.addEventListener('mousemove', listeners.mousemove_canvas)

      // 미니맵 갱신
      listeners.postRender = () => {
        const w = canvasEl.width, h = canvasEl.height
        const center = new Cesium.Cartesian2(w / 2, h / 2)
        let centerLL = null
        if (scene.pickPositionSupported) {
          const p = scene.pickPosition(center)
          if (Cesium.defined(p)) {
            const cc = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MOON)
            centerLL = { lon: toDeg(cc.longitude), lat: toDeg(cc.latitude) }
          }
        }
        if (!centerLL) {
          const cCarto = Cesium.Cartographic.fromCartesian(camera.position, Cesium.Ellipsoid.MOON)
          if (cCarto) centerLL = { lon: toDeg(cCarto.longitude), lat: toDeg(cCarto.latitude) }
        }
        if (centerLL) setCurrentLL(centerLL)

        // 시야 원형 근사
        const N = 18, r = Math.min(w, h) * 0.48
        const samples = Array.from({ length: N }, (_, i) => {
          const t = (i / N) * Math.PI * 2
          return new Cesium.Cartesian2(w / 2 + r * Math.cos(t), h / 2 + r * Math.sin(t))
        })
        const poly = []
        if (scene.pickPositionSupported) {
          for (const s of samples) {
            const p = scene.pickPosition(s)
            if (Cesium.defined(p)) {
              const cc = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MOON)
              poly.push({ lon: toDeg(cc.longitude), lat: toDeg(cc.latitude) })
            }
          }
        }
        setFootprint(poly.length >= 6 ? poly : [])
      }
      scene.postRender.addEventListener(listeners.postRender)

      // 정리
      ;(viewer).__cleanup__ = () => {
        canvasEl.removeEventListener('mousemove', listeners.mousemove_canvas)
        if (listeners.postRender) scene.postRender.removeEventListener(listeners.postRender)
        handler.destroy()
      }
    })()

    return () => {
      destroyed = true
      const v = viewerRef.current?.cesiumElement
      if (v && v.__cleanup__) v.__cleanup__()
    }
  }, [])

  // 견고한 픽(3D)
  const pickAtCanvasPos = async (pos) => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return null
    const { scene, camera } = viewer

    if (scene.pickPositionSupported) {
      const p = scene.pickPosition(pos)
      if (Cesium.defined(p)) return p
    }
    try {
      const ray = camera.getPickRay(pos)
      if (ray) {
        const res = await scene.pickFromRayMostDetailed(ray)
        if (res?.position) return res.position
      }
    } catch {}
    const p2 = camera.pickEllipsoid(pos, Cesium.Ellipsoid.MOON)
    if (Cesium.defined(p2)) return p2
    return null
  }

  // Z 매핑 — 미니맵 우선, 그 다음 3D (겹침 방지)
  async function zMap() {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const { scene } = viewer
    const { x: cx, y: cy } = lastClientPosRef.current

    // ★ 최상단 요소가 미니맵인지 먼저 확인
    const topEl = document.elementFromPoint(cx, cy)
    const mini = minimapCanvasRef.current
    const overMiniTop = mini && (topEl === mini || mini.contains(topEl))

    if (overMiniTop) {
      const rect = mini.getBoundingClientRect()
      const insideMini = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom
      if (insideMini) {
        // CSS px 기준 크기로 변환 (DPR 무관)
        const [lon, lat] = xyToLonLat(cx - rect.left, cy - rect.top, rect.width, rect.height)
        setSavedPoints(ps => [...ps, { id: genId(), lon, lat }])
        setToast(`Z: mapped (minimap) → lon ${lon.toFixed(4)}°, lat ${lat.toFixed(4)}°`)
        setTimeout(() => setToast(null), 1200)
        scene.requestRender?.()
        return
      }
    }

    // 3D 캔버스 처리
    const canvasRect = scene.canvas.getBoundingClientRect()
    const inside3D = cx >= canvasRect.left && cx <= canvasRect.right &&
                     cy >= canvasRect.top  && cy <= canvasRect.bottom
    if (inside3D) {
      const dpr = scene.canvas.width / canvasRect.width
      const dbPos = new Cesium.Cartesian2((cx - canvasRect.left) * dpr, (cy - canvasRect.top) * dpr)
      const cart = await pickAtCanvasPos(dbPos)
      if (!cart) { setToast('Z: pick failed'); setTimeout(() => setToast(null), 1200); return }
      const cc = Cesium.Cartographic.fromCartesian(cart, Cesium.Ellipsoid.MOON)
      const lon = toDeg(cc.longitude), lat = toDeg(cc.latitude)
      setSavedPoints(ps => [...ps, { id: genId(), lon, lat }])
      setToast(`Z: mapped (3D) → lon ${lon.toFixed(4)}°, lat ${lat.toFixed(4)}°`)
      setTimeout(() => setToast(null), 1200)
      scene.requestRender?.()
      return
    }

    setToast('Z: 캔버스/미니맵 위에서 누르세요')
    setTimeout(() => setToast(null), 1200)
  }

  // FPS 이동(기존)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const { scene, camera } = viewer

    const bump = (dir) => setSpeedMul(v => Number((dir > 0 ? Math.min(v * 1.6, 5000) : Math.max(v / 1.6, 0.02)).toFixed(3)))
    const onDown = (e) => {
      keysRef.current[e.code] = true
      if (['BracketRight', 'Equal', 'NumpadAdd'].includes(e.code)) { e.preventDefault(); bump(+1) }
      if (['BracketLeft', 'Minus', 'NumpadSubtract'].includes(e.code)) { e.preventDefault(); bump(-1) }
      if (isFPS && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault()
      scene.requestRender?.()
    }
    const onUp = (e) => { keysRef.current[e.code] = false; scene.requestRender?.() }

    let lastTime
    const preRender = (_scn, time) => {
      let dt = 0; if (lastTime) dt = Cesium.JulianDate.secondsDifference(time, lastTime); lastTime = time
      if (dt <= 0) return
      const k = keysRef.current
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

      // 표면 침투 방지
      const ellipsoid = Cesium.Ellipsoid.MOON
      const carto = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
      const MIN_ALT = 50.0
      if (Number.isFinite(carto.height) && carto.height < MIN_ALT) {
        const clamped = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, MIN_ALT, ellipsoid)
        Cesium.Cartesian3.clone(clamped, camera.position)
      }
    }

    if (isFPS) {
      scene.requestRenderMode = false
      window.addEventListener('keydown', onDown, { passive: false })
      window.addEventListener('keyup', onUp)
      scene.preRender.addEventListener(preRender)
    }
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      scene.preRender.removeEventListener(preRender)
      keysRef.current = Object.create(null)
    }
  }, [isFPS])

  // 속도표시
  const viewer = viewerRef.current?.cesiumElement
  const approxSpeed = (() => {
    if (!viewer) return 0
    const h = viewer.camera.positionCartographic?.height ?? 1
    let base = Math.min(Math.max(h * 0.02, 200), 1_500_000)
    return base * speedMul
  })()

  // 미니맵 클릭 → 이동 + 화살표
  const goToWithArrow = (lon, lat) => {
    const v = viewerRef.current?.cesiumElement; if (!v) return
    const { camera, scene } = v

    const curH = camera.positionCartographic?.height ?? 5000
    camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, curH),
      orientation: { pitch: camera.pitch, heading: camera.heading, roll: camera.roll },
      duration: 0.6,
    })

    const dLat = ARROW_MINIMAP_FRACTION * 180.0
    const dLon = dLat / Math.max(0.2, Math.cos(Cesium.Math.toRadians(lat)))
    const start = Cesium.Cartesian3.fromDegrees(lon + dLon * COS30, lat + dLat * SIN30, 60)
    const end   = Cesium.Cartesian3.fromDegrees(lon, lat, 60)

    const arrowEntity = v.entities.add({
      id: genId(),
      polyline: {
        positions: [start, end],
        width: ARROW_WIDTH_PX,
        material: new Cesium.PolylineArrowMaterialProperty(
          Cesium.Color.fromCssColorString('#fff300').withAlpha(0.95)
        ),
        clampToGround: false
      }
    })
    setTimeout(() => { try { v.entities.remove(arrowEntity) } catch {} ; scene.requestRender?.() }, 5000)
    scene.requestRender?.()
  }

  return (
    <div ref={containerRef} tabIndex={0} onClick={() => containerRef.current?.focus()}
      style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden', background: 'black' }}>
      {/* HUD */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center',
        fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' }}>
        <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)',
          color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
          Mode: {isFPS ? 'FPS (W/A/S/D, Shift, Space, Ctrl)' : 'Original (Mouse)'}
        </span>
        <button onClick={() => setIsFPS(v => !v)}
          style={{ padding: '6px 10px', borderRadius: 8, background: isFPS ? '#2d6cdf' : '#444', color: '#fff', border: 'none', cursor: 'pointer' }}
          title="F 키로도 전환 가능">
          {isFPS ? 'Switch to Original (F)' : 'Switch to FPS (F)'}
        </button>
        <span style={{ color: '#bbb', fontSize: 12, marginLeft: 6 }}>
          • Z: 포인터 위치 매핑(미니맵 우선) • X: 전체 매핑 삭제 • 미니맵 클릭: 이동 + 화살표
        </span>
        {isFPS && (
          <span style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            Speed: {approxSpeed >= 1_000 ? (approxSpeed/1000).toFixed(1) + ' km/s' : Math.round(approxSpeed) + ' m/s'} ×{speedMul}
            {' '}<small>([-] / [+])</small>
          </span>
        )}
      </div>

      {/* 3D 커서 위/경도 HUD */}
      {cursorLL3D && (
        <div style={{
          position: 'absolute', top: 48, left: 12, zIndex: 11,
          padding: '6px 10px', borderRadius: 10,
          background: 'rgba(0,0,0,0.55)', color: '#dfe8ff', fontSize: 12,
          border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)'
        }}>
          Cursor 3D — lon: {cursorLL3D.lon.toFixed(4)}°, lat: {cursorLL3D.lat.toFixed(4)}°
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: 'absolute', top: 84, left: 12, zIndex: 11,
          padding: '6px 10px', borderRadius: 10,
          background: 'rgba(20,20,20,0.8)', color: '#ffe680', fontSize: 12,
          border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)'
        }}>{toast}</div>
      )}

      {/* 미니맵 */}
      <MiniMap
        width={MINIMAP_W}
        height={MINIMAP_H}
        currentLL={currentLL}
        points={savedPoints}
        footprint={footprint}
        onPickLonLat={(lon, lat) => goToWithArrow(lon, lat)}
        onCanvasRef={(el) => { minimapCanvasRef.current = el }}
      />

      <Viewer
        ref={viewerRef}
        full
        style={{ width: '100%', height: '100%' }}
        baseLayerPicker={false}
        timeline={false}
        animation={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        skyBox={false}
        skyAtmosphere={false}
        imageryProvider={undefined}
        terrainProvider={new Cesium.EllipsoidTerrainProvider()}
        requestRenderMode={false}
        shouldAnimate
      >
        {/* 달 3D Tiles */}
        <Cesium3DTileset ref={tilesetRef} url={Cesium.IonResource.fromAssetId(MOON_ASSET_ID)} />

        {/* 저장 포인트 */}
        {savedPoints.map((p) => (
          <Entity
            key={p.id}
            position={Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 6)}
            point={{
              pixelSize: 8,
              color: Cesium.Color.CYAN,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
            }}
            label={{
              text: `lon ${p.lon.toFixed(4)}°, lat ${p.lat.toFixed(4)}°`,
              font: '14px sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              showBackground: true,
              backgroundColor: new Cesium.Color(0, 0, 0, 0.55),
              pixelOffset: new Cesium.Cartesian2(0, -16),
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }}
            description={`[POINT] Lon ${p.lon.toFixed(6)}, Lat ${p.lat.toFixed(6)}`}
          />
        ))}
      </Viewer>
    </div>
  )
}
