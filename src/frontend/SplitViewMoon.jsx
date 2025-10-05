// src/frontend/SplitViewMoon.jsx
import { useRef, useEffect, useState, useMemo } from 'react'
import { Viewer, Cesium3DTileset, Entity } from 'resium'
import * as Cesium from 'cesium'
import { useSplitViewSync } from './useSplitViewSync'

export default function SplitViewMoon({
  sliderPosition,          // App에서 0~100(%)로 들어옴
  setSliderPosition,
  isDragging,
  setIsDragging,
  annotations,
  onAnnotationClick,
  MOON_ASSET_ID,           // ex) 2684829  (3D Tiles)
  MOON_SR_ASSET_ID         // ex) 3851319  (보통 Imagery; 3D Tiles일 수도 있음)
}) {
  const viewerRef = useRef(null)       // 왼쪽 Viewer
  const tilesetRef = useRef(null)      // 왼쪽 Tileset

  const viewerSRRef = useRef(null)     // 오른쪽 Viewer
  const tilesetSRRef = useRef(null)    // 오른쪽 Tileset (기본은 좌측과 동일)
  const sliderRef = useRef(null)

  // 오른쪽에 붙이는 SR Imagery 레이어 참조 (제거/교체용)
  const srImageryLayerRef = useRef(null)

  // 카메라 동기화 (양방향)
  useSplitViewSync(true, viewerRef, viewerSRRef)

  // 퍼센트 보정 (혹시라도 0~1로 들어올 경우 대비)
  const leftWidthPct = useMemo(() => {
    const v = sliderPosition <= 1 ? sliderPosition * 100 : sliderPosition
    return Math.max(0, Math.min(100, v))
  }, [sliderPosition])

  // 오른쪽 Tileset이 무엇을 쓸지 동적으로 결정:
  // 1) 기본: 왼쪽과 같은 MOON_ASSET_ID (3D Tiles)
  // 2) 만약 MOON_SR_ASSET_ID를 Imagery로 붙이는 데 실패하면 → 3D Tiles로 간주하고 오른쪽 타일셋을 SR로 교체
  const [rightTilesAssetId, setRightTilesAssetId] = useState(MOON_ASSET_ID)

  // ======= 동적 SR 로딩 로직 =======
  useEffect(() => {
    let cancelled = false
    const rightViewer = viewerSRRef.current?.cesiumElement
    if (!rightViewer) return

    // 기존에 붙어 있던 SR 이미저리 제거
    try {
      if (srImageryLayerRef.current) {
        rightViewer.imageryLayers?.remove(srImageryLayerRef.current, true)
        srImageryLayerRef.current = null
      }
    } catch {}

    // 초기 상태: 오른쪽도 기본 타일셋으로 (비교가 깔끔)
    setRightTilesAssetId(MOON_ASSET_ID)

    // 1) 우선 "Imagery"로 시도
    ;(async () => {
      try {
        const provider = await Cesium.IonImageryProvider.fromAssetId(MOON_SR_ASSET_ID)
        const layer = await Cesium.ImageryLayer.fromProviderAsync(provider)
        if (cancelled) return
        rightViewer.imageryLayers.add(layer)           // ✅ 오른쪽에만 SR 이미저리 부착
        srImageryLayerRef.current = layer
        rightViewer.scene.requestRender?.()
      } catch (e) {
        // 2) 실패하면 "3D Tiles"로 간주하고 오른쪽 타일셋을 SR로 교체
        if (!cancelled) {
          setRightTilesAssetId(MOON_SR_ASSET_ID)
          rightViewer.scene.requestRender?.()
          // 콘솔에만 남겨두기
          console.warn('[SplitViewMoon] SR asset imagery attach failed; falling back to 3D Tiles:', e)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [MOON_ASSET_ID, MOON_SR_ASSET_ID])

  const renderAnnotations = () => annotations.map((item) => {
    if (!item?.position) return null
    const key = item.id || `${item.category}-${item.name}`

    let pointStyle, labelStyle
    if (item.category === 'apolloSite') {
      pointStyle = { pixelSize: 15, color: Cesium.Color.RED, disableDepthTestDistance: 50000 }
      labelStyle = { pixelOffset: new Cesium.Cartesian2(0, -15) }
    } else if (item.category === 'geography') {
      pointStyle = { pixelSize: 4, color: Cesium.Color.YELLOW, disableDepthTestDistance: 50000 }
      labelStyle = { pixelOffset: new Cesium.Cartesian2(0, -12) }
    } else if (item.category === 'userDefined') {
      pointStyle = { pixelSize: 4, color: Cesium.Color.LIME, disableDepthTestDistance: 50000 }
      labelStyle = { pixelOffset: new Cesium.Cartesian2(0, -12) }
    } else {
      return null
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
          disableDepthTestDistance: 50000,
        }}
        onClick={() => onAnnotationClick?.(item)}
      />
    )
  })

  return (
    <>
      {/* 왼쪽 Viewer — 기본 3D Tiles (MOON_ASSET_ID) */}
      <div style={{
        position: 'absolute', left: 0, top: 0,
        width: `${leftWidthPct}%`, height: '100%', overflow: 'hidden'
      }}>
        <Viewer
          ref={viewerRef}
          style={{ position: 'absolute', width: '100vw', height: '100vh' }}
          baseLayerPicker={false} timeline={false} animation={false} skyBox={false}
          skyAtmosphere={false} imageryProvider={false} terrainProvider={false}
          requestRenderMode={false} shouldAnimate
        >
          <Cesium3DTileset
            ref={tilesetRef}
            url={Cesium.IonResource.fromAssetId(MOON_ASSET_ID)}
          />
          {renderAnnotations()}
        </Viewer>

        {/* Label */}
        <div style={{
          position: 'absolute', bottom: 20, left: 20, zIndex: 5,
          padding: '8px 12px', borderRadius: 6,
          background: 'rgba(0,0,0,0.7)', color: '#fff',
          fontSize: 14, fontWeight: 'bold',
          border: '2px solid rgba(255,255,255,0.3)'
        }}>
          Original
        </div>
      </div>

      {/* 오른쪽 Viewer — 기본 3D Tiles + (가능하면) SR Imagery, 아니면 SR 3D Tiles */}
      <div style={{
        position: 'absolute', left: `${leftWidthPct}%`, top: 0,
        width: `${100 - leftWidthPct}%`, height: '100%', overflow: 'hidden'
      }}>
        <Viewer
          ref={viewerSRRef}
          // 오른쪽 Viewer는 내부적으로 전체폭 렌더링 후 왼쪽으로 슬라이더만큼 시프팅
          style={{ position: 'absolute', left: `-${leftWidthPct}vw`, width: '100vw', height: '100vh' }}
          baseLayerPicker={false} timeline={false} animation={false} skyBox={false}
          skyAtmosphere={false} imageryProvider={false} terrainProvider={false}
          requestRenderMode={false} shouldAnimate
        >
          <Cesium3DTileset
            ref={tilesetSRRef}
            url={Cesium.IonResource.fromAssetId(rightTilesAssetId)}
          />
          {renderAnnotations()}
        </Viewer>

        {/* Label */}
        <div style={{
          position: 'absolute', bottom: 20, right: 20, zIndex: 5,
          padding: '8px 12px', borderRadius: 6,
          background: 'rgba(0,0,0,0.7)', color: '#fff',
          fontSize: 14, fontWeight: 'bold',
          border: '2px solid rgba(59,130,246,0.6)'
        }}>
          Super Resolution
        </div>
      </div>

      {/* 슬라이더 */}
      <div
        ref={sliderRef}
        onMouseDown={() => setIsDragging?.(true)}
        style={{
          position: 'absolute',
          left: `${leftWidthPct}%`,
          top: 0,
          width: 4,
          height: '100%',
          background: 'linear-gradient(to bottom, rgba(59,130,246,0.8), rgba(147,51,234,0.8))',
          cursor: 'ew-resize',
          zIndex: 100,
          transform: 'translateX(-50%)',
          boxShadow: '0 0 10px rgba(0,0,0,0.5)'
        }}
      >
        {/* 핸들 */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 40,
          height: 40,
          background: 'rgba(59,130,246,0.9)',
          borderRadius: '50%',
          border: '3px solid white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          pointerEvents: 'none'
        }}>
          <div style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>⇄</div>
        </div>
      </div>
    </>
  )
}
