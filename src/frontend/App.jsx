// src/frontend/App.jsx
import { useEffect, useRef, useState } from 'react'
import { Viewer, Cesium3DTileset, Entity } from 'resium'
import * as Cesium from 'cesium'
import Papa from 'papaparse'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 💡 AnnotationSidebar.jsx, AnnotationSidebar.css 파일이 필요합니다.
import AnnotationSidebar from './AnnotationSidebar'
import './AnnotationSidebar.css'

// ⛽️ Ion 토큰
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjU0NDZjOC0xMWMwLTQ5ZWEtYTg5MC02NTljMmZiNWFiMzUiLCJpZCI6MzQ3MDUzLCJpYXQiOjE3NTk1NjU2ODZ9.yuChdxYa0oW-6WWuYXE_JMBhzd9DjzXRTcEX0cH4pD8'
const MOON_ASSET_ID = 2684829

// 🌕 달 좌표계 사용
Cesium.Ellipsoid.WGS84 = Cesium.Ellipsoid.MOON
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON

export default function MoonCesium() {
  const viewerRef = useRef(null)
  const tilesetRef = useRef(null)
  const containerRef = useRef(null)

  // --- State ---
  const [isFPS, setIsFPS] = useState(false)
  const [annotations, setAnnotations] = useState([])
  const [selectedAnnotation, setSelectedAnnotation] = useState(null)
  const [speedMul, setSpeedMul] = useState(1)

  // --- Refs ---
  const keysRef = useRef(Object.create(null))
  const preRenderCbRef = useRef(null)
  const speedMulRef = useRef(1)

  // 🚁 표면 위 호버(AGL) 제어 파라미터 & 스크래치 (원본 FPS 코드 기준)
  const hoverRef = useRef({
    enabled: true,
    target: 1500,
    min: 300,
    max: 6000,
    k: 1.0,
    d: 8,
    v: 0,
    isJumping: false
  })
  const scratch = useRef({
    normal: new Cesium.Cartesian3(),
    down:   new Cesium.Cartesian3(),
    offs:   new Cesium.Cartesian3(),
    surf:   new Cesium.Cartesian3(),
    groundCarto: new Cesium.Cartographic()
  }).current

  useEffect(() => { speedMulRef.current = speedMul }, [speedMul])

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
    const onToggle = (e) => { if (e.code === 'KeyF') setIsFPS(v => !v) }
    window.addEventListener('keydown', onToggle)
    return () => window.removeEventListener('keydown', onToggle)
  }, [])

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

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return
    const { scene, camera } = viewer
    const ellipsoid = Cesium.Ellipsoid.MOON

    if (isFPS) hoverRef.current.enabled = true
    
    if (isFPS) {
      const canvas = viewer.scene.canvas
      canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock

      const lockPointer = () => canvas.requestPointerLock()
      canvas.addEventListener('click', lockPointer)

      const onMouseMove = (e) => {
        if (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas || document.webkitPointerLockElement === canvas) {
          const sensitivity = 0.002
          camera.lookLeft(-e.movementX * sensitivity)
          camera.lookUp(-e.movementY * sensitivity)
          camera.setView({
            orientation: { heading: camera.heading, pitch: camera.pitch, roll: 0 }
          })
        }
      }

      const onPointerLockChange = () => {
        if (!document.pointerLockElement && !document.mozPointerLockElement && !document.webkitPointerLockElement) {
          setIsFPS(false)
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('pointerlockchange', onPointerLockChange)
      document.addEventListener('mozpointerlockchange', onPointerLockChange)
      document.addEventListener('webkitpointerlockchange', onPointerLockChange)
      
      const startLon = 23.46991, startLat = 0.66413
      const carto = new Cesium.Cartographic(
        Cesium.Math.toRadians(startLon), Cesium.Math.toRadians(startLat), hoverRef.current.target
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
      if (e.code === 'Space' && isFPS && !hoverRef.current.isJumping) {
        hoverRef.current.v = 800
        hoverRef.current.isJumping = true
        e.preventDefault()
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
        scratch.groundCarto.latitude  = carto.latitude
        scratch.groundCarto.height    = groundH
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
      const preRender = (_scn, time) => {
        let dt = 0
        if (lastTime) dt = Cesium.JulianDate.secondsDifference(time, lastTime)
        lastTime = time
        if (dt <= 0) return

        const k = keysRef.current
        const h = getHeight()
        let speed = Math.min(Math.max(h * 0.02, 200), 1_500_000) * speedMulRef.current
        if (k.ShiftLeft || k.ShiftRight) speed *= 5
        const amt = speed * dt

        if (k.KeyW || k.ArrowUp)    camera.moveForward(amt)
        if (k.KeyS || k.ArrowDown)  camera.moveBackward(amt)
        if (k.KeyA || k.ArrowLeft)  camera.moveLeft(amt)
        if (k.KeyD || k.ArrowRight) camera.moveRight(amt)
        if (k.ControlLeft || k.ControlRight) camera.moveDown(amt)

        const carto = Cesium.Cartographic.fromCartesian(camera.position, ellipsoid)
        if (!carto) return
        ellipsoid.geodeticSurfaceNormalCartographic(carto, scratch.normal)

        let { agl, groundPos } = sampleGround(carto)
        if (agl === undefined || !groundPos) return

        const hover = hoverRef.current
        
        if (agl < hover.min) {
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.min, scratch.offs)
          Cesium.Cartesian3.add(groundPos, scratch.offs, camera.position)
          const res2 = sampleGround(Cesium.Cartographic.fromCartesian(camera.position, ellipsoid))
          if (res2.agl !== undefined) agl = res2.agl
          if (res2.groundPos) groundPos = res2.groundPos
        }

        if (agl > hover.max) {
          const delta = -(agl - hover.max)
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, delta, scratch.offs)
          Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)
          const res3 = sampleGround(Cesium.Cartographic.fromCartesian(camera.position, ellipsoid))
          if (res3.agl !== undefined) agl = res3.agl
          if (res3.groundPos) groundPos = res3.groundPos
        }

        if (agl <= hover.min + 50) hover.isJumping = false

        const err = Cesium.Math.clamp(hover.target - agl, -5000, 5000)
        hover.v += (hover.k * err - hover.d * hover.v) * dt
        Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.v * dt, scratch.offs)
        Cesium.Cartesian3.add(camera.position, scratch.offs, camera.position)

        const res4 = sampleGround(Cesium.Cartographic.fromCartesian(camera.position, ellipsoid))
        if (res4.agl !== undefined && res4.groundPos && res4.agl < hover.min) {
          Cesium.Cartesian3.multiplyByScalar(scratch.normal, hover.min, scratch.offs)
          Cesium.Cartesian3.add(res4.groundPos, scratch.offs, camera.position)
          hover.v = Math.max(0, hover.v)
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
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('pointerlockchange', onPointerLockChange)
        document.removeEventListener('mozpointerlockchange', onPointerLockChange)
        document.removeEventListener('webkitpointerlockchange', onPointerLockChange)
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

  const approxSpeed = (() => {
    if (!viewerRef.current?.cesiumElement) return 0
    const carto = Cesium.Cartographic.fromCartesian(viewerRef.current.cesiumElement.camera.position, Cesium.Ellipsoid.MOON)
    const h = carto?.height ?? 1
    return Math.min(Math.max(h * 0.02, 200), 1_500_000) * speedMul
  })()

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
        position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
          Mode: {isFPS ? 'FPS (W/A/S/D, Shift, Space, Ctrl)' : 'Original (Mouse)'}
        </span>
        <button onClick={() => setIsFPS(v => !v)} style={{ padding: '6px 10px', borderRadius: 8, background: isFPS ? '#2d6cdf' : '#444', color: '#fff', border: 'none', cursor: 'pointer' }} title="F 키로도 전환 가능">
          {isFPS ? 'Switch to Original (F)' : 'Switch to FPS (F)'}
        </button>
        {isFPS && (
          <span style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            Speed: {fmtSpeed(approxSpeed)} ×{speedMul.toFixed(2)}
            {' '}<small>([-] / [+]) · Hover: LOCKED · Target AGL: {hoverRef.current.target} m (PgUp/PgDn)</small>
          </span>
        )}
      </div>

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
      </Viewer>

      <AnnotationSidebar 
        annotation={selectedAnnotation}
        onClose={handleCloseModal}
      />
    </div>
  )
}