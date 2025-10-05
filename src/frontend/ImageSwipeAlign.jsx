// src/frontend/ImageSwipeAlign.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react'

export default function ImageSwipeAlign({
  src1,
  src2,
  roi1,
  roi2,
  padding = 20,
  sliderPct: sliderPctProp = 50,
  onChangePct,
  label1 = 'Image 1',
  label2 = 'Image 2',
  height = '100vh',
  background = '#000',
}) {
  const wrapRef = useRef(null)
  const [nat1, setNat1] = useState({ w: 0, h: 0 })
  const [nat2, setNat2] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const [sliderPct, setSliderPct] = useState(sliderPctProp ?? 50)

  useEffect(() => { setSliderPct(sliderPctProp ?? 50) }, [sliderPctProp])

  useEffect(() => {
    const i1 = new Image()
    const i2 = new Image()
    i1.onload = () => setNat1({ w: i1.naturalWidth, h: i1.naturalHeight })
    i2.onload = () => setNat2({ w: i2.naturalWidth, h: i2.naturalHeight })
    i1.src = src1
    i2.src = src2
  }, [src1, src2])

  const [vw, vh] = useContainerSize(wrapRef, height)

  const target = useMemo(() => {
    if (!vw || !vh) return null
    const tw = Math.max(10, vw - padding * 2)
    const th = Math.max(10, vh - padding * 2)
    return { x: padding, y: padding, w: tw, h: th }
  }, [vw, vh, padding])

  // ✅ roi가 없으면 전체 이미지로 간주
  const effRoi1 = useMemo(() => roi1 ?? (nat1.w && nat1.h ? { x:0, y:0, w:nat1.w, h:nat1.h } : null), [roi1, nat1])
  const effRoi2 = useMemo(() => roi2 ?? (nat2.w && nat2.h ? { x:0, y:0, w:nat2.w, h:nat2.h } : null), [roi2, nat2])

  const t1 = useMemo(() => (!target || !effRoi1) ? ID : fitRoiToTarget(effRoi1, target), [effRoi1, target])
  const t2 = useMemo(() => (!target || !effRoi2) ? ID : fitRoiToTarget(effRoi2, target), [effRoi2, target])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width)
      const pct = +(x / rect.width * 100).toFixed(2)
      setSliderPct(pct)
      onChangePct?.(pct)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, onChangePct])

  return (
    <div ref={wrapRef} style={{ position:'relative', width:'100%', height, background, overflow:'hidden', userSelect:'none' }}>
      {/* 아래: after */}
      <img
        src={src2}
        alt="After"
        draggable={false}
        style={{ position:'absolute', left:0, top:0, transform: cssTransform(t2), transformOrigin:'top left', willChange:'transform', pointerEvents:'none' }}
      />
      {/* 위: before (clip) */}
      <div style={{ position:'absolute', inset:0, clipPath:`polygon(0 0, ${sliderPct}% 0, ${sliderPct}% 100%, 0% 100%)` }}>
        <img
          src={src1}
          alt="Before"
          draggable={false}
          style={{ position:'absolute', left:0, top:0, transform: cssTransform(t1), transformOrigin:'top left', willChange:'transform', pointerEvents:'none' }}
        />
      </div>

      {/* 라벨 */}
      <Badge text={label1} style={{ left:12 }} />
      <Badge text={label2} style={{ right:12 }} />

      {/* 슬라이더 */}
      <div
        onMouseDown={() => setDragging(true)}
        style={{ position:'absolute', top:0, bottom:0, left:`calc(${sliderPct}% - 6px)`, width:12, cursor:'ew-resize', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center' }}
      >
        <div style={{ width:4, height:'50%', background:'rgba(255,255,255,0.95)', borderRadius:4, boxShadow:'0 0 12px rgba(0,0,0,0.4)' }} />
      </div>
    </div>
  )
}

/* utils */
const ID = { scale:1, tx:0, ty:0 }
function cssTransform({ scale, tx, ty }) { return `translate(${tx}px, ${ty}px) scale(${scale})` }
function fitRoiToTarget(roi, target) {
  const s = Math.min(target.w / roi.w, target.h / roi.h)
  return { scale: s, tx: target.x - roi.x * s, ty: target.y - roi.y * s }
}
function useContainerSize(ref, height) {
  const [size, set] = useState([0, 0])
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => set([el.clientWidth, typeof height === 'number' ? height : el.clientHeight]))
    ro.observe(el); set([el.clientWidth, typeof height === 'number' ? height : el.clientHeight])
    return () => ro.disconnect()
  }, [ref, height])
  return size
}
function Badge({ text, style }) {
  return (
    <div style={{ position:'absolute', bottom:16, ...style, zIndex:9, padding:'6px 10px', borderRadius:8, background:'rgba(0,0,0,0.7)', color:'#fff', fontSize:12, border:'1px solid rgba(255,255,255,0.25)', backdropFilter:'blur(4px)' }}>
      {text}
    </div>
  )
}
