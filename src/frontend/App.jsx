// src/frontend/App.jsx
import { useEffect, useRef, useState } from 'react'
import { Viewer, Cesium3DTileset, Entity } from 'resium'
import * as Cesium from 'cesium'
import Papa from 'papaparse'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import AnnotationSidebar from './AnnotationSidebar'
import './AnnotationSidebar.css'

// =========================
// HUD 파라미터
// =========================
const HUD_PARAMS = {
  BOOSTER_DURATION_SEC: 2,
  BOOSTER_COOLDOWN_SEC: 5,
  STOPWATCH_TICK_MS: 50,
}

// =========================
// Cesium 설정
// =========================
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjU0NDZjOC0xMWMwLTQ5ZWEtYTg5MC02NTljMmZiNWFiMzUiLCJpZCI6MzQ3MDUzLCJpYXQiOjE3NTk1NjU2ODZ9.yuChdxYa0oW-6WWuYXE_JMBhzd9DjzXRTcEX0cH4pD8'
const MOON_ASSET_ID = 2684829
Cesium.Ellipsoid.WGS84 = Cesium.Ellipsoid.MOON
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON

export default function MoonCesium() {
  const viewerRef = useRef(null)
  const tilesetRef = useRef(null)
  const containerRef = useRef(null)

  // --- State ---
  const [annotations, setAnnotations] = useState(() => {
    const savedData = localStorage.getItem('moonAnnotations');
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      return parsedData.map(item => ({
        ...item,
        position: item.lat != null && item.lon != null ? Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 100) : null
      }));
    }
    return [];
  });
  const [selectedAnnotation, setSelectedAnnotation] = useState(null)
  const [isFPS, setIsFPS] = useState(false)
  const [speedMul, setSpeedMul] = useState(1)

  // ✅ 추가/편집 모드
  const [isAddingMode, setIsAddingMode] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState(null)

  // --- Refs ---
  const keysRef = useRef(Object.create(null))
  const preRenderCbRef = useRef(null)
  const speedMulRef = useRef(1)
  useEffect(() => { speedMulRef.current = speedMul }, [speedMul])

  // 🚁 표면 위 호버(AGL) 제어 파라미터 & 스크래치
  const hoverRef = useRef({
    enabled: true,
    target: 1500,
    min: -500,     // (원본 유지)
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
  // ⏱️ 스톱워치
  // ================
  const [stopwatchUI, setStopwatchUI] = useState({ elapsedMs: 0, running: false })
  const stopwatchRef = useRef({
    running: false,
    baseElapsedMs: 0,
    startSec: null,
  })
  const nowSecRef = useRef(null)

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
  // ⚡ 부스터
  // ================
  const [boosterUI, setBoosterUI] = useState({ status: 'ready', progress: 1, remainingSec: 0 })
  const boosterRef = useRef({
    active: false,
    activateUntil: 0,
    cooldownUntil: 0,
  })
  const boosterTriggerRef = useRef(false)

  const fmtSpeed = (mps) => {
    if (mps >= 1_000_000) return `${(mps/1_000_000).toFixed(2)} Mm/s`
    if (mps >= 1_000) return `${(mps/1_000).toFixed(1)} km/s`
    return `${Math.round(mps)} m/s`
  }

  // ✅ annotations 변경 시 LocalStorage 자동 저장
  useEffect(() => {
    const dataToSave = annotations.map(({ position, ...rest }) => rest);
    localStorage.setItem('moonAnnotations', JSON.stringify(dataToSave));
  }, [annotations]);

  // ✅ 최초 진입 시 LocalStorage 없으면 기본 데이터 + CSV 로드
  useEffect(() => {
    if (annotations.length > 0) return;

    async function fetchInitialData() {
      const apolloData = [
        { id: 'apollo-11', name: 'Apollo 11', lat: 0.66413, lon: 23.46991, category: 'apolloSite', description: 'Mankind\'s first steps on the Moon.' },
        { id: 'apollo-17', name: 'Apollo 17', lat: 20.029, lon: 30.462, category: 'apolloSite', description: 'Final mission of the Apollo program.' },
      ];
      try {
        const response = await fetch('/data/annotations.csv');
        let csvData = [];
        if (response.ok) {
          const csvText = await response.text();
          const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true });
          csvData = parsed.data.map((item, index) => ({ ...item, id: `csv-${index}`, category: 'geography' }));
        }

        const combinedData = [...apolloData, ...csvData].map(item => ({
          ...item,
          position: item.lat != null && item.lon != null ? Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 100) : null
        })).filter(item => item.position);

        setAnnotations(combinedData);
      } catch (error) {
        console.error("초기 데이터 로딩 실패:", error);
        const fallbackData = apolloData.map(item => ({
          ...item,
          position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 100)
        }));
        setAnnotations(fallbackData);
      }
    }
    fetchInitialData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ 추가 시작
  const handleStartAddingAnnotation = () => {
    setIsAddingMode(true);
    if (isFPS) setIsFPS(false);
    setSelectedAnnotation(null);
    setEditingAnnotation(null);
    if (viewerRef.current?.cesiumElement) {
      viewerRef.current.cesiumElement.scene.canvas.style.cursor = 'crosshair';
    }
  };

  // ✅ 저장
  const handleSaveAnnotation = (updatedAnnotation) => {
    const finalAnnotation = {
      ...updatedAnnotation,
      id: updatedAnnotation.id?.startsWith?.('new-') ? `user-${Date.now()}` : updatedAnnotation.id,
      category: 'userDefined',
      position: Cesium.Cartesian3.fromDegrees(updatedAnnotation.lon, updatedAnnotation.lat, 100)
    };

    setAnnotations(prev => {
      const existingIndex = prev.findIndex(a => a.id === finalAnnotation.id);
      if (existingIndex > -1) {
        const newAnnotations = [...prev];
        newAnnotations[existingIndex] = finalAnnotation;
        return newAnnotations;
      } else {
        return [...prev, finalAnnotation];
      }
    });
    handleCloseModal();
  };

  // ✅ 클릭 시 플라이 및 보기 모드
  const handleAnnotationClick = (annotation) => {
    setSelectedAnnotation(annotation);
    setEditingAnnotation(null);
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const boundingSphere = new Cesium.BoundingSphere(annotation.position, 20000);
    viewer.camera.flyToBoundingSphere(boundingSphere, { duration: 2.0 });
  };

  const handleCloseModal = () => {
    setSelectedAnnotation(null);
    setEditingAnnotation(null);
  };

  // ✅ 추가 모드에서 캔버스 클릭 → 새 애노테이션 초안 생성
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((event) => {
      if (!isAddingMode) return;

      const pickedPosition = viewer.scene.pickPosition(event.position);
      if (Cesium.defined(pickedPosition)) {
        const carto = Cesium.Cartographic.fromCartesian(pickedPosition);
        const newAnno = {
          id: `new-${Date.now()}`,
          name: '새 지점',
          description: '',
          lat: Cesium.Math.toDegrees(carto.latitude),
          lon: Cesium.Math.toDegrees(carto.longitude),
          category: 'userDefined'
        };
        setEditingAnnotation(newAnno);
        setSelectedAnnotation(newAnno);
      }
      setIsAddingMode(false);
      viewer.scene.canvas.style.cursor = 'default';
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => { handler.destroy() };
  }, [isAddingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========= 원본의 좌표 찍기/카메라 초기화/타일 준비 =========
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
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    })()

    return () => { destroyed = true; handler.destroy() }
  }, [])

  // ========= FPS 토글 & 컨트롤 =========
  const toggleFPS = () => {
    setIsFPS(currentIsFPS => {
      if (!currentIsFPS && viewerRef.current?.cesiumElement) {
        viewerRef.current.cesiumElement.scene.canvas.requestPointerLock?.();
      }
      return !currentIsFPS;
    });
  };

  useEffect(() => { containerRef.current?.focus() }, [])

  useEffect(() => {
    const onToggle = (e) => {
      if (e.code === 'KeyF') toggleFPS();
    };
    window.addEventListener('keydown', onToggle);
    return () => window.removeEventListener('keydown', onToggle);
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const { scene, camera } = viewer
    const ellipsoid = Cesium.Ellipsoid.MOON
    const canvas = viewer.scene.canvas

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

      // hover target 500m로 세팅 후 시작 위치 이동
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

      // ⚡ 부스터 트리거
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
      let lastUIUpdateSec = 0
      const preRender = (_scn, time) => {
        // 시간
        let dt = 0
        if (lastTime) dt = Cesium.JulianDate.secondsDifference(time, lastTime)
        lastTime = time
        if (dt <= 0) return
        const nowSec = Cesium.JulianDate.toDate(time).getTime() / 1000
        nowSecRef.current = nowSec

        // 스톱워치
        if (stopwatchRef.current.running) {
          const elapsed = stopwatchRef.current.baseElapsedMs + (nowSec - (stopwatchRef.current.startSec ?? nowSec)) * 1000
          if (nowSec - lastUIUpdateSec > HUD_PARAMS.STOPWATCH_TICK_MS / 1000) {
            setStopwatchUI({ running: true, elapsedMs: elapsed })
          }
        }

        // 부스터
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

        // 이동/속도
        const k = keysRef.current
        const h = getHeight()

        let speed = Math.min(Math.max(h * 0.02, 200), 1_500_000) * speedMulRef.current
        speed *= speedMulRef.current // (원본 동작 유지)
        if (boosterRef.current.active) speed *= 5

        // 수평 방향
        const forwardDirection = new Cesium.Cartesian3()
        const rightDirection = new Cesium.Cartesian3()
        Cesium.Cartesian3.clone(camera.direction, forwardDirection)
        Cesium.Cartesian3.clone(camera.right, rightDirection)
        const up = ellipsoid.geodeticSurfaceNormal(camera.position)

        const upDotForward = Cesium.Cartesian3.dot(up, forwardDirection)
        const upComponent = Cesium.Cartesian3.multiplyByScalar(up, upDotForward, new Cesium.Cartesian3())
        Cesium.Cartesian3.subtract(forwardDirection, upComponent, forwardDirection)
        Cesium.Cartesian3.normalize(forwardDirection, forwardDirection)

        // 경사 페널티
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

        // 표면 법선 & AGL
        const carto = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
        if (!carto) return
        ellipsoid.geodeticSurfaceNormalCartographic(carto, scratch.normal)
        Cesium.Cartesian3.multiplyByScalar(scratch.normal, -1, scratch.down)

        let { agl, groundPos } = sampleGround(carto)
        if (agl === undefined || !groundPos) return

        const hover = hoverRef.current

        // 1차 침투 방지
        if (agl < hover.min) {
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.min, scratch.offs)
          Cesium.Cartesian3.add(groundPos, scratch.offs, camera.position)
          const carto2 = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
          const res2 = sampleGround(carto2)
          agl = res2.agl
          groundPos = res2.groundPos
        }

        // 상한 클램프
        if (agl > hover.max) {
          const delta = -(agl - hover.max)
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, delta, scratch.offs)
          Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)
          const carto3 = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
          const res3 = sampleGround(carto3)
          agl = res3.agl
          groundPos = res3.groundPos
        }

        if (agl <= hover.min + 50) { hover.isJumping = false }

        // 스프링 복원
        const err = Cesium.Math.clamp(hover.target - agl, -5000, 5000)
        const dynamicK = hover.k * (1 + Math.abs(err) / 500)
        hover.v += (dynamicK * err - hover.d * hover.v) * dt
        hover.v = Cesium.Math.clamp(hover.v, -3000, 3000)

        const dz = hover.v * dt
        Cesium.Cartesian3.multiplyByScalar(scratch.normal, dz, scratch.offs)
        Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)

        // 2차 침투 방지
        const carto4 = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
        const res4 = sampleGround(carto4)
        if (res4.agl !== undefined && res4.groundPos && res4.agl < hover.min) {
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.min, scratch.offs)
          Cesium.Cartesian3.add(res4.groundPos, scratch.offs, camera.position)
          hover.v = Math.max(0, hover.v)
        }

        // HUD(부스터/스톱워치)
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
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
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

  return (
    <div
      ref={containerRef} tabIndex={0}
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', zIndex: 0, background: 'black' }}
    >
      {/* HUD */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        {/* 좌측 스택: Mode + (FPS 전용) 스톱워치 + 부스터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            Mode: {isFPS ? 'FPS (W/A/S/D, Shift, Ctrl)' : 'Original (Mouse)'}
          </span>

          {/* 스톱워치 — FPS에서만 표시 */}
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

          {/* 부스터 게이지 */}
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

        {/* 가운데: 모드 토글 & 추가 버튼 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          <button
            onClick={toggleFPS}
            style={{ padding: '6px 10px', borderRadius: 8, background: isFPS ? '#2d6cdf' : '#444', color: '#fff', border: 'none', cursor: 'pointer' }}
            title="F 키로도 전환 가능"
          >
            {isFPS ? 'Switch to Original (F)' : 'Switch to FPS (F)'}
          </button>
          <button
            onClick={isAddingMode ? () => setIsAddingMode(false) : handleStartAddingAnnotation}
            style={{ padding: '6px 10px', borderRadius: 8, background: isAddingMode ? '#ef4444' : '#4a5568', color: '#fff', border: 'none', cursor: 'pointer', minWidth: 150 }}
          >
            {isAddingMode ? 'Cancel Adding' : 'Add Annotation'}
          </button>
        </div>

        {/* 우측: 속도 정보 (FPS에서만) */}
        {isFPS && (
          <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            Speed: {fmtSpeed(approxSpeed)} ×{speedMul.toFixed(2)}
            {' '}<small>([-] / [+]) · Hover: LOCKED · Target AGL: {hoverRef.current.target} m (PgUp/PgDn)</small>
          </span>
        )}
      </div>

      <Viewer
        ref={viewerRef} full
        baseLayerPicker={false} timeline={false} animation={false} skyBox={false}
        skyAtmosphere={false} imageryProvider={false} terrainProvider={false}
        requestRenderMode={false} shouldAnimate
      >
        <Cesium3DTileset
          ref={tilesetRef}
          url={Cesium.IonResource.fromAssetId(MOON_ASSET_ID)}
        />

        {/* ✅ 애노테이션 렌더링 */}
        {annotations.map((item) => {
          if (!item.position) return null;
          const key = item.id || `${item.category}-${item.name}`;

          let pointStyle, labelStyle;
          if (item.category === 'apolloSite') {
            pointStyle = { pixelSize: 15, color: Cesium.Color.RED };
            labelStyle = { pixelOffset: new Cesium.Cartesian2(0, -15) };
          } else if (item.category === 'geography') {
            pointStyle = { pixelSize: 4, color: Cesium.Color.YELLOW };
            labelStyle = { pixelOffset: new Cesium.Cartesian2(0, -12) };
          } else if (item.category === 'userDefined') {
            pointStyle = { pixelSize: 4, color: Cesium.Color.LIME };
            labelStyle = { pixelOffset: new Cesium.Cartesian2(0, -12) };
          } else {
            return null;
          }

          return (
            <Entity key={key} name={item.name} position={item.position}
              point={pointStyle}
              label={{
                text: item.name,
                font: '14px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                ...labelStyle,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }}
              onClick={() => handleAnnotationClick(item)}
            />
          );
        })}
      </Viewer>

      {/* ✅ 사이드바 (편집/저장 지원) */}
      <AnnotationSidebar
        annotation={selectedAnnotation}
        isEditing={!!editingAnnotation}
        onClose={handleCloseModal}
        onSave={handleSaveAnnotation}
      />
    </div>
  )
}
