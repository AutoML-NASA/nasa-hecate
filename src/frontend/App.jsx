// src/frontend/App.jsx
import { useEffect, useRef, useState } from 'react'
import { Viewer, Cesium3DTileset, Entity } from 'resium'
import * as Cesium from 'cesium'
import Papa from 'papaparse'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 💡 AnnotationSidebar.jsx, AnnotationSidebar.css 파일이 필요합니다.
import AnnotationSidebar from './AnnotationSidebar'
import './AnnotationSidebar.css'

// =========================
// ⏱️/⚡ HUD 파라미터 (요기서 초 조절)
// =========================
const HUD_PARAMS = {
  BOOSTER_DURATION_SEC: 2,   // 부스터 유지 시간
  BOOSTER_COOLDOWN_SEC: 5,   // 부스터 쿨다운
  STOPWATCH_TICK_MS: 50,     // 스톱워치 UI 갱신 주기(FPS 내 프레임 연동 + 보조)
}

// ⛽️ Ion 토큰
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjU0NDZjOC0xMWMwLTQ5ZWEtYTg5MC02NTljMmZiNWFiMzUiLCJpZCI6MzQ3MDUzLCJpYXQiOjE3NTk1NjU2ODZ9.yuChdxYa0oW-6WWuYXE_JMBhzd9DjzXRTcEX0cH4pD8'
const MOON_ASSET_ID = 2684829

// 🌕 달 좌표계 사용
Cesium.Ellipsoid.WGS84 = Cesium.Ellipsoid.MOON
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON

const apolloSites = [
  { name: 'Apollo 11', lat: 0.66413, lon: 23.46991 },
  // { name: 'Apollo 15', lat: 25.97552, lon: 3.56152 },
  { name: 'Apollo 17', lat: 20.029, lon: 30.462 },
]

// ─────────────────────────────────────────────────────────────
// ▼▼▼ (추가) 미니맵/매핑 유틸 & 컴포넌트 ▼▼▼
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
// ▲▲▲ (추가) 미니맵/매핑 유틸 & 컴포넌트 ▲▲▲
// ─────────────────────────────────────────────────────────────

