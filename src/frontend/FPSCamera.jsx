// src/frontend/FPSCamera.jsx
import { useEffect, useRef } from 'react'
import { PerspectiveCamera } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * FPSCamera with Terrain Following
 * - 키보드(항상 "현재 시점" 기준):
 *   W/S: 전/후, A/D: 좌/우, Q/E: 업/다운, Z/C: 롤(반시계/시계)
 * - 마우스:
 *   Shift + 좌클릭 드래그: 카메라 시점 회전(yaw/pitch)
 *   좌클릭 드래그(Shift 없음): rotateTarget 회전(지구본처럼 직관적으로 회전)
 * - 마우스 휠: FOV 줌
 * - 지형 추종: 카메라가 바닥 위 일정 높이를 유지하며 이동
 * - 목표 지점으로 자동 이동: onWalkToPoint 콜백을 통해 특정 위치로 걸어가기
 */
export default function FPSCamera({
  initial = [0, 2, 6],
  speed = 1,
  walkSpeed = 2,              // 자동 이동 속도

  rotateTarget = null,

  // 구 내부 진입 방지
  blockSphere = false,
  collideSphereRef = null,
  sphereCenter = [0, 0, 0],
  sphereRadius = 2,
  padding = 0.06,

  // 지형 추종
  terrainFollow = true,       // 지형에 따라 높이 자동 조정
  terrainMeshes = [],         // 충돌 검사할 지형 메시 배열
  cameraHeight = 1.6,         // 바닥으로부터 카메라 높이 (사람 눈높이)
  maxTerrainDistance = 10,    // 레이캐스트 최대 거리

  // 자동 이동
  onWalkToPoint = null,       // (x, y, z) => void - 외부에서 호출할 함수를 부모에 전달

  // 카메라 파라미터
  fovInit = 60,
  near = 0.05,
  far = 1000,
}) {
  const cam = useRef()
  const { gl } = useThree()

  // ── 상태 refs ────────────────────────────────────────────────────────────────
  const fovRef = useRef(fovInit)
  const keysRef = useRef({
    forward: false, back: false, left: false, right: false,
    up: false, down: false, rollL: false, rollR: false,
  })
  const dragRef = useRef({ dragging: false, shift: false, lastX: 0, lastY: 0 })

  // 자동 이동 상태
  const walkToRef = useRef({
    active: false,
    target: new THREE.Vector3(),
    arrived: false,
  })

  const getRotateTarget = () => {
    if (!rotateTarget) return null
    return rotateTarget.isObject3D
      ? rotateTarget
      : rotateTarget.current?.isObject3D
      ? rotateTarget.current
      : null
  }

  // ── 외부에서 호출할 수 있는 walkTo 함수를 부모에 전달 ──────────────────────
  useEffect(() => {
    if (onWalkToPoint) {
      const walkTo = (x, y, z) => {
        walkToRef.current.active = true
        walkToRef.current.target.set(x, y, z)
        walkToRef.current.arrived = false
      }
      onWalkToPoint(walkTo)
    }
  }, [onWalkToPoint])

  // ── 마우스 드래그(시점 회전 / 타깃 회전) ─────────────────────────────────────
  useEffect(() => {
    const el = gl.domElement
    const sensLook = 0.003
    const sensObj  = 0.005

    const onMouseDown = (e) => {
      if (e.button !== 0) return
      dragRef.current.dragging = true
      dragRef.current.shift = e.shiftKey
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'
    }

    const onMouseMove = (e) => {
      if (!dragRef.current.dragging) return
      const dx = e.clientX - dragRef.current.lastX
      const dy = e.clientY - dragRef.current.lastY
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY

      if (dragRef.current.shift) {
        if (!cam.current) return
        cam.current.rotation.y -= dx * sensLook
        cam.current.rotation.x -= dy * sensLook
        const maxPitch = Math.PI / 2 - 0.05
        cam.current.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, cam.current.rotation.x))
      } else {
        const obj = getRotateTarget()
        if (!obj || !cam.current) return
        
        cam.current.updateMatrixWorld()
        
        const camRight = new THREE.Vector3().setFromMatrixColumn(cam.current.matrixWorld, 0).normalize()
        const camUp = new THREE.Vector3().setFromMatrixColumn(cam.current.matrixWorld, 1).normalize()
        
        obj.rotateOnWorldAxis(camUp, dx * sensObj)
        obj.rotateOnWorldAxis(camRight, dy * sensObj)
      }
    }

    const endDrag = () => {
      if (!dragRef.current.dragging) return
      dragRef.current.dragging = false
      dragRef.current.shift = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('mouseleave', endDrag)
    const preventCtx = (e) => e.preventDefault()
    el.addEventListener('contextmenu', preventCtx)

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('mouseleave', endDrag)
      el.removeEventListener('contextmenu', preventCtx)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [gl, rotateTarget])

  // ── 휠 줌(FOV) ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onWheel = (e) => {
      fovRef.current = Math.min(85, Math.max(25, fovRef.current + e.deltaY * 0.02))
      if (cam.current) {
        cam.current.fov = fovRef.current
        cam.current.updateProjectionMatrix()
      }
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // ── 키보드 + blur 리셋 ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = {
      KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
      KeyQ: 'up', KeyE: 'down', KeyZ: 'rollL', KeyC: 'rollR',
    }
    const down = (e) => { const k = map[e.code]; if (k) keysRef.current[k] = true }
    const up   = (e) => { const k = map[e.code]; if (k) keysRef.current[k] = false }
    const clearAll = () => { const ks = keysRef.current; for (const k in ks) ks[k] = false }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clearAll)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clearAll)
    }
  }, [])

  // ── 이동 계산용 벡터 ─────────────────────────────────────────────────────────
  const moveV   = useRef(new THREE.Vector3())
  const rightV  = useRef(new THREE.Vector3())
  const upV     = useRef(new THREE.Vector3())
  const fwdV    = useRef(new THREE.Vector3())
  const tmpV    = useRef(new THREE.Vector3())

  const worldCenter = useRef(new THREE.Vector3())
  const toCamV      = useRef(new THREE.Vector3())
  const scaleV      = useRef(new THREE.Vector3())

  // 레이캐스터 (지형 높이 감지용)
  const raycaster = useRef(new THREE.Raycaster())
  const downDir = useRef(new THREE.Vector3(0, -1, 0))

  // ── 지형 높이 감지 함수 ───────────────────────────────────────────────────────
  const getTerrainHeight = (position) => {
    if (!terrainFollow || !terrainMeshes.length) return null

    // 현재 위치에서 아래로 레이캐스트
    raycaster.current.set(
      new THREE.Vector3(position.x, position.y + maxTerrainDistance, position.z),
      downDir.current
    )

    const meshes = terrainMeshes.map(m => m.current || m).filter(Boolean)
    const intersects = raycaster.current.intersectObjects(meshes, true)

    if (intersects.length > 0) {
      return intersects[0].point.y
    }

    return null
  }

  // ── 프레임 루프 ─────────────────────────────────────────────────────────────
  useFrame((_, dt) => {
    if (!cam.current) return
    const k = keysRef.current

    // ── 자동 이동 처리 ──────────────────────────────────────────────────────────
    if (walkToRef.current.active && !walkToRef.current.arrived) {
      const currentPos = cam.current.position
      const targetPos = walkToRef.current.target
      const direction = tmpV.current.copy(targetPos).sub(currentPos)
      
      // 수평 거리만 체크 (Y축 제외)
      const horizontalDist = Math.sqrt(direction.x ** 2 + direction.z ** 2)
      
      if (horizontalDist < 0.1) {
        // 목표 지점 도착
        walkToRef.current.arrived = true
        walkToRef.current.active = false
      } else {
        // 목표를 향해 이동 (수평 방향만)
        const horizontalDir = new THREE.Vector3(direction.x, 0, direction.z).normalize()
        const step = Math.min(walkSpeed * dt, horizontalDist)
        currentPos.x += horizontalDir.x * step
        currentPos.z += horizontalDir.z * step
        
        // 목표 방향을 바라보도록 회전
        const angle = Math.atan2(direction.x, direction.z)
        cam.current.rotation.y = angle
      }
    }

    // ── 수동 키보드 이동 ────────────────────────────────────────────────────────
    let z = 0, x = 0, y = 0, rollDir = 0
    if (k.forward) z += 1
    if (k.back)    z -= 1
    if (k.left)    x -= 1
    if (k.right)   x += 1
    if (k.up)      y += 1
    if (k.down)    y -= 1
    if (k.rollL)   rollDir -= 1
    if (k.rollR)   rollDir += 1

    // 롤 회전
    if (rollDir !== 0) {
      const rollSpeed = 1.2
      cam.current.rotation.z += rollDir * rollSpeed * dt
    }

    // 이동
    if (x !== 0 || y !== 0 || z !== 0) {
      cam.current.updateMatrixWorld()
      rightV.current.setFromMatrixColumn(cam.current.matrixWorld, 0).normalize()
      upV.current.setFromMatrixColumn(cam.current.matrixWorld, 1).normalize()
      fwdV.current.setFromMatrixColumn(cam.current.matrixWorld, 2).multiplyScalar(-1).normalize()

      if (!isFinite(rightV.current.length()) || rightV.current.lengthSq() < 1e-6) {
        rightV.current.copy(tmpV.current.copy(fwdV.current).cross(upV.current)).normalize()
      }
      if (!isFinite(upV.current.length()) || upV.current.lengthSq() < 1e-6) {
        upV.current.copy(tmpV.current.copy(rightV.current).cross(fwdV.current)).normalize()
      }

      const mv = moveV.current.set(0, 0, 0)
        .addScaledVector(fwdV.current,  z)
        .addScaledVector(rightV.current, x)
        .addScaledVector(upV.current,    y)

      if (mv.lengthSq() > 1e-8) mv.normalize()

      const step = speed * dt
      const nextPos = new THREE.Vector3().copy(cam.current.position).addScaledVector(mv, step)

      // 구 외부 침투 방지
      if (blockSphere) {
        const sphere = getSphereWorldInfo(
          collideSphereRef,
          sphereCenter,
          sphereRadius,
          worldCenter.current,
          scaleV.current
        )
        if (sphere) {
          const minDist = sphere.radius + padding
          toCamV.current.copy(nextPos).sub(sphere.center)
          const dist = toCamV.current.length()
          
          if (dist < minDist) {
            if (dist < 1e-6) {
              toCamV.current.set(0, 0, 1)
            } else {
              toCamV.current.normalize()
            }
            nextPos.copy(sphere.center).addScaledVector(toCamV.current, minDist)
          }
        }
      }

      cam.current.position.copy(nextPos)
    }

    // ── 지형 추종: 바닥 높이에 따라 카메라 높이 조정 ──────────────────────────
    if (terrainFollow) {
      const terrainHeight = getTerrainHeight(cam.current.position)
      if (terrainHeight !== null) {
        // 부드러운 높이 전환 (lerp)
        const targetY = terrainHeight + cameraHeight
        cam.current.position.y += (targetY - cam.current.position.y) * 0.1
      }
    }
  })

  return (
    <PerspectiveCamera
      ref={cam}
      makeDefault
      position={initial}
      fov={fovRef.current}
      near={near}
      far={far}
    />
  )
}

/** 월드 기준 구의 center와 radius 계산 */
function getSphereWorldInfo(refOrNull, fallbackCenter, fallbackRadius, outCenter, outScale) {
  if (refOrNull?.current || refOrNull?.isObject3D) {
    const obj = refOrNull.current ?? refOrNull
    obj.updateWorldMatrix(true, false)
    obj.getWorldPosition(outCenter)

    let baseR = 1
    const geo = obj.geometry
    if (geo?.boundingSphere) baseR = geo.boundingSphere.radius
    else if (geo?.parameters?.radius) baseR = geo.parameters.radius

    obj.getWorldScale(outScale)
    const scaleMax = Math.max(outScale.x, outScale.y, outScale.z)
    const worldR = baseR * scaleMax
    return { center: outCenter, radius: worldR }
  }
  outCenter.set(fallbackCenter[0], fallbackCenter[1], fallbackCenter[2])
  return { center: outCenter, radius: fallbackRadius }
}