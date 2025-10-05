// src/frontend/App.jsx
import { useEffect, useRef, useState, useMemo } from 'react'
import { Viewer, Cesium3DTileset, Entity, GeoJsonDataSource } from 'resium'
import * as Cesium from 'cesium'
import Papa from 'papaparse'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import AnnotationSidebar from './AnnotationSidebar'
import ImageComparison from './ImageComparison'
import SplitViewMoon from './SplitViewMoon'
import './AnnotationSidebar.css'

// === Apollo 11 정적 로봇 상수 ===
const A11_ROBOT_URI = '/model.glb'
const A11_ROBOT_SCALE = 80
const A11_LON = 23.46991
const A11_LAT = 0.66413
const A11_ROBOT_HOVER_M = 12   // 지면에서 살짝 띄우기
const A11_ROBOT_HEADING_DEG = 45

const A17_MODEL_URI = '/oberth_class.glb';
const A17_SCALE = 3500;
const A17_LON = 30.462;
const A17_LAT = 20.029;
const A17_ALT_M = 6300;
const A17_HEADING_DEG = 2;

// 📌 Apollo 17 고정 모델용 상수
const A17_ROBOT_SCALE = 80               // 외형 스케일 (필요시 조정)
const A17_ROBOT_LON = 30.462 + 0.006     // A17 근처에 살짝 오프셋
const A17_ROBOT_LAT = 20.029  + 0.004
const A17_ROBOT_HOVER_M = 12             // 지면 위로 띄우는 높이
const A17_ROBOT_HEADING_DEG = 45         // 기본 바라보는 각도

// =========================
// HUD 파라미터
// =========================
const HUD_PARAMS = {
  BOOSTER_DURATION_SEC: 2,
  BOOSTER_COOLDOWN_SEC: 5,
  STOPWATCH_TICK_MS: 50,
}

// Cesium Ion
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlZjExM2NkMy00NGI2LTQ1ODgtODM5Yy02YzQ4ZTY1ZmFjOGMiLCJpZCI6MzQ3MjIyLCJpYXQiOjE3NTk1OTk3NzJ9.qQ965rBzn7tFkZxOl7mtERxeMifDEoAEAFcWa-ysrAQ'
  const MOON_ASSET_ID = 2684829

// ✅ 3D/미니맵 모두에서 사용할 라우트 파일
const ROUTE_GEOJSON_URL = '/data/sldem_astar_path_optimized.geojson'

// 🌕 달 좌표계
Cesium.Ellipsoid.WGS84 = Cesium.Ellipsoid.MOON
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON

// ─────────────────────────────────────────────────────────────
// 유틸/상수
// ─────────────────────────────────────────────────────────────
const MINIMAP_W = 320
const MINIMAP_H = 160
const ARROW_MINIMAP_FRACTION = 0.01
const ARROW_WIDTH_PX = 8
const COS30 = 0.866025403784
const SIN30 = 0.5

const genId = () =>
  `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
const toDeg = (rad) => Cesium.Math.toDegrees(rad)
const lonLatToXY = (lon, lat, w, h) => [
  ((lon + 180) / 360) * w,
  ((90 - lat) / 180) * h,
]
const xyToLonLat = (x, y, w, h) => [
  (x / w) * 360 - 180,
  90 - (y / h) * 180,
]

// 카메라 방위각(북=0°, 동=90°) — Matrix4만 사용
function getCameraAzimuthDeg(camera, ellipsoid) {
  const pos = camera.position
  const surf = ellipsoid.scaleToGeodeticSurface(pos, new Cesium.Cartesian3())
  if (!surf) return 0
  const enu4  = Cesium.Transforms.eastNorthUpToFixedFrame(surf, ellipsoid)
  const east  = Cesium.Matrix4.getColumn(enu4, 0, new Cesium.Cartesian3())
  const north = Cesium.Matrix4.getColumn(enu4, 1, new Cesium.Cartesian3())
  const up    = Cesium.Matrix4.getColumn(enu4, 2, new Cesium.Cartesian3())

  const f   = Cesium.Cartesian3.clone(camera.direction, new Cesium.Cartesian3())
  const fUp = Cesium.Cartesian3.multiplyByScalar(up, Cesium.Cartesian3.dot(f, up), new Cesium.Cartesian3())
  const fTan = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(f, fUp, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  )

  const eComp = Cesium.Cartesian3.dot(fTan, east)
  const nComp = Cesium.Cartesian3.dot(fTan, north)
  let az = Math.atan2(eComp, nComp) // 북 기준 시계+
  if (az < 0) az += Math.PI * 2
  return Cesium.Math.toDegrees(az)
}

// ==== 공용 지상 샘플러 (FPS/로봇 공통, 동기식) ====
const groundCacheRef = { lastPos: null }
function sampleGroundFPSSync(scene, worldPos) {
  const ell = Cesium.Ellipsoid.MOON
  const carto = Cesium.Cartographic.fromCartesian(worldPos, ell)
  if (!carto) return { agl: undefined, groundPos: groundCacheRef.lastPos }

  const h = scene.sampleHeight?.(carto, undefined, 3.0)
  if (h !== undefined) {
    const g = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, h, ell)
    groundCacheRef.lastPos = g
    return { agl: Cesium.Cartesian3.distance(worldPos, g), groundPos: g }
  }

  const surf = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0, ell)
  const u = Cesium.Cartesian3.normalize(surf, new Cesium.Cartesian3()) // 중심→바깥
  const origin = Cesium.Cartesian3.multiplyByScalar(
    u,
    ell.maximumRadius + 200_000,
    new Cesium.Cartesian3()
  )
  const dir = Cesium.Cartesian3.multiplyByScalar(u, -1, new Cesium.Cartesian3())

  let hit
  try { hit = scene.pickFromRay?.(new Cesium.Ray(origin, dir)) } catch {}
  if (hit?.position) {
    groundCacheRef.lastPos = hit.position
    return { agl: Cesium.Cartesian3.distance(worldPos, hit.position), groundPos: hit.position }
  }

  if (groundCacheRef.lastPos) {
    return { agl: Cesium.Cartesian3.distance(worldPos, groundCacheRef.lastPos), groundPos: groundCacheRef.lastPos }
  }
  const onSurf = ell.scaleToGeodeticSurface(worldPos, new Cesium.Cartesian3())
  if (onSurf) {
    groundCacheRef.lastPos = onSurf
    return { agl: Cesium.Cartesian3.distance(worldPos, onSurf), groundPos: onSurf }
  }
  return { agl: undefined, groundPos: null }
}

// 부드럽게: a→b 선형보간
function lerpVec3(a, b, alpha) {
  return Cesium.Cartesian3.lerp(a, b, alpha, new Cesium.Cartesian3())
}

// ─────────────────────────────────────────────────────────────
// 미니맵 (경로 + 유저위치 화살표 포함)
// ─────────────────────────────────────────────────────────────
function MiniMap({
  width = MINIMAP_W,
  height = MINIMAP_H,
  backgroundSrc = '/moon.png',
  currentLL,
  points = [],
  footprint = [],
  onPickLonLat,
  onCanvasRef,
  userPose, // {lon, lat, headingDeg}
  routes = [], // ✅ 경로들: [ [{lon,lat},...], ... ]
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

    // ✅ GeoJSON 경로(빨간색)
    if (routes?.length) {
      ctx.save()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255,50,50,0.95)'
      ctx.shadowColor = 'rgba(255,50,50,0.55)'
      ctx.shadowBlur = 6
      for (const path of routes) {
        if (!path || path.length < 2) continue
        ctx.beginPath()
        path.forEach((p, i) => {
          const [x, y] = lonLatToXY(p.lon, p.lat, W, H)
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.stroke()
      }
      ctx.restore()
    }

    // 저장 포인트
    for (const p of points) {
      const [x, y] = lonLatToXY(p.lon, p.lat, W, H)
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,255,255,1)'; ctx.fill()
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke()
    }

    // 카메라 중심 십자선
    if (currentLL) {
      const [x, y] = lonLatToXY(currentLL.lon, currentLL.lat, W, H)
      ctx.strokeStyle = 'rgba(160,220,255,0.95)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke()
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke()
    }

    // ✅ FPS 유저 위치 표기(화살표)
    if (userPose) {
      const [ux, uy] = lonLatToXY(userPose.lon, userPose.lat, W, H)
      const rad = (userPose.headingDeg ?? 0) * Math.PI / 180
      ctx.save()
      ctx.translate(ux, uy)
      ctx.rotate(rad) // 북(위) 기준 시계방향

      const w = 18, h = 24
      ctx.beginPath()
      ctx.moveTo(0, -h * 0.55)
      ctx.lineTo(w * 0.45,  h * 0.45)
      ctx.lineTo(0,  h * 0.10)
      ctx.lineTo(-w * 0.45, h * 0.45)
      ctx.closePath()
      ctx.lineJoin = 'round'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      ctx.restore()
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(0.5, 0.5, W - 1, H - 1)
  }

  useEffect(draw, [width, height, currentLL, points, footprint, userPose, routes])

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

// ── Robot-only: 안전 AGL 샘플러(타원체 기본 + 3D Tiles 보강)
function sampleGroundSafeForRobot(scene, worldPos) {
  const ell = Cesium.Ellipsoid.MOON
  const onSurf = ell.scaleToGeodeticSurface(worldPos, new Cesium.Cartesian3())
  if (!onSurf) return { agl: undefined, groundPos: null }
  let groundPos = onSurf

  try {
    const u = Cesium.Cartesian3.normalize(onSurf, new Cesium.Cartesian3())
    const origin = Cesium.Cartesian3.multiplyByScalar(u, ell.maximumRadius + 200000.0, new Cesium.Cartesian3())
    const dir = Cesium.Cartesian3.multiplyByScalar(u, -1, new Cesium.Cartesian3())
    const hit = scene.pickFromRay?.(new Cesium.Ray(origin, dir))
    if (hit?.position) {
      const distHit = Cesium.Cartesian3.distance(worldPos, hit.position)
      const distEll = Cesium.Cartesian3.distance(worldPos, groundPos)
      if (distHit < distEll) groundPos = hit.position
    }
  } catch {}

  return { agl: Cesium.Cartesian3.distance(worldPos, groundPos), groundPos }
}

// ─────────────────────────────────────────────────────────────
// 로봇 GLB 로더(잔상 X: 1회 생성, 행렬만 갱신)
// ─────────────────────────────────────────────────────────────
function RobotGltfPrimitive({
  viewerRef,
  position,
  hprDeg = { heading: 0, pitch: 0, roll: 0 },
  url,
  scale = 400,
  minPx = 128,
  maxScale = 2000,
  runAnimations = true,
}) {
  const modelRef = useRef(null)
  const sceneRef = useRef(null)

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer || !url) return
    sceneRef.current = viewer.scene

    ;(async () => {
      try {
        const model = await Cesium.Model.fromGltfAsync({
          url,
          modelMatrix: Cesium.Matrix4.IDENTITY,
          scale,
          minimumPixelSize: minPx,
          maximumScale: maxScale,
          runAnimations,
          allowPicking: true,
          debugShowBoundingVolume: false,
          color: Cesium.Color.WHITE,
          colorBlendMode: Cesium.ColorBlendMode.HIGHLIGHT,
        })
        viewer.scene.primitives.add(model)
        modelRef.current = model
        viewer.scene.requestRender?.()
      } catch (e) {
        console.error('Model load error:', e)
      }
    })()

    return () => {
      try {
        if (modelRef.current && !modelRef.current.isDestroyed?.()) {
          sceneRef.current?.primitives?.remove(modelRef.current)
          modelRef.current.destroy?.()
        }
      } catch {}
      modelRef.current = null
      viewer?.scene?.requestRender?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRef, url])

  useEffect(() => {
    const model = modelRef.current
    if (!model || !position) return
    const hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(hprDeg.heading || 0),
      Cesium.Math.toRadians(hprDeg.pitch || 0),
      Cesium.Math.toRadians(hprDeg.roll || 0)
    )
    model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
      position, hpr, Cesium.Ellipsoid.MOON
    )
    sceneRef.current?.requestRender?.()
  }, [position, hprDeg.heading, hprDeg.pitch, hprDeg.roll])

  return null
}

// ─────────────────────────────────────────────────────────────
// 하이라이트 링 Billboard
// ─────────────────────────────────────────────────────────────
function makeRingSprite(size = 160, strokePx = 8, alpha = 0.9) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const r = (size - strokePx) / 2
  ctx.clearRect(0, 0, size, size)
  ctx.beginPath()
  ctx.arc(size/2, size/2, r, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(255, 212, 0, ${alpha})`
  ctx.lineWidth = strokePx
  ctx.shadowColor = 'rgba(255,212,0,0.6)'
  ctx.shadowBlur = strokePx * 1.2
  ctx.stroke()
  return c.toDataURL()
}