export default function MoonCesium() {
  const viewerRef = useRef(null)
  const tilesetRef = useRef(null)
  const containerRef = useRef(null)

  // --- State ---
  const [isFPS, setIsFPS] = useState(false)
  const [annotations, setAnnotations] = useState([])
  const [selectedAnnotation, setSelectedAnnotation] = useState(null)

  // 🔥 스피드 배수 (±로 조절)
  const [speedMul, setSpeedMul] = useState(1)
  const speedMulRef = useRef(1)
  useEffect(() => { speedMulRef.current = speedMul }, [speedMul])

  // --- Refs ---
  const keysRef = useRef(Object.create(null))
  const preRenderCbRef = useRef(null)

  // 🚁 표면 위 호버(AGL) 제어 파라미터 & 스크래치 (원본 FPS 코드 기준)
  const hoverRef = useRef({
    enabled: true,
    target: 1500,
    min: -500,
    max: 6000,
    k: 15.0,
    d: 3,
    v: 0,
    isJumping: false
  })
  const scratch = useRef({
    normal: new Cesium.Cartesian3(),
    down:   new Cesium.Cartesian3(),
    offs:   new Cesium.Cartesian3(),
    surf:   new Cesium.Cartesian3(),
    groundCarto: new Cesium.Cartographic()
  }).current

  // ================
  // ⏱️ 스톱워치 (FPS에서만 자동 실행)
  // ================
  const [stopwatchUI, setStopwatchUI] = useState({ elapsedMs: 0, running: false })
  const stopwatchRef = useRef({
    running: false,
    baseElapsedMs: 0,  // 누적(일시정지까지)
    startSec: null,    // 다시 시작한 절대초
  })
  const nowSecRef = useRef(null) // preRender에서 최신 nowSec 공유

  const formatTime = (ms) => {
    const totalMs = Math.max(0, Math.floor(ms))
    const minutes = Math.floor(totalMs / 60000)
    const seconds = Math.floor((totalMs % 60000) / 1000)
    const centi = Math.floor((totalMs % 1000) / 10)
    const mm = String(minutes).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')
    const cc = String(centi).padStart(2, '0')
    return `${mm}:${ss}.${cc}`
  }

  // 👉 요구사항: FPS에서만 켜지고 계속 켜짐(자동 시작), FPS 나가면 자동 정지
  useEffect(() => {
    const now = Date.now() / 1000
    if (isFPS) {
      // 자동 시작(계속 켜주기)
      stopwatchRef.current.running = true
      stopwatchRef.current.startSec = now
      setStopwatchUI(u => ({ ...u, running: true }))
    } else {
      // 자동 일시정지(누적은 유지)
      if (stopwatchRef.current.running) {
        const elapsed = stopwatchRef.current.baseElapsedMs + (now - (stopwatchRef.current.startSec ?? now)) * 1000
        stopwatchRef.current.baseElapsedMs = elapsed
        stopwatchRef.current.running = false
        stopwatchRef.current.startSec = null
        setStopwatchUI({ running: false, elapsedMs: elapsed })
      }
    }
  }, [isFPS])

  // Reset은 FPS 중에도 계속 실행 상태 유지(0으로 리셋 후 즉시 달리기)
  const handleStopwatchReset = () => {
    const now = (nowSecRef.current ?? Date.now() / 1000)
    stopwatchRef.current.baseElapsedMs = 0
    stopwatchRef.current.startSec = now
    stopwatchRef.current.running = isFPS // FPS 중이면 running 유지
    setStopwatchUI({ running: !!isFPS, elapsedMs: 0 })
  }

  // FPS가 아닐 때는 UI를 숨기지만, 혹시 모를 시간 갱신을 위해 간단한 보조 타이머는 유지(부담 적음)
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

  // ================
  // ⚡ 부스터 (Shift 단발 트리거)
  // ================
  const [boosterUI, setBoosterUI] = useState({ status: 'ready', progress: 1, remainingSec: 0 })
  const boosterRef = useRef({
    active: false,
    activateUntil: 0,  // 활성 종료 시점(sec)
    cooldownUntil: 0,  // 사용 가능 시점(sec)
  })
  const boosterTriggerRef = useRef(false) // 키다운 이벤트 → preRender에서 처리

  const fmtSpeed = (mps) => {
    if (mps >= 1_000_000) return `${(mps/1_000_000).toFixed(2)} Mm/s`
    if (mps >= 1_000) return `${(mps/1_000).toFixed(1)} km/s`
    return `${Math.round(mps)} m/s`
  }

  useEffect(() => {
    async function fetchData() {
      const apolloData = [
        { name: 'Apollo 11', lat: 0.66413, lon: 23.46991, category: 'apolloSite', description: 'Mankind\'s first steps on the Moon.' },
        { name: 'Apollo 15', lat: 25.97552, lon: 3.56152, category: 'apolloSite', description: 'First mission to use the Lunar Roving Vehicle.' },
        { name: 'Apollo 17', lat: 20.029, lon: 30.462, category: 'apolloSite', description: 'Final mission of the Apollo program.' },
      ];

      try {
        const response = await fetch('/data/annotations.csv');
        let csvData = [];
        if (response.ok) {
          const csvText = await response.text();
          const parsed = Papa.parse(csvText, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
          });
          csvData = parsed.data.map(item => ({ ...item, category: 'geography' }));
        } else {
          console.error("CSV 파일을 불러오는 데 실패했습니다. 아폴로 데이터만 표시합니다.");
        }
        
        const combinedData = [...apolloData, ...csvData].map(item => ({
          ...item,
          position: item.lat != null && item.lon != null ? Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 100) : null
        })).filter(item => item.position);
        setAnnotations(combinedData);

      } catch (error) {
        console.error("데이터 처리 중 오류 발생:", error);
        const combinedData = apolloData.map(item => ({
          ...item,
          position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 100)
        }));
        setAnnotations(combinedData);
      }
    }
    fetchData();
  }, []);

  const toggleFPS = () => {
    setIsFPS(currentIsFPS => {
      if (!currentIsFPS && viewerRef.current?.cesiumElement) {
        viewerRef.current.cesiumElement.scene.canvas.requestPointerLock();
      }
      return !currentIsFPS;
    });
  };

  const handleAnnotationClick = (annotation) => {
    setSelectedAnnotation(annotation);
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    
    const boundingSphere = new Cesium.BoundingSphere(annotation.position, 20000);
    viewer.camera.flyToBoundingSphere(boundingSphere, {
      duration: 2.0,
    });
  };
  const handleCloseModal = () => setSelectedAnnotation(null);

  useEffect(() => { containerRef.current?.focus() }, [])

  useEffect(() => {
    const onToggle = (e) => {
      if (e.code === 'KeyF') {
        toggleFPS();
      }
      // ▼▼▼ (추가) Z/X 단축키: 매핑/초기화
      if (e.code === 'KeyZ') zMap()
      if (e.code === 'KeyX') {
        setSavedPoints([])
        setToast('Cleared all mappings (X)')
        setTimeout(() => setToast(null), 1000)
      }
    };
    window.addEventListener('keydown', onToggle);
    return () => window.removeEventListener('keydown', onToggle);
  }, []); 

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
        const pickedObject = scene.pick(e.position);
        if (!Cesium.defined(pickedObject)) {
          const picked = scene.pickPosition(e.position)
          if (Cesium.defined(picked)) {
            const carto = Cesium.Cartographic.fromCartesian(picked)
            console.log(
              `위도: ${Cesium.Math.toDegrees(carto.latitude).toFixed(4)}, 경도: ${Cesium.Math.toDegrees(carto.longitude).toFixed(4)}`
            )
            // ▼ (추가) 저장 포인트 기록
            const lat = Cesium.Math.toDegrees(carto.latitude)
            const lon = Cesium.Math.toDegrees(carto.longitude)
            setSavedPoints(ps => [...ps, { id: genId(), lon, lat }])
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    })()

    return () => { destroyed = true; handler.destroy() }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const { scene, camera } = viewer
    const ellipsoid = Cesium.Ellipsoid.MOON
    const canvas = viewer.scene.canvas

    if (isFPS) hoverRef.current.enabled = true
    
    // 이벤트 핸들러들을 if 블록 밖에 정의
    let lockPointer = null
    let onMouseMove = null
    let onPointerLockChange = null
    if (isFPS) {
      canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock

      onMouseMove = (e) => {
        if (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas || document.webkitPointerLockElement === canvas) {
          const sensitivity = 0.002
          camera.lookLeft(-e.movementX * sensitivity)
          camera.lookUp(-e.movementY * sensitivity)
          camera.setView({
            orientation: { heading: camera.heading, pitch: camera.pitch, roll: 0 }
          })
        }
      }

      onPointerLockChange = () => {
        if (!document.pointerLockElement && !document.mozPointerLockElement && !document.webkitPointerLockElement) {
          setIsFPS(false)
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('pointerlockchange', onPointerLockChange)
      document.addEventListener('mozpointerlockchange', onPointerLockChange)
      document.addEventListener('webkitpointerlockchange', onPointerLockChange)
      
      // hoverRef.current.target 값 조정 (500미터)
      hoverRef.current.target = 500;

      const startLon = 23.46991, startLat = 0.66413
      const carto = new Cesium.Cartographic(
        Cesium.Math.toRadians(startLon), 
        Cesium.Math.toRadians(startLat), 
        hoverRef.current.target
      )
      const pos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height, ellipsoid)

      camera.flyTo({
        destination: pos,
        orientation: { heading: 0.0, pitch: 0.0, roll: 0.0 },
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

      // ⚡ Shift 단발 트리거 → preRender에서 처리
      if (isFPS && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
        boosterTriggerRef.current = true
        e.preventDefault()
        return
      }

      if (e.code === 'Space' && isFPS && !hoverRef.current.isJumping) {
        hoverRef.current.v = 800
        hoverRef.current.isJumping = true
        e.preventDefault()
        return
      }
      if (e.code === 'PageUp') { hoverRef.current.target = Math.min(hoverRef.current.target + 200, 20000) }
      if (e.code === 'PageDown') { hoverRef.current.target = Math.max(hoverRef.current.target - 200, 50) }
      if (['BracketRight', 'Equal', 'NumpadAdd'].includes(e.code)) { e.preventDefault(); bumpSpeed(+1) }
      if (['BracketLeft', 'Minus', 'NumpadSubtract'].includes(e.code)) { e.preventDefault(); bumpSpeed(-1) }
      if (isFPS && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault()
      scene.requestRender?.()
    }
    const onKeyUp = (e) => { keysRef.current[e.code] = false; scene.requestRender?.() }

    const getHeight = () => Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)?.height ?? 1

    const sampleGround = (carto) => {
      let groundH = scene.sampleHeight?.(carto, undefined, 3.0)
      if (groundH !== undefined) {
        scratch.groundCarto.longitude = carto.longitude
        scratch.groundCarto.latitude  = carto.latitude
        scratch.groundCarto.height    = groundH
        const groundPos = Cesium.Cartesian3.fromRadians(
          scratch.groundCarto.longitude, scratch.groundCarto.latitude, scratch.groundCarto.height, ellipsoid
        )
        return { agl: carto.height - groundH, groundPos }
      }
      ellipsoid.geodeticSurfaceNormalCartographic(carto, scratch.normal)
      Cesium.Cartesian3.multiplyByScalar(scratch.normal, -1, scratch.down)
      const hit = scene.pickFromRay?.(new Cesium.Ray(camera.position, scratch.down))
      if (hit?.position) return { agl: Cesium.Cartesian3.distance(camera.position, hit.position), groundPos: hit.position }
      const onSurf = ellipsoid.scaleToGeodeticSurface(camera.position, scratch.surf)
      return { agl: onSurf ? Cesium.Cartesian3.distance(camera.position, onSurf) : undefined, groundPos: onSurf }
    }

    if (isFPS) {
      scene.requestRenderMode = false
      window.addEventListener('keydown', onKeyDown, { passive: false })
      window.addEventListener('keyup', onKeyUp)

      let lastTime
      let lastUIUpdateSec = 0 // HUD 갱신 스로틀
      const preRender = (_scn, time) => {
        // === 공통 시간 ===
        let dt = 0
        if (lastTime) dt = Cesium.JulianDate.secondsDifference(time, lastTime)
        lastTime = time
        if (dt <= 0) return
        const nowSec = Cesium.JulianDate.toDate(time).getTime() / 1000
        nowSecRef.current = nowSec

        // === ⏱️ 스톱워치 업데이트 (FPS에서 항상 running) ===
        if (stopwatchRef.current.running) {
          const elapsed = stopwatchRef.current.baseElapsedMs + (nowSec - (stopwatchRef.current.startSec ?? nowSec)) * 1000
          if (nowSec - lastUIUpdateSec > HUD_PARAMS.STOPWATCH_TICK_MS / 1000) {
            setStopwatchUI({ running: true, elapsedMs: elapsed })
          }
        }

        // === ⚡ 부스터 상태 머신 ===
        if (boosterTriggerRef.current) {
          boosterTriggerRef.current = false
          const canUse = nowSec >= boosterRef.current.cooldownUntil
          if (canUse && !boosterRef.current.active) {
            boosterRef.current.active = true
            boosterRef.current.activateUntil = nowSec + HUD_PARAMS.BOOSTER_DURATION_SEC
            boosterRef.current.cooldownUntil = boosterRef.current.activateUntil + HUD_PARAMS.BOOSTER_COOLDOWN_SEC
          }
        }
        if (boosterRef.current.active && nowSec >= boosterRef.current.activateUntil) {
          boosterRef.current.active = false
        }

        // === 이동/물리 ===
        const k = keysRef.current
        const h = getHeight()

        let speed = Math.min(Math.max(h * 0.02, 200), 1_500_000) * speedMulRef.current
        speed *= speedMulRef.current // (원래 코드 유지)
        if (boosterRef.current.active) speed *= 5   // ✅ '부스터 활성' 상태에서만 속도 배수

        // 📍 수평 이동 방향 계산
        const forwardDirection = new Cesium.Cartesian3()
        const rightDirection = new Cesium.Cartesian3()

        Cesium.Cartesian3.clone(camera.direction, forwardDirection)
        Cesium.Cartesian3.clone(camera.right, rightDirection)

        const up = ellipsoid.geodeticSurfaceNormal(camera.position)

        // forward에서 up 성분 제거 (수평 투영)
        const upDotForward = Cesium.Cartesian3.dot(up, forwardDirection)
        const upComponent = Cesium.Cartesian3.multiplyByScalar(up, upDotForward, new Cesium.Cartesian3())
        Cesium.Cartesian3.subtract(forwardDirection, upComponent, forwardDirection)
        Cesium.Cartesian3.normalize(forwardDirection, forwardDirection)

        // 📍 경사도 계산 (전진 방향)
        let slopeFactor = 1.0
        if (k.KeyW || k.ArrowUp || k.KeyS || k.ArrowDown) {
          const testDistance = 10.0
          const testPos = new Cesium.Cartesian3()

          if (k.KeyW || k.ArrowUp) {
            Cesium.Cartesian3.multiplyByScalar(forwardDirection, testDistance, testPos)
          } else {
            Cesium.Cartesian3.multiplyByScalar(forwardDirection, -testDistance, testPos)
          }
          Cesium.Cartesian3.add(camera.position, testPos, testPos)

          const testCarto = Cesium.Cartographic.fromCartesian(testPos, ellipsoid)
          const currentCarto = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)

          if (testCarto && currentCarto) {
            const testGroundHeight = scene.sampleHeight?.(testCarto, undefined, 3.0) || 0
            const currentGroundHeight = scene.sampleHeight?.(currentCarto, undefined, 3.0) || 0

            const heightDiff = testGroundHeight - currentGroundHeight
            const slope = heightDiff / testDistance

            if (slope > 0) {
              slopeFactor = Math.max(0.2, 1.0 - slope * 2.0)
            } else {
              slopeFactor = Math.min(1.0, 1.0 - slope * 0.5)
            }
          }
        }

        const amt = speed * dt * slopeFactor

        // 이동 적용
        if (k.KeyW || k.ArrowUp) {
          const moveVector = Cesium.Cartesian3.multiplyByScalar(forwardDirection, amt, new Cesium.Cartesian3())
          Cesium.Cartesian3.add(camera.position, moveVector, camera.position)
        }
        if (k.KeyS || k.ArrowDown) {
          const moveVector = Cesium.Cartesian3.multiplyByScalar(forwardDirection, -amt, new Cesium.Cartesian3())
          Cesium.Cartesian3.add(camera.position, moveVector, camera.position)
        }
        if (k.KeyA || k.ArrowLeft) {
          const moveVector = Cesium.Cartesian3.multiplyByScalar(rightDirection, -amt, new Cesium.Cartesian3())
          Cesium.Cartesian3.add(camera.position, moveVector, camera.position)
        }
        if (k.KeyD || k.ArrowRight) {
          const moveVector = Cesium.Cartesian3.multiplyByScalar(rightDirection, amt, new Cesium.Cartesian3())
          Cesium.Cartesian3.add(camera.position, moveVector, camera.position)
        }
        
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

        // (a) 상한 클램프
        if (agl > hover.max) {
          const delta = -(agl - hover.max)
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, delta, scratch.offs)
          Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)
          const carto3 = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
          const res3 = sampleGround(carto3)
          agl = res3.agl
          groundPos = res3.groundPos
        }
        
        if (agl <= hover.min + 50) {  // 지면에서 50m 이내면 점프 가능
          hover.isJumping = false
        }

        // (b) 스프링(중력 느낌): target AGL로 부드럽게 복원
        const err = Cesium.Math.clamp(hover.target - agl, -5000, 5000)

        const dynamicK = hover.k * (1 + Math.abs(err) / 500)  // 오차 비례 강화
        hover.v += (dynamicK * err - hover.d * hover.v) * dt
        
        // 속도 제한
        hover.v = Cesium.Math.clamp(hover.v, -3000, 3000)

        const dz = hover.v * dt
        Cesium.Cartesian3.multiplyByScalar(scratch.normal, dz, scratch.offs)
        Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)

        // (c) 지면 충돌 클램프 2차
        const carto4 = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
        const res4 = sampleGround(carto4)
        if (res4.agl !== undefined && res4.groundPos && res4.agl < hover.min) {
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.min, scratch.offs)
          Cesium.Cartesian3.add(res4.groundPos, scratch.offs, camera.position)
          hover.v = Math.max(0, hover.v)
        }

        // === HUD(부스터/스톱워치) UI 갱신(스로틀) ===
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
        if(viewer.scene.canvas) {
          viewer.scene.canvas.removeEventListener('click', lockPointer)
        }
        if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
        if (onPointerLockChange) {
          document.removeEventListener('pointerlockchange', onPointerLockChange)
          document.removeEventListener('mozpointerlockchange', onPointerLockChange)
          document.removeEventListener('webkitpointerlockchange', onPointerLockChange)
        }
        if (document.exitPointerLock) document.exitPointerLock()

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
    }
  }, [isFPS])

  const approxSpeed = (() => {
    if (!viewerRef.current?.cesiumElement) return 0
    const carto = Cesium.Cartographic.fromCartesian(viewerRef.current.cesiumElement.camera.position, Cesium.Ellipsoid.MOON)
    const h = carto?.height ?? 1
    return Math.min(Math.max(h * 0.02, 200), 1_500_000) * speedMul
  })()

  // === 부스터 게이지 공통 스타일 ===
  const gaugeWrapStyle = {
    width: 240, height: 10, borderRadius: 6,
    background: 'rgba(255,255,255,0.15)',
    overflow: 'hidden', border: '1px solid rgba(255,255,255,0.25)'
  }
  const gaugeFillStyle = (status) => ({
    height: '100%',
    width: `${Math.round(boosterUI.progress * 100)}%`,
    transition: 'width 120ms linear',
    background: status === 'active'
      ? '#2d6cdf'
      : status === 'cooldown'
        ? '#888'
        : '#31c48d'
  })

  // ─────────────────────────────────────────────────────────────
  // ▼▼▼ (추가) 매핑/미니맵 상태 & 로직 ▼▼▼
  // ─────────────────────────────────────────────────────────────
  const [currentLL, setCurrentLL] = useState(null)
  const [savedPoints, setSavedPoints] = useState([])   // [{id, lon, lat}]
  const [footprint, setFootprint] = useState([])
  const [cursorLL3D, setCursorLL3D] = useState(null)
  const [toast, setToast] = useState(null)
  const lastCanvasPosRef = useRef(new Cesium.Cartesian2(0, 0))
  const lastClientPosRef = useRef({ x: 0, y: 0 })
  const minimapCanvasRef = useRef(null)

  // 전역 마우스(클라이언트 좌표 추적)
  useEffect(() => {
    const onWinMove = (e) => {
      lastClientPosRef.current = { x: e.clientX, y: e.clientY }
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

  // 초기화 & 미니맵용 postRender/canvas mousemove
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

      // 캔버스 마우스 이동 → 3D 커서 HUD
      listeners.mousemove_canvas = (e) => {
        const rect = canvasEl.getBoundingClientRect()
        const dpr = canvasEl.width / rect.width
        const dbPos = new Cesium.Cartesian2(
          (e.clientX - rect.left) * dpr,
          (e.clientY - rect.top)  * dpr
        )
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
        } else {
          setCursorLL3D(null)
        }
      }
      canvasEl.addEventListener('mousemove', listeners.mousemove_canvas)

      // 미니맵 갱신(postRender)
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

      ;(viewer).__cleanup_minimap__ = () => {
        canvasEl.removeEventListener('mousemove', listeners.mousemove_canvas)
        if (listeners.postRender) scene.postRender.removeEventListener(listeners.postRender)
        handler.destroy()
      }
    })()

    return () => {
      destroyed = true
      const v = viewerRef.current?.cesiumElement
      if (v && v.__cleanup_minimap__) v.__cleanup_minimap__()
    }
  }, [])

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

  // Z 매핑 — 미니맵 우선, 그 다음 3D
  async function zMap() {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
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
  // ─────────────────────────────────────────────────────────────
  // ▲▲▲ (추가) 매핑/미니맵 상태 & 로직 끝 ▲▲▲
  // ─────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef} tabIndex={0} onClick={() => containerRef.current?.focus()}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        margin: 0, padding: 0, overflow: 'hidden', zIndex: 0, background: 'black',
      }}
    >
      {/* HUD */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'flex-start',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        {/* 좌측 스택: Mode + (FPS 전용) 스톱워치 + 부스터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            Mode: {isFPS ? 'FPS (W/A/S/D, Shift, Ctrl)' : 'Original (Mouse)'}
          </span>

          {/* ⏱️ 스톱워치 — FPS에서만 표시 & 항상 실행 */}
          {isFPS && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12,
              border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)'
            }}>
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 14, minWidth: 88, textAlign: 'right' }}>
                {formatTime(stopwatchUI.elapsedMs)}
              </span>
              <button onClick={handleStopwatchReset}
                style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}>
                Reset
              </button>
              <span style={{ opacity: 0.75 }}>Auto-running in FPS</span>
            </div>
          )}

          {/* ⚡ 부스터 게이지 */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '6px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12,
            border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Booster</span>
              <span style={{ opacity: 0.9 }}>
                {boosterUI.status === 'ready' && 'READY'}
                {boosterUI.status === 'active' && `ACTIVE (${boosterUI.remainingSec.toFixed(1)}s)`}
                {boosterUI.status === 'cooldown' && `COOLDOWN (${boosterUI.remainingSec.toFixed(1)}s)`}
              </span>
            </div>
            <div style={gaugeWrapStyle}>
              <div style={gaugeFillStyle(boosterUI.status)} />
            </div>
            <div style={{ opacity: 0.8, fontSize: 11 }}>
              Shift 단발 트리거 · 지속 {HUD_PARAMS.BOOSTER_DURATION_SEC}s · 쿨다운 {HUD_PARAMS.BOOSTER_COOLDOWN_SEC}s
            </div>
          </div>
        </div>

        {/* 가운데: 모드 토글 & 속도 정보(기존 유지) */}
        <button 
          onClick={toggleFPS}
          style={{ padding: '6px 10px', borderRadius: 8, background: isFPS ? '#2d6cdf' : '#444', color: '#fff', border: 'none', cursor: 'pointer' }} 
          title="F 키로도 전환 가능"
        >
          {isFPS ? 'Switch to Original (F)' : 'Switch to FPS (F)'}
        </button>

        {isFPS && (
          <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            Speed: {fmtSpeed(approxSpeed)} ×{speedMul.toFixed(2)}
            {' '}<small>([-] / [+]) · Hover: LOCKED · Target AGL: {hoverRef.current.target} m (PgUp/PgDn)</small>
          </span>
        )}
      </div>

      {/* 3D 커서 HUD (추가) */}
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

      {/* 토스트 (추가) */}
      {toast && (
        <div style={{
          position: 'absolute', top: 84, left: 12, zIndex: 11,
          padding: '6px 10px', borderRadius: 10,
          background: 'rgba(20,20,20,0.8)', color: '#ffe680', fontSize: 12,
          border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)'
        }}>{toast}</div>
      )}

      {/* 미니맵 (추가) */}
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
        ref={viewerRef} full style={{ width: '100%', height: '100%' }}
        baseLayerPicker={false} timeline={false} animation={false} skyBox={false}
        skyAtmosphere={false} imageryProvider={false} terrainProvider={false}
        requestRenderMode={false} shouldAnimate
      >
        <Cesium3DTileset
          ref={tilesetRef}
          url={Cesium.IonResource.fromAssetId(MOON_ASSET_ID)}
        />
        
        {annotations.map((item) => {
          const key = `${item.category}-${item.name}`;
          if (item.category === 'apolloSite') {
            return (
              <Entity key={key} name={item.name} position={item.position}
                point={{
                  pixelSize: 10, color: Cesium.Color.RED,
                  outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
                }}
                label={{
                  text: item.name, font: '14px sans-serif', fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                  pixelOffset: new Cesium.Cartesian2(0, -15),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }}
                onClick={() => handleAnnotationClick(item)}
              />
            );
          } else if (item.category === 'geography') {
            return (
              <Entity key={key} name={item.name} position={item.position}
                point={{
                  pixelSize: 8, color: Cesium.Color.YELLOW,
                  outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
                }}
                label={{
                  text: item.name, font: '14px sans-serif', fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                  pixelOffset: new Cesium.Cartesian2(0, -12),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }}
                onClick={() => handleAnnotationClick(item)}
              />
            );
          }
          return null;
        })}

        {/* (추가) 저장 포인트 렌더 */}
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

      <AnnotationSidebar 
        annotation={selectedAnnotation}
        onClose={handleCloseModal}
      />
    </div>
  )
}
