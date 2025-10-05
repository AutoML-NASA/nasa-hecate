import { useRef } from 'react'
import { Viewer, Cesium3DTileset, Entity } from 'resium'
import * as Cesium from 'cesium'
import { useSplitViewSync } from './useSplitViewSync'

export default function SplitViewMoon({
  sliderPosition,
  setSliderPosition,
  isDragging,
  setIsDragging,
  annotations,
  onAnnotationClick,
  MOON_ASSET_ID,
  MOON_SR_ASSET_ID
}) {
  const viewerRef = useRef(null)
  const tilesetRef = useRef(null)
  const viewerSRRef = useRef(null)
  const tilesetSRRef = useRef(null)
  const sliderRef = useRef(null)

  // Synchronize cameras between both viewers
  useSplitViewSync(true, viewerRef, viewerSRRef)

  const renderAnnotations = () => annotations.map((item) => {
    if (!item.position) return null
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
        onClick={() => onAnnotationClick(item)}
      />
    )
  })

  return (
    <>
      {/* Left Viewer - Original */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: `${sliderPosition}%`, height: '100%', overflow: 'hidden' }}>
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
          fontSize: 14, fontWeight: 'bold', border: '2px solid rgba(255,255,255,0.3)'
        }}>
          Original
        </div>
      </div>

      {/* Right Viewer - Super Resolution */}
      <div style={{ position: 'absolute', left: `${sliderPosition}%`, top: 0, width: `${100 - sliderPosition}%`, height: '100%', overflow: 'hidden' }}>
        <Viewer
          ref={viewerSRRef}
          style={{ position: 'absolute', left: `-${sliderPosition}vw`, width: '100vw', height: '100vh' }}
          baseLayerPicker={false} timeline={false} animation={false} skyBox={false}
          skyAtmosphere={false} imageryProvider={false} terrainProvider={false}
          requestRenderMode={false} shouldAnimate
        >
          <Cesium3DTileset
            ref={tilesetSRRef}
            url={Cesium.IonResource.fromAssetId(MOON_SR_ASSET_ID)}
          />
          {renderAnnotations()}
        </Viewer>
        {/* Label */}
        <div style={{
          position: 'absolute', bottom: 20, right: 20, zIndex: 5,
          padding: '8px 12px', borderRadius: 6,
          background: 'rgba(0,0,0,0.7)', color: '#fff',
          fontSize: 14, fontWeight: 'bold', border: '2px solid rgba(59,130,246,0.6)'
        }}>
          Super Resolution
        </div>
      </div>

      {/* Slider */}
      <div
        ref={sliderRef}
        onMouseDown={() => setIsDragging(true)}
        style={{
          position: 'absolute',
          left: `${sliderPosition}%`,
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
        {/* Slider handle */}
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