// ─────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────
export default function MoonCesium() {
  const viewerRef = useRef(null)
  const tilesetRef = useRef(null)
  const containerRef = useRef(null)
  const attemptingLockRef = useRef(false)
  useEffect(() => {
  const onChange = () => {
      const canvas = viewerRef.current?.cesiumElement?.scene?.canvas
      const lockedEl =
        document.pointerLockElement ||
        document.mozPointerLockElement ||
        document.webkitPointerLockElement
      const locked = !!canvas && lockedEl === canvas
      setIsFPS(!!locked)                 // 🔑 진입/이탈 상태를 여기서만 갱신
      attemptingLockRef.current = false  // 시도 플래그 해제
    }

    const onError = (e) => {
      console.warn('Pointer lock error:', e)
      setIsFPS(false)
    }

    document.addEventListener('pointerlockchange', onChange)
    document.addEventListener('pointerlockerror', onError)
    // 필요시 구 브라우저 대응
    document.addEventListener('mozpointerlockchange', onChange)
    document.addEventListener('webkitpointerlockchange', onChange)

    return () => {
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('pointerlockerror', onError)
      document.removeEventListener('mozpointerlockchange', onChange)
      document.removeEventListener('webkitpointerlockchange', onChange)
    }
  }, [])  // 전역 리스너 한 번만 등록

  const [isFPS, setIsFPS] = useState(false)
  const [annotations, setAnnotations] = useState([])
  const [selectedAnnotation, setSelectedAnnotation] = useState(null)
  const [speedMul, setSpeedMul] = useState(1)

  const [a11RobotPosition, setA11RobotPosition] = useState(null)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    const tileset = tilesetRef.current?.cesiumElement
    if (!viewer || !tileset) return
    let alive = true

    ;(async () => {
      try { await tileset.readyPromise } catch {}
      if (!alive) return
      const { scene } = viewer

      // A11 근처 지면 샘플링 → 법선 방향으로 띄우기
      const seed = Cesium.Cartesian3.fromDegrees(A11_LON, A11_LAT, 100)
      const { groundPos } = sampleGroundSafeForRobot(scene, seed)
      if (!groundPos) return

      const n = Cesium.Ellipsoid.MOON.geodeticSurfaceNormal(groundPos, new Cesium.Cartesian3())
      const pos = Cesium.Cartesian3.add(
        groundPos,
        Cesium.Cartesian3.multiplyByScalar(n, A11_ROBOT_HOVER_M, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      )
      setA11RobotPosition(pos)
      scene.requestRender?.()
    })()

    return () => { alive = false }
  }, [])

  // A17 로봇 위치
  const [a17RobotPosition, setA17RobotPosition] = useState(null)

  // A17 로봇: 시작 시 A17 부근 지면 위 A17_ROBOT_HOVER_M 만큼 띄워 놓기
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    const tileset = tilesetRef.current?.cesiumElement
    if (!viewer || !tileset) return
    let alive = true

    ;(async () => {
      try { await tileset.readyPromise } catch {}
      if (!alive) return
      const { scene } = viewer

      const seed = Cesium.Cartesian3.fromDegrees(A17_ROBOT_LON, A17_ROBOT_LAT, 100)
      const { groundPos } = sampleGroundSafeForRobot(scene, seed)
      if (!groundPos) return

      // 법선 방향으로 살짝 띄우기
      const u = Cesium.Ellipsoid.MOON.geodeticSurfaceNormal(groundPos, new Cesium.Cartesian3())
      const start = Cesium.Cartesian3.add(
        groundPos,
        Cesium.Cartesian3.multiplyByScalar(u, A17_ROBOT_HOVER_M, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      )
      setA17RobotPosition(start)

      // 보기 편하게 한 번 프레이밍(원하면 제거)
      viewer.scene.requestRender?.()
    })()

    return () => { alive = false }
  }, [])

  const [isImageryLoading, setIsImageryLoading] = useState(false)
  const [imageryLoaded, setImageryLoaded] = useState(false)
  const speedMulRef = useRef(1)
  useEffect(() => { speedMulRef.current = speedMul }, [speedMul])

  const [isSplitView, setIsSplitView] = useState(false)
  const [sliderPosition, setSliderPosition] = useState(0.5) // 0~1
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isSplitView) return

    const handleMouseMove = (e) => {
      if (!isDragging) return
      const containerWidth = containerRef.current?.offsetWidth || window.innerWidth
      const newPosition = (e.clientX / containerWidth) * 100
      setSliderPosition(Math.max(10, Math.min(90, newPosition)))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isSplitView])

  const a17Position = useMemo(
    () => Cesium.Cartesian3.fromDegrees(A17_LON, A17_LAT, A17_ALT_M, Cesium.Ellipsoid.MOON),
    []
  )

  const a17Orientation = useMemo(() => {
    const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(A17_HEADING_DEG), 0, 0)
    return Cesium.Transforms.headingPitchRollQuaternion(a17Position, hpr, Cesium.Ellipsoid.MOON)
  }, [a17Position])

  const keysRef = useRef(Object.create(null))
  const preRenderCbRef = useRef(null)
  const imageryLayerRef = useRef()

  const hoverRef = useRef({ enabled: true, target: 1500, min: -500, max: 6000, k: 15.0, d: 3, v: 0, isJumping: false })
  const scratch = useRef({
    normal: new Cesium.Cartesian3(),
    down:   new Cesium.Cartesian3(),
    offs:   new Cesium.Cartesian3(),
  }).current

  const [stopwatchUI, setStopwatchUI] = useState({ elapsedMs: 0, running: false })
  const stopwatchRef = useRef({ running: false, baseElapsedMs: 0, startSec: null })
  const nowSecRef = useRef(null)

  const formatTime = (ms) => {
    const totalMs = Math.max(0, Math.floor(ms))
    const minutes = Math.floor(totalMs / 60000)
    const seconds = Math.floor((totalMs % 60000) / 1000)
    const centi = Math.floor((totalMs % 1000) / 10)
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centi).padStart(2, '0')}`
  }

  useEffect(() => {
    const now = Date.now() / 1000
    if (isFPS) {
      stopwatchRef.current.running = true
      stopwatchRef.current.startSec = now
      setStopwatchUI(u => ({ ...u, running: true }))
    } else {
      if (stopwatchRef.current.running) {
        const elapsed = stopwatchRef.current.baseElapsedMs + (now - (stopwatchRef.current.startSec ?? now)) * 1000
        stopwatchRef.current.baseElapsedMs = elapsed
        stopwatchRef.current.running = false
        stopwatchRef.current.startSec = null
        setStopwatchUI({ running: false, elapsedMs: elapsed })
      }
    }
  }, [isFPS])

  const handleStopwatchReset = () => {
    const now = (nowSecRef.current ?? Date.now() / 1000)
    stopwatchRef.current.baseElapsedMs = 0
    stopwatchRef.current.startSec = now
    stopwatchRef.current.running = isFPS
    setStopwatchUI({ running: !!isFPS, elapsedMs: 0 })
  }

  // ===========================
  // [Add Annotation] Annotation Add Feature - States
  // ===========================
  const [isAddingMode, setIsAddingMode] = useState(false);          // 추가 모드 on/off
  const [editingAnnotation, setEditingAnnotation] = useState(null);  // {id, name, description, lon, lat}
  const [isImageComparisonOpen, setIsImageComparisonOpen] = useState(false)
  const [userAnnotations, setUserAnnotations] = useState(() => {
    try {
      const raw = localStorage.getItem('userAnnotations');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // ===========================
  // [Add Annotation] userAnnotations 변경 시 자동 저장 (기존 annotations와 분리)
  // ===========================
  useEffect(() => {
    try {
      localStorage.setItem('userAnnotations', JSON.stringify(userAnnotations));
    } catch {}
  }, [userAnnotations]);

  useEffect(() => {
    if (isFPS) return
    const id = setInterval(() => {
      if (stopwatchRef.current.running) {
        const now = Date.now() / 1000
        const elapsed = stopwatchRef.current.baseElapsedMs + (now - (stopwatchRef.current.startSec ?? now)) * 1000
        setStopwatchUI({ running: true, elapsedMs: elapsed })
      }
    }, HUD_PARAMS.STOPWATCH_TICK_MS)
    return () => clearInterval(id)
  }, [isFPS])

  const [boosterUI, setBoosterUI] = useState({ status: 'ready', progress: 1, remainingSec: 0 })
  const boosterRef = useRef({ active: false, activateUntil: 0, cooldownUntil: 0 })
  const boosterTriggerRef = useRef(false)

  const fmtSpeed = (mps) => (mps >= 1_000_000 ? `${(mps/1_000_000).toFixed(2)} Mm/s` : mps >= 1_000 ? `${(mps/1_000).toFixed(1)} km/s` : `${Math.round(mps)} m/s`)

  // ───────── 주석 데이터
  useEffect(() => {
    async function fetchData() {
      const apolloData = [
        { name: 'Apollo 11', lat: 0.66413, lon: 23.46991, category: 'apolloSite', description: 'Mankind\'s first steps on the Moon.' },
        { name: 'Apollo 17', lat: 20.029, lon: 30.462, category: 'apolloSite', description: 'Final mission of the Apollo program.' },
      ]
      try {
        const res = await fetch('/data/annotations.csv')
        let csvData = []
        if (res.ok) {
          const txt = await res.text()
          const parsed = Papa.parse(txt, { header: true, dynamicTyping: true, skipEmptyLines: true })
          csvData = parsed.data.map(item => ({ ...item, category: 'geography' }))
        }
        const combined = [...apolloData, ...csvData].map(item => ({
          ...item,
          position: item.lat != null && item.lon != null ? Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 100) : null
        })).filter(item => item.position)
        setAnnotations(combined)
      } catch (e) {
        console.error(e)
        setAnnotations([{ name: 'Apollo 11', lat: 0.66413, lon: 23.46991, category: 'apolloSite', position: Cesium.Cartesian3.fromDegrees(23.46991, 0.66413, 100) }])
      }
    }
    fetchData()
  }, [])

  const toggleFPS = () => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const canvas = viewer.scene?.canvas
    if (!canvas) return

    // 현재 잠금 중이면 해제
    const lockedEl = document.pointerLockElement
      || document.mozPointerLockElement
      || document.webkitPointerLockElement
    if (lockedEl === canvas) {
      document.exitPointerLock?.()
      return
    }

    // 잠금 시도만 하고, isFPS는 pointerlockchange에서 갱신
    attemptingLockRef.current = true
    try { document.activeElement?.blur?.() } catch {}
    canvas.focus?.()
    requestAnimationFrame(() => canvas.requestPointerLock?.())
  }

  const handleAnnotationClick = (annotation) => {
    setSelectedAnnotation(annotation)
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const bs = new Cesium.BoundingSphere(annotation.position, 20000)
    viewer.camera.flyToBoundingSphere(bs, { duration: 2.0 })
  }
  const handleCloseModal = () => setSelectedAnnotation(null)

  const handleLoadImagery = async () => {
  if (isImageryLoading || imageryLoaded) return;
  const viewer = viewerRef.current?.cesiumElement;
  const moonTileset = tilesetRef.current?.cesiumElement;
  if (!viewer || !moonTileset) {
    console.warn('viewer or tileset not ready');
    return;
  }

  setIsImageryLoading(true);
  try {
    // 이미 추가되어 있으면 재사용
    if (imageryLayerRef.current) {
      setImageryLoaded(true);
      return;
    }

    // 1) Ion Imagery Provider 생성 (반드시 await)
    const prov1 = Cesium.IonImageryProvider.fromAssetId(3851319); // LRO WAC 등
    const prov2 = Cesium.IonImageryProvider.fromAssetId(3851307); // Shades/Label 등

    const layer1 = await Cesium.ImageryLayer.fromProviderAsync(prov1);
    const layer2 = await Cesium.ImageryLayer.fromProviderAsync(prov2);

    // 2A) 우선, 화면의 "글로브" 레이어 스택에 붙이는 방식 (가장 안전)
    viewer.imageryLayers.add(layer1);
    viewer.imageryLayers.add(layer2);

    // 2B) 또는 현재 달 3D Tiles에 직접 래스터 오버레이 붙이기 (해당 타일셋이 지원할 때)
    // 일부 달 메쉬 에셋은 tileset.imageryLayers가 동작합니다.
    // moonTileset.imageryLayers.add(layer1);
    // moonTileset.imageryLayers.add(layer2);

    imageryLayerRef.current = [layer1, layer2];
    setImageryLoaded(true);

    
  } catch (error) {
    console.error('failed to load imagery', error);
  } finally {
    setIsImageryLoading(false);
  }
};

  useEffect(() => { containerRef.current?.focus() }, [])

  // ===========================
  // [Add Annotation] Add-mode toggles
  // ===========================
  const startAddingAnnotation = () => {
    setIsAddingMode(true);
    setEditingAnnotation(null);
    // FPS는 꺼서 정확한 픽킹 보장 (기존 로직 영향 없음)
    setIsFPS(false);
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer?.scene?.canvas) viewer.scene.canvas.style.cursor = 'crosshair';
  };

  const cancelAddingAnnotation = () => {
    setIsAddingMode(false);
    setEditingAnnotation(null);
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer?.scene?.canvas) viewer.scene.canvas.style.cursor = 'default';
  };

  // ===========================
  // [Add annotation] Save/Delete handlers (userAnnotations 전용)
  // ===========================
  const saveEditingAnnotation = (payload) => {
    if (!payload || typeof payload.lon !== 'number' || typeof payload.lat !== 'number') return;
    const finalAnno = {
      id: `user-${Date.now()}`,
      name: (payload.name || 'Untitled').trim(),
      description: payload.description || '',
      lon: payload.lon,
      lat: payload.lat,
      category: 'userDefined',
    };
    setUserAnnotations(prev => [...prev, finalAnno]);
    setEditingAnnotation(null);
  };

  const deleteUserAnnotation = (id) => {
    setUserAnnotations(prev => prev.filter(a => a.id !== id));
  };

  // Z/X/F 단축키
  useEffect(() => {
    const onToggle = (e) => {
      if (e.code === 'KeyF') toggleFPS()
      if (e.code === 'KeyZ') zMap()
      if (e.code === 'KeyX') {
        setSavedPoints([])
        setToast('Cleared all mappings (X)')
        setTimeout(() => setToast(null), 1000)
      }
    }
    window.addEventListener('keydown', onToggle)
    return () => window.removeEventListener('keydown', onToggle)
  }, [])

  // 초기 세팅 + 클릭 저장
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
        const pickedObject = scene.pick(e.position)
        if (!Cesium.defined(pickedObject)) {
          const picked = scene.pickPosition(e.position)
          if (Cesium.defined(picked)) {
            const carto = Cesium.Cartographic.fromCartesian(picked)
            const lat = Cesium.Math.toDegrees(carto.latitude)
            const lon = Cesium.Math.toDegrees(carto.longitude)
            setSavedPoints(ps => [...ps, { id: genId(), lon, lat }])
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    })()

    return () => { destroyed = true; handler.destroy() }
  }, [])

  // =======================================================
  // [Add Annotation] 추가 모드일 때만 동작하는 임시 클릭-픽킹 핸들러
  // =======================================================
  useEffect(() => {
    if (!isAddingMode) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const { scene } = viewer;

    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event) => {
      const picked = scene.pickPosition(event.position);
      if (Cesium.defined(picked)) {
        const carto = Cesium.Cartographic.fromCartesian(picked, Cesium.Ellipsoid.MOON);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        setEditingAnnotation({
          id: `new-${Date.now()}`,
          name: '새 지점',
          description: '',
          lon, lat,
        });
        // 한 번 찍으면 모드 종료 (폼 위에서 저장/취소)
        setIsAddingMode(false);
        if (scene?.canvas) scene.canvas.style.cursor = 'default';
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      if (scene?.canvas) scene.canvas.style.cursor = 'default';
    };
  }, [isAddingMode]);


  // ── 미니맵용: 현재 카메라 위치/heading을 즉시 계산(초진입 문제 해결)
  function computePoseNow(viewer) {
    if (!viewer) return null
    const { scene, camera } = viewer
    const w = scene.canvas.width, h = scene.canvas.height
    const center = new Cesium.Cartesian2(w / 2, h / 2)

    let lonLat = null
    if (scene.pickPositionSupported) {
      const p = scene.pickPosition(center)
      if (Cesium.defined(p)) {
        const cc = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MOON)
        lonLat = { lon: Cesium.Math.toDegrees(cc.longitude), lat: Cesium.Math.toDegrees(cc.latitude) }
      }
    }
    if (!lonLat) {
      const cc = Cesium.Cartographic.fromCartesian(camera.position, Cesium.Ellipsoid.MOON)
      if (cc) lonLat = { lon: Cesium.Math.toDegrees(cc.longitude), lat: Cesium.Math.toDegrees(cc.latitude) }
    }
    if (!lonLat) return null

    // ✅ 모드와 무관하게 heading 계산
    const headingDeg = getCameraAzimuthDeg(camera, Cesium.Ellipsoid.MOON)
    return { ...lonLat, headingDeg }
  }

  // FPS 이동/물리
  const [currentLL, setCurrentLL] = useState(null)
  const [userPose, setUserPose] = useState(null) // {lon, lat, headingDeg}
  const [savedPoints, setSavedPoints] = useState([])   // [{id, lon, lat}]
  const [footprint, setFootprint] = useState([])
  const [cursorLL3D, setCursorLL3D] = useState(null)
  const [toast, setToast] = useState(null)
  const lastCanvasPosRef = useRef(new Cesium.Cartesian2(0, 0))
  const lastClientPosRef = useRef({ x: 0, y: 0 })
  const minimapCanvasRef = useRef(null)

  // ✅ 미니맵 라인용 GeoJSON 파싱 결과
  const [routePaths, setRoutePaths] = useState([])

  // ✅ GeoJSON 파싱 & 로딩 (미니맵)
  useEffect(() => {
    let alive = true
    const toLL = (coords) => coords.map(([lon, lat]) => ({ lon, lat }))

    const pushGeom = (geom, acc) => {
      if (!geom) return
      const { type, coordinates, geometries } = geom
      switch (type) {
        case 'LineString':
          acc.push(toLL(coordinates))
          break
        case 'MultiLineString':
          for (const line of coordinates) acc.push(toLL(line))
          break
        case 'Polygon':
          if (coordinates?.[0]) acc.push(toLL(coordinates[0])) // 외곽 링
          break
        case 'MultiPolygon':
          for (const poly of coordinates) if (poly?.[0]) acc.push(toLL(poly[0]))
          break
        case 'GeometryCollection':
          for (const g of geometries || []) pushGeom(g, acc)
          break
        default:
          break
      }
    }

    const parseGeoJSON = (gj) => {
      const paths = []
      if (!gj) return paths
      if (gj.type === 'FeatureCollection') {
        for (const f of gj.features || []) pushGeom(f.geometry, paths)
      } else if (gj.type === 'Feature') {
        pushGeom(gj.geometry, paths)
      } else {
        pushGeom(gj, paths)
      }
      return paths
    }

    ;(async () => {
      try {
        const res = await fetch(ROUTE_GEOJSON_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const gj = await res.json()
        const paths = parseGeoJSON(gj)
        if (alive) setRoutePaths(paths)
      } catch (e) {
        console.warn('Route.geojson load failed:', e)
        if (alive) setRoutePaths([])
      }
    })()

    return () => { alive = false }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const { scene, camera } = viewer
    const ellipsoid = Cesium.Ellipsoid.MOON
    const canvas = scene.canvas

    if (isFPS) hoverRef.current.enabled = true
    let onMouseMove = null
    let onPointerLockChange = null

    if (isFPS) {
      canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock
      onMouseMove = (e) => {
        if (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas || document.webkitPointerLockElement === canvas) {
          const sensitivity = 0.002
          camera.lookLeft(-e.movementX * sensitivity)
          camera.lookUp(-e.movementY * sensitivity)
          camera.setView({ orientation: { heading: camera.heading, pitch: camera.pitch, roll: 0 } })
        }
      }

      document.addEventListener('mousemove', onMouseMove)

      hoverRef.current.target = 1500
      const startLon = 23.46991, startLat = 0.66413
      const carto = new Cesium.Cartographic(Cesium.Math.toRadians(startLon), Cesium.Math.toRadians(startLat), hoverRef.current.target)
      const pos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height, ellipsoid)

      // ▶ 초진입 즉시 포즈 세팅
      const initPose = () => {
        const v = viewerRef.current?.cesiumElement
        const pose = computePoseNow(v, true)
        if (pose) {
          setCurrentLL({ lon: pose.lon, lat: pose.lat })
          setUserPose(pose)
          v?.scene?.requestRender?.()
        }
      }

      camera.flyTo({
        destination: pos,
        orientation: { heading: 0.0, pitch: 0.0, roll: 0.0 },
        duration: 0.5,
        complete: initPose,
      })

      const once = (scn) => { try { initPose() } finally { scn.postRender.removeEventListener(once) } }
      scene.postRender.addEventListener(once)

      const scc = scene.screenSpaceCameraController
      scc.enableRotate = scc.enableTranslate = scc.enableZoom = scc.enableTilt = scc.enableLook = false
    } else {
      // FPS 종료 시 화살표 숨김
      setUserPose(null)
    }

    const bumpSpeed = (dir) => setSpeedMul(v => Number((dir > 0 ? Math.min(v * 1.6, 5000) : Math.max(v / 1.6, 0.02)).toFixed(3)))
    const onKeyDown = (e) => {
      keysRef.current[e.code] = true
      if (isFPS && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) { boosterTriggerRef.current = true; e.preventDefault(); return }
      if (e.code === 'Space' && isFPS && !hoverRef.current.isJumping) { hoverRef.current.v = 800; hoverRef.current.isJumping = true; e.preventDefault(); return }
      if (e.code === 'PageUp') { hoverRef.current.target = Math.min(hoverRef.current.target + 200, 20000) }
      if (e.code === 'PageDown') { hoverRef.current.target = Math.max(hoverRef.current.target - 200, 50) }
      if (['BracketRight', 'Equal', 'NumpadAdd'].includes(e.code)) { e.preventDefault(); bumpSpeed(+1) }
      if (['BracketLeft', 'Minus', 'NumpadSubtract'].includes(e.code)) { e.preventDefault(); bumpSpeed(-1) }
      if (isFPS && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault()
      scene.requestRender?.()
    }
    const onKeyUp = (e) => { keysRef.current[e.code] = false; scene.requestRender?.() }

    const getHeight = () => Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)?.height ?? 1

    if (isFPS) {
      scene.requestRenderMode = false
      window.addEventListener('keydown', onKeyDown, { passive: false })
      window.addEventListener('keyup', onKeyUp)

      let lastTime, lastUIUpdateSec = 0
      const preRender = (_scn, time) => {
        let dt = 0
        if (lastTime) dt = Cesium.JulianDate.secondsDifference(time, lastTime)
        lastTime = time
        if (dt <= 0) return
        const nowSec = Cesium.JulianDate.toDate(time).getTime() / 1000
        nowSecRef.current = nowSec

        if (stopwatchRef.current.running) {
          const elapsed = stopwatchRef.current.baseElapsedMs + (nowSec - (stopwatchRef.current.startSec ?? nowSec)) * 1000
          if (nowSec - lastUIUpdateSec > HUD_PARAMS.STOPWATCH_TICK_MS / 1000) setStopwatchUI({ running: true, elapsedMs: elapsed })
        }

        if (boosterTriggerRef.current) {
          boosterTriggerRef.current = false
          const canUse = nowSec >= boosterRef.current.cooldownUntil
          if (canUse && !boosterRef.current.active) {
            boosterRef.current.active = true
            boosterRef.current.activateUntil = nowSec + HUD_PARAMS.BOOSTER_DURATION_SEC
            boosterRef.current.cooldownUntil = boosterRef.current.activateUntil + HUD_PARAMS.BOOSTER_COOLDOWN_SEC
          }
        }
        if (boosterRef.current.active && nowSec >= boosterRef.current.activateUntil) boosterRef.current.active = false

        const k = keysRef.current
        const h = getHeight()
        let speed = Math.min(Math.max(h * 0.02, 200), 1_500_000) * speedMulRef.current
        speed *= speedMulRef.current
        if (boosterRef.current.active) speed *= 5

        const forwardDirection = new Cesium.Cartesian3()
        const rightDirection = new Cesium.Cartesian3()
        Cesium.Cartesian3.clone(camera.direction, forwardDirection)
        Cesium.Cartesian3.clone(camera.right, rightDirection)
        const up = ellipsoid.geodeticSurfaceNormal(camera.position)
        const upDotForward = Cesium.Cartesian3.dot(up, forwardDirection)
        const upComponent = Cesium.Cartesian3.multiplyByScalar(up, upDotForward, new Cesium.Cartesian3())
        Cesium.Cartesian3.subtract(forwardDirection, upComponent, forwardDirection)
        Cesium.Cartesian3.normalize(forwardDirection, forwardDirection)

        let slopeFactor = 1.0
        if (k.KeyW || k.ArrowUp || k.KeyS || k.ArrowDown) {
          const testDistance = 10.0
          const testPos = new Cesium.Cartesian3()
          Cesium.Cartesian3.multiplyByScalar(forwardDirection, (k.KeyW || k.ArrowUp) ? testDistance : -testDistance, testPos)
          Cesium.Cartesian3.add(camera.position, testPos, testPos)
          const testCarto = Cesium.Cartographic.fromCartesian(testPos, ellipsoid)
          const currentCarto = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
          if (testCarto && currentCarto) {
            const testGroundHeight = scene.sampleHeight?.(testCarto, undefined, 3.0) || 0
            const currentGroundHeight = scene.sampleHeight?.(currentCarto, undefined, 3.0) || 0
            const heightDiff = testGroundHeight - currentGroundHeight
            const slope = heightDiff / testDistance
            slopeFactor = slope > 0 ? Math.max(0.2, 1.0 - slope * 2.0) : Math.min(1.0, 1.0 - slope * 0.5)
          }
        }

        const amt = speed * dt * slopeFactor
        if (k.KeyW || k.ArrowUp) Cesium.Cartesian3.add(camera.position, Cesium.Cartesian3.multiplyByScalar(forwardDirection, amt, new Cesium.Cartesian3()), camera.position)
        if (k.KeyS || k.ArrowDown) Cesium.Cartesian3.add(camera.position, Cesium.Cartesian3.multiplyByScalar(forwardDirection, -amt, new Cesium.Cartesian3()), camera.position)
        if (k.KeyA || k.ArrowLeft) Cesium.Cartesian3.add(camera.position, Cesium.Cartesian3.multiplyByScalar(rightDirection, -amt, new Cesium.Cartesian3()), camera.position)
        if (k.KeyD || k.ArrowRight) Cesium.Cartesian3.add(camera.position, Cesium.Cartesian3.multiplyByScalar(rightDirection, amt, new Cesium.Cartesian3()), camera.position)

        // AGL 유지
        const { agl, groundPos } = sampleGroundFPSSync(scene, camera.position)
        if (agl === undefined || !groundPos) return

        const carto = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
        ellipsoid.geodeticSurfaceNormalCartographic(carto, scratch.normal)
        Cesium.Cartesian3.multiplyByScalar(scratch.normal, -1, scratch.down)

        const hover = hoverRef.current
        if (agl < hover.min) {
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.min, scratch.offs)
          Cesium.Cartesian3.add(groundPos, scratch.offs, camera.position)
        } else if (agl > hover.max) {
          const delta = -(agl - hover.max)
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, delta, scratch.offs)
          Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)
        }
        if (agl <= hover.min + 50) hover.isJumping = false

        const err = Cesium.Math.clamp(hover.target - agl, -5000, 5000)
        const dynamicK = hover.k * (1 + Math.abs(err) / 500)
        hover.v += (dynamicK * err - hover.d * hover.v) * dt
        hover.v = Cesium.Math.clamp(hover.v, -3000, 3000)

        const dz = hover.v * dt
        Cesium.Cartesian3.multiplyByScalar(scratch.normal, dz, scratch.offs)
        Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)

        const res4 = sampleGroundFPSSync(scene, camera.position)
        if (res4.agl !== undefined && res4.groundPos && res4.agl < hover.min) {
          const n = Cesium.Cartesian3.normalize(res4.groundPos, new Cesium.Cartesian3())
          Cesium.Cartesian3.multiplyByScalar(n, hover.min, scratch.offs)
          Cesium.Cartesian3.add(res4.groundPos, scratch.offs, camera.position)
          hover.v = Math.max(0, hover.v)
        }

        // UI
        if (nowSec - lastUIUpdateSec > 0.05) {
          lastUIUpdateSec = nowSec
          const d = HUD_PARAMS.BOOSTER_DURATION_SEC
          const c = HUD_PARAMS.BOOSTER_COOLDOWN_SEC
          if (boosterRef.current.active) {
            const remaining = Math.max(0, boosterRef.current.activateUntil - nowSec)
            const progressed = (d - remaining) / d
            setBoosterUI({ status: 'active', progress: progressed, remainingSec: remaining })
          } else if (nowSec < boosterRef.current.cooldownUntil) {
            const remaining = boosterRef.current.cooldownUntil - nowSec
            const progressed = (c - Math.max(0, remaining - 0)) / c
            setBoosterUI({ status: 'cooldown', progress: Math.min(1, progressed), remainingSec: remaining })
          } else {
            setBoosterUI({ status: 'ready', progress: 1, remainingSec: 0 })
          }
        }
      }

      scene.preRender.addEventListener(preRender)
      preRenderCbRef.current = preRender

      return () => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
        if (onPointerLockChange) {
          document.removeEventListener('pointerlockchange', onPointerLockChange)
          document.removeEventListener('mozpointerlockchange', onPointerLockChange)
          document.removeEventListener('webkitPointerlockchange', onPointerLockChange)
        }
        if (document.exitPointerLock) document.exitPointerLock()

        const scc = scene.screenSpaceCameraController
        scc.enableRotate = scc.enableTranslate = scc.enableZoom = scc.enableTilt = scc.enableLook = true

        if (preRenderCbRef.current) { scene.preRender.removeEventListener(preRenderCbRef.current); preRenderCbRef.current = null }
        keysRef.current = Object.create(null)
      }
    }
  }, [isFPS])

  const approxSpeed = (() => {
    if (!viewerRef.current?.cesiumElement) return 0
    const carto = Cesium.Cartographic.fromCartesian(viewerRef.current.cesiumElement.camera.position, Cesium.Ellipsoid.MOON)
    const h = carto?.height ?? 1
    return Math.min(Math.max(h * 0.02, 200), 1_500_000) * speedMul
  })()

  const gaugeWrapStyle = { width: 240, height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.15)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.25)' }
  const gaugeFillStyle = (status) => ({ height: '100%', width: `${Math.round(boosterUI.progress * 100)}%`, transition: 'width 120ms linear', background: status === 'active' ? '#2d6cdf' : status === 'cooldown' ? '#888' : '#31c48d' })

  // ─────────────────────────────────────────────────────────────
  // 전역 마우스 추적 (3D 커서 HUD)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onWinMove = (e) => {
      lastClientPosRef.current = { x: e.clientX, y: e.clientY }
      const viewer = viewerRef.current?.cesiumElement
      const canvasEl = viewer?.scene?.canvas
      if (!canvasEl) return
      const rect = canvasEl.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top  && e.clientY <= rect.bottom) {
        const dpr = canvasEl.width / rect.width
        lastCanvasPosRef.current = new Cesium.Cartesian2((e.clientX - rect.left) * dpr, (e.clientY - rect.top)  * dpr)
      }
    }
    window.addEventListener('mousemove', onWinMove)
    return () => window.removeEventListener('mousemove', onWinMove)
  }, [])

  // 미니맵 HUD/postRender (isFPS 포함)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    const tileset = tilesetRef.current?.cesiumElement
    if (!viewer || !tileset) return

    let destroyed = false
    const { scene, camera } = viewer
    const canvasEl = scene.canvas
    const listeners = { mousemove_canvas: null, postRender: null }

    ;(async () => {
      try { await tileset.readyPromise } catch {}
      if (destroyed) return

      listeners.mousemove_canvas = (e) => {
        const rect = canvasEl.getBoundingClientRect()
        const dpr = canvasEl.width / rect.width
        const dbPos = new Cesium.Cartesian2((e.clientX - rect.left) * dpr, (e.clientY - rect.top)  * dpr)
        lastCanvasPosRef.current = dbPos

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
        } else setCursorLL3D(null)
      }
      canvasEl.addEventListener('mousemove', listeners.mousemove_canvas)

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

        // FPS 사용자 포즈 업데이트 (heading)
        if (centerLL && isFPS) {
          const hdg = getCameraAzimuthDeg(camera, Cesium.Ellipsoid.MOON)
          setUserPose({ ...centerLL, headingDeg: hdg })
        }

        // 시야 footprint
        const N = 18, r = Math.min(w, h) * 0.48
        const samples = Array.from({ length: N }, (_, i) => {
          const t = (i / N) * Math.PI * 2
          return new Cesium.Cartesian2(w / 2 + r * Math.cos(t), h / 2 + r * Math.sin(t))
        })
        const poly = []
            for (const s of samples) {
          let p = null
          if (scene.pickPositionSupported) {
            p = scene.pickPosition(s)
          }
          // ✅ 폴백: 화면 중심에서 타원체 교차점
          if (!Cesium.defined(p)) {
            p = camera.pickEllipsoid(s, Cesium.Ellipsoid.MOON)
          }
          if (Cesium.defined(p)) {
            const cc = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MOON)
            poly.push({ lon: toDeg(cc.longitude), lat: toDeg(cc.latitude) })
          }
        }
        setFootprint(poly.length >= 6 ? poly : [])
      }
      scene.postRender.addEventListener(listeners.postRender)

      ;(viewer).__cleanup_minimap__ = () => {
        canvasEl.removeEventListener('mousemove', listeners.mousemove_canvas)
        if (listeners.postRender) scene.postRender.removeEventListener(listeners.postRender)
      }
    })()

    return () => {
      const v = viewerRef.current?.cesiumElement
      if (v && v.__cleanup_minimap__) v.__cleanup_minimap__()
    }
  }, [isFPS])

  const pickAtCanvasPos = async (pos) => {
    const viewer = viewerRef.current?.cesiumElement; if (!viewer) return null
    const { scene, camera } = viewer
    if (scene.pickPositionSupported) {
      const p = scene.pickPosition(pos); if (Cesium.defined(p)) return p
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

  async function zMap() {
    const viewer = viewerRef.current?.cesiumElement; if (!viewer) return
    const { scene } = viewer
    const { x: cx, y: cy } = lastClientPosRef.current

    const topEl = document.elementFromPoint(cx, cy)
    const mini = minimapCanvasRef.current
    const overMiniTop = mini && (topEl === mini || mini.contains(topEl))

    if (overMiniTop) {
      const rect = mini.getBoundingClientRect()
      const insideMini = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom
      if (insideMini) {
        const [lon, lat] = xyToLonLat(cx - rect.left, cy - rect.top, rect.width, rect.height)
        setSavedPoints(ps => [...ps, { id: genId(), lon, lat }])
        setToast(`Z: mapped (minimap) → lon ${lon.toFixed(4)}°, lat ${lat.toFixed(4)}°`)
        setTimeout(() => setToast(null), 1200)
        scene.requestRender?.()
        return
      }
    }

    const canvasRect = scene.canvas.getBoundingClientRect()
    const inside3D = cx >= canvasRect.left && cx <= canvasRect.right && cy >= canvasRect.top  && cy <= canvasRect.bottom
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
        material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.fromCssColorString('#fff300').withAlpha(0.95)),
        clampToGround: false
      }
    })
    setTimeout(() => { try { v.entities.remove(arrowEntity) } catch {} ; scene.requestRender?.() }, 5000)
    scene.requestRender?.()
  }


  // ─────────────────────────────────────────────────────────────
  // HUD & Viewer
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef} tabIndex={0} onClick={() => containerRef.current?.focus()}
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', zIndex: 0, background: 'black' }}
    >
      {/* HUD */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            Mode: {isFPS ? 'Exploration Mode (Move: W/A/S/D, Booster: Shift)' : 'Navigation Mode (Mouse)'}
          </span>

          {isFPS && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 14, minWidth: 88, textAlign: 'right' }}>{formatTime(stopwatchUI.elapsedMs)}</span>
              <button onClick={handleStopwatchReset} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}>Reset</button>
              <span style={{ opacity: 0.75 }}>Auto-running in FPS</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Booster</span>
              <span style={{ opacity: 0.9 }}>
                {boosterUI.status === 'ready' && 'READY'}
                {boosterUI.status === 'active' && `ACTIVE (${boosterUI.remainingSec.toFixed(1)}s)`}
                {boosterUI.status === 'cooldown' && `COOLDOWN (${boosterUI.remainingSec.toFixed(1)}s)`}
              </span>
            </div>
            <div style={gaugeWrapStyle}><div style={gaugeFillStyle(boosterUI.status)} /></div>
            <div style={{ opacity: 0.8, fontSize: 11 }}>Shift : Boost Mode / Duration Time {HUD_PARAMS.BOOSTER_DURATION_SEC}s / CoolDown {HUD_PARAMS.BOOSTER_COOLDOWN_SEC}s</div>
          </div>
        </div>
        <button onClick={toggleFPS} style={{ padding: '6px 10px', borderRadius: 8, background: isFPS ? '#2d6cdf' : '#444', color: '#fff', border: 'none', cursor: 'pointer' }} title="Convert to Luna Exploration mode (Key: F)">
          {isFPS ? 'Switch to Navigation Mode (F)' : 'Switch to Exploration Mode (F)'}
        </button>

        

        {/* =========================
            [AddOnly] Add Annotation 버튼
        ========================= */}
        <button
          onClick={() => (isAddingMode ? cancelAddingAnnotation() : startAddingAnnotation())}
          style={{ padding: '6px 10px', borderRadius: 8, background: isAddingMode ? '#ef4444' : '#4a5568', color: '#fff', border: 'none', cursor: 'pointer' }}
          title="Click surface to set location"
        >
          {isAddingMode ? 'Cancel Adding' : 'Add Annotation'}
        </button>
        
        <button
            onClick={() => setIsImageComparisonOpen(true)}
            style={{ padding: '6px 10px', borderRadius: 8, background: '#2d6cdf', color: '#fff', border: 'none', cursor: 'pointer', minWidth: 150 }}
          >
            Super Resolution
          </button>

        {isFPS && (
          <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            Speed: {fmtSpeed(approxSpeed)} ×{speedMul.toFixed(2)} {' '}([-]: Speed Down / [+] : Speed Up) · Hover: · Target AGL: {hoverRef.current.target} m (PgUp/PgDn)
          </span>
        )}
      </div>

      {/* 3D 커서 HUD */}
      {cursorLL3D && (
        <div style={{ position: 'absolute', top: 48, left: 12, zIndex: 11, padding: '6px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.55)', color: '#dfe8ff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
          Cursor 3D — lon: {cursorLL3D.lon.toFixed(4)}°, lat: {cursorLL3D.lat.toFixed(4)}°
        </div>
      )}

      {toast && (
        <div style={{ position: 'absolute', top: 84, left: 12, zIndex: 11, padding: '6px 10px', borderRadius: 10, background: 'rgba(20,20,20,0.8)', color: '#ffe680', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>{toast}</div>
      )}

      <ImageComparison
        isOpen={isImageComparisonOpen}
        onClose={() => setIsImageComparisonOpen(false)}
      />

      {/* 미니맵 */}
      <MiniMap
        width={MINIMAP_W} height={MINIMAP_H}
        currentLL={currentLL} points={savedPoints} footprint={footprint}
        onPickLonLat={(lon, lat) => goToWithArrow(lon, lat)}
        onCanvasRef={(el) => { minimapCanvasRef.current = el }}
        userPose={userPose}    // FPS 모드에서 유저 위치 표기
        routes={routePaths}                    // ✅ GeoJSON 경로 전달(빨간 라인)
      />

      {/* Render viewers */}
      {!isSplitView ? (
        <Viewer
          ref={viewerRef} full style={{ width: '100%', height: '100%' }}
          baseLayerPicker={false} timeline={false} animation={false} skyBox={false}
          skyAtmosphere={false} imageryProvider={false} terrainProvider={false}
          requestRenderMode={false} shouldAnimate
        >
          <Cesium3DTileset ref={tilesetRef} url={Cesium.IonResource.fromAssetId(MOON_ASSET_ID)} />

          {/* ✅ Route GeoJSON → 3D 빨간색 선 (그대로 유지) */}
          <GeoJsonDataSource
            data={ROUTE_GEOJSON_URL}
            clampToGround={false}
            onLoad={(ds) => {
              const viewer = viewerRef.current?.cesiumElement
              const now = viewer?.clock?.currentTime
              const ell = Cesium.Ellipsoid.MOON

              const ents = ds.entities.values
              for (const e of ents) {
                if (e.polyline) {
                  // 스타일 유지
                  e.polyline.width = 4
                  e.polyline.material = new Cesium.ColorMaterialProperty(
                    Cesium.Color.RED.withAlpha(0.95)
                  )
                  e.polyline.clampToGround = false

                  // ▶ 높이 +1000m 적용
                  try {
                    const posProp = e.polyline.positions
                    const positions = posProp?.getValue?.(now)
                    if (positions?.length) {
                      const raised = positions.map((cart) => {
                        const c = Cesium.Cartographic.fromCartesian(cart, ell)
                        const h = (c.height ?? 0) + 1000.0
                        return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, h, ell)
                      })
                      e.polyline.positions = new Cesium.ConstantProperty(raised)
                    }
                  } catch {}
                }
              }

              // 보기 좋게 카메라 프레이밍
              try {
                if (viewer) {
                  const bs = ds.entities.computeBoundingSphere()
                  if (bs?.radius && isFinite(bs.radius)) {
                    viewer.camera.flyToBoundingSphere(bs, { duration: 1.2 })
                  }
                }
              } catch {}
            }}
          />
          {a11RobotPosition && (
            <>
              <Entity
                name="Apollo11Robot"
                position={a11RobotPosition}
                orientation={Cesium.Transforms.headingPitchRollQuaternion(
                  a11RobotPosition,
                  new Cesium.HeadingPitchRoll(
                    Cesium.Math.toRadians(A11_ROBOT_HEADING_DEG), 0, 0
                  ),
                  Cesium.Ellipsoid.MOON
                )}
                model={{
                  uri: A11_ROBOT_URI,               // '/model.glb' (public 폴더 기준)
                  scale: Math.max(120, A11_ROBOT_SCALE), // 가시성 ↑ (ex. 120)
                  minimumPixelSize: 160,            // 멀리서도 보이게
                  maximumScale: 4000,               // 확대 상한
                  runAnimations: true,
                  clampAnimations: true,
                  // 필요시 컬링 완화
                  backFaceCulling: false
                }}
              />

              {/* (선택) 디버그용 하이라이트 링 — 실제 위치 확인 */}
              <Entity
                position={a11RobotPosition}
                billboard={{
                  image: makeRingSprite(160, 8, 0.9),
                  verticalOrigin: Cesium.VerticalOrigin.CENTER,
                  pixelOffset: new Cesium.Cartesian2(0, 0),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }}
              />
            </>
          )}
          <Entity
            name="Apollo17Model"
            position={a17Position}
            orientation={a17Orientation}
            model={{
              uri: A17_MODEL_URI,
              scale: A17_SCALE,
              minimumPixelSize: 192,
              runAnimations: true,
              clampAnimations: true,
            }}
          />
          {a17RobotPosition && (
            <RobotGltfPrimitive
              viewerRef={viewerRef}
              position={a17RobotPosition}
              hprDeg={{ heading: A17_ROBOT_HEADING_DEG, pitch: 0, roll: 0 }}
              url={A17_ROBOT_URI}
              scale={A17_ROBOT_SCALE}
              minPx={160}
              maxScale={2000}
            />
          )}

          {/* 주석/포인트 */}
          {annotations.map((item) => {
            const key = `${item.category}-${item.name}`
            if (item.category === 'apolloSite') {
              return (
                <Entity key={key} name={item.name} position={item.position}
                  point={{ pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 }}
                  label={{
                    text: item.name, font: '14px sans-serif', fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -15),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  }}
                  onClick={() => handleAnnotationClick(item)}
                />
              )
            } else if (item.category === 'geography') {
              return (
                <Entity key={key} name={item.name} position={item.position}
                  point={{ pixelSize: 8, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 }}
                  label={{
                    text: item.name, font: '14px sans-serif', fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -12),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  }}
                  onClick={() => handleAnnotationClick(item)}
                />
              )
            }
            return null
          })}

          {/* 저장 포인트 */}
          {savedPoints.map((p) => (
            <Entity key={p.id} position={Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 6)}
              point={{ pixelSize: 8, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 }}
              label={{
                text: `lon ${p.lon.toFixed(4)}°, lat ${p.lat.toFixed(4)}°`, font: '14px sans-serif',
                fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
                showBackground: true, backgroundColor: new Cesium.Color(0, 0, 0, 0.55),
                pixelOffset: new Cesium.Cartesian2(0, -16),
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }}
              description={`[POINT] Lon ${p.lon.toFixed(6)}, Lat ${p.lat.toFixed(6)}`}
            />
          ))}

          {/* 사용자 주석 */}
          {userAnnotations.map((item) => {
            const pos = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 100)
            return (
              <Entity
                key={item.id}
                name={item.name}
                position={pos}
                point={{
                  pixelSize: 6,
                  color: Cesium.Color.LIME,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }}
                label={{
                  text: item.name,
                  font: '14px sans-serif',
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 3,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                  pixelOffset: new Cesium.Cartesian2(0, -12),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }}
                description={item.description || ''}
                onDoubleClick={() => deleteUserAnnotation(item.id)}
                onClick={() => {
                  const viewer = viewerRef.current?.cesiumElement
                  if (!viewer) return
                  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(pos, 20000), { duration: 1.5 })
                }}
              />
            )
          })}
        </Viewer>
      ) : (
        <SplitViewMoon
          sliderPosition={sliderPosition}
          setSliderPosition={setSliderPosition}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          annotations={annotations}
          onAnnotationClick={handleAnnotationClick}
          MOON_ASSET_ID={MOON_ASSET_ID}
          MOON_SR_ASSET_ID={MOON_SR_ASSET_ID}
        />
      )}

      {/* =======================================================
          [Add Annotation] 간단 오버레이 폼 (AnnotationSidebar 수정 불필요)
      ======================================================= */}
      {editingAnnotation && (
        <div style={{
          position: 'absolute', right: 12, top: 12, zIndex: 20,
          width: 280, padding: 12, borderRadius: 10,
          background: 'rgba(0,0,0,0.75)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Add Annotation</div>

          <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>
            lon: {editingAnnotation.lon.toFixed(6)}°, lat: {editingAnnotation.lat.toFixed(6)}°
          </div>

          <label style={{ fontSize: 12 }}>Name</label>
          <input
            defaultValue={editingAnnotation.name}
            onChange={(e) => setEditingAnnotation({ ...editingAnnotation, name: e.target.value })}
            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #333', margin: '4px 0 10px' }}
          />

          <label style={{ fontSize: 12 }}>Description</label>
          <textarea
            defaultValue={editingAnnotation.description}
            onChange={(e) => setEditingAnnotation({ ...editingAnnotation, description: e.target.value })}
            rows={3}
            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #333', resize: 'vertical' }}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => { saveEditingAnnotation(editingAnnotation); }}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none', background: '#31c48d', color: '#0b1a12', fontWeight: 700, cursor: 'pointer' }}
            >
              Save
            </button>
            <button
              onClick={() => { setEditingAnnotation(null); }}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #444', background: '#333', color: '#eee', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

        
      <AnnotationSidebar annotation={selectedAnnotation} onClose={handleCloseModal} />

    </div>
  )
}
