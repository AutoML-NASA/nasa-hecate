// src/FPSCamera.jsx
import { useEffect, useRef } from 'react'
import { PerspectiveCamera } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function FPSCamera({
  initial = [0, 2, 6],                                              // 카메라의 시작 위치 [x, y, z]
  speed = 10,                                                       // 이동 속도 (초당 Scene 단위)
  moveMode = 'view',                                                // 'yaw' | 'view', 두 가지 모드 제공(yaw : 바라보는 방향의 수평 성분만 적용, view : 실제 바라보는 3D 방향으로 전진 및 후진 가능)
}) {
  const cam = useRef()
  const { gl } = useThree()

  const fovRef = useRef(60)                                         // fovRef: 현재 시야각(FOV, degree)을 저장. 휠 줌으로 가변
  const keysRef = useRef({                                          // 키 입력 상태를 저장하는 ref (렌더 루프에서 읽은 후 이벤트에서 갱신함)
    forward: false,
    back: false,
    left: false,
    right: false,
  })
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 })   // 마우스 드래그 상태 저장: 드래그 중 여부와 마지막 커서 좌표

  // 마우스 드래그로 시점 회전 (마우스 좌클릭 유지 + 이동)
  useEffect(() => {
    const el = gl.domElement
    const sens = 0.003                                              // 민감도: "픽셀 이동 1"당 회전 Radian 약 0.003

    const onMouseDown = (e) => {
      if (e.button !== 0) return                                    // 좌클릭(버튼 0)만 회전 시작
      dragRef.current.dragging = true
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
      // 드래그 중 텍스트 선택/커서 모양 변경으로 UX 개선
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'
    }

    const onMouseMove = (e) => {                                    // 드래그 중 텍스트 선택/커서 모양 변경으로 UX 개선
      if (!dragRef.current.dragging || !cam.current) return
      // 이전 프레임 대비 마우스 이동량(픽셀)
      const dx = e.clientX - dragRef.current.lastX
      const dy = e.clientY - dragRef.current.lastY
      // 현재 위치를 다음 비교를 위해 저장
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY

      // yaw(좌우 회전): y축 회전값에서 dx * 감도 만큼 빼줌(우측으로 움직이면 오른쪽 보기)
      cam.current.rotation.y -= dx * sens
      // pitch(상하 회전): x축 회전값에서 dy * 감도 만큼 빼줌(위로 움직이면 위 바라봄)
      cam.current.rotation.x -= dy * sens
      
      // pitch 과도 회전 방지: 카메라가 완전히 뒤집히지 않도록 상/하한 제한
      const maxPitch = Math.PI / 2 - 0.05
      cam.current.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, cam.current.rotation.x))
    }

    const endDrag = () => {
      if (!dragRef.current.dragging) return
      dragRef.current.dragging = false
      // 드래그 종료 시 스타일 복원
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    // 이벤트 바인딩
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('mouseleave', endDrag)

    // 우클릭 컨텍스트 메뉴 비활성화(드래그 중 우클릭 등으로 UX 방해 방지용)
    const preventCtx = (e) => e.preventDefault()
    el.addEventListener('contextmenu', preventCtx)

    // 클린업: 컴포넌트 언마운트/리렌더 시 핸들러 제거
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('mouseleave', endDrag)
      el.removeEventListener('contextmenu', preventCtx)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [gl])

  // 마우스 휠로 FOV(시야각) 줌인/줌아웃
  useEffect(() => {
    const onWheel = (e) => {
      // deltaY > 0(아래로 스크롤) → FOV 증가(줌 아웃), deltaY < 0 → FOV 감소(줌 인)
      // 25° ~ 85° 사이로 클램프하여 과도한 왜곡/망원 방지
      fovRef.current = Math.min(85, Math.max(25, fovRef.current + e.deltaY * 0.02))
      if (cam.current) {
        cam.current.fov = fovRef.current
        cam.current.updateProjectionMatrix()                        // FOV 바뀌면 투영행렬 갱신 필수
      }
    }
    // passive: true → 스크롤 성능 최적화(기본 동작 취소 안 함)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    // 코드 → 동작 매핑. 여러 키를 같은 동작에 매핑(W/↑ 등)
    const map = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back',    ArrowDown: 'back',
      KeyA: 'left',    ArrowLeft: 'left',
      KeyD: 'right',   ArrowRight: 'right',
      Space: 'up',
    }
    // keydown: 해당 동작을 true로 설정(누르고 있는 동안 지속 이동)
    const down = (e) => { const k = map[e.code]; if (k) keysRef.current[k] = true }
    // keyup: 키를 뗄 때 false로 설정
    const up   = (e) => { const k = map[e.code]; if (k) keysRef.current[k] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // 이동 계산에 사용할 재사용 벡터들(할당 최소화로 GC 줄임)
  const forwardV = useRef(new THREE.Vector3())                      // 카메라가 바라보는 방향(전방)
  const rightV = useRef(new THREE.Vector3())                        // 전방 × up의 외적 → 오른쪽 방향
  const moveV = useRef(new THREE.Vector3())                         // 프레임 내 최종 이동 벡터

  // 매 프레임마다 이동 처리
  useFrame((_, dt) => {
    if (!cam.current) return
    const k = keysRef.current

    // 입력을 스칼라로 합성(앞/뒤 z, 좌/우 x, 위 y)
    let z = 0, x = 0, y = 0
    if (k.forward) z += 1
    if (k.back)    z -= 1
    if (k.left)    x -= 1
    if (k.right)   x += 1

    // 입력이 없으면 연산 스킵
    if (x === 0 && y === 0 && z === 0) return

    // f: 전방, r: 오른쪽(둘 다 정규화 예정)
    const f = forwardV.current
    const r = rightV.current

    // 카메라가 실제로 "보는 방향"을 f에 채움(월드 좌표계 기준)
    cam.current.getWorldDirection(f)
    if (moveMode === 'yaw') {
      // yaw 모드: 상하 기울기는 무시하고 수평 성분만으로 전/후 이동(FPS 전형)
      f.y = 0
      f.normalize()
    }
    // 오른쪽 벡터 = 전방 × up (오른손 좌표계 기준 외적)
    r.copy(f).cross(cam.current.up).normalize()

    // 이동 벡터 합성: 전방/오른쪽 성분을 입력과 가중합
    const mv = moveV.current
    mv.set(0, 0, 0)
      .addScaledVector(f, z)
      .addScaledVector(r, x)
    // 대각 이동 시 속도 과도 증가 방지(정규화)
    if (mv.lengthSq() > 1e-8) mv.normalize()

    // 프레임 독립 이동량 s = speed(단위/초) * dt(초) = 이번 프레임 이동 거리
    const s = speed * dt
    // 수평(그리고 yaw 모드일 땐 순수 수평) 이동 적용
    cam.current.position.addScaledVector(mv, s)

    // y축 이동 처리
    if (moveMode === 'view') {
      // view 모드:
      //  - 전/후 입력 z에 따라 f의 y성분도 반영되어 경사면을 따라 오르내리듯 이동
      cam.current.position.y += f.y * z * s + y * (speed * 0.6) * dt
    } else {
      // yaw 모드:
      //  - 전/후 이동은 수평면에서만 일어나고,
      cam.current.position.y += y * (speed * 0.6) * dt
    }
  })
  // PerspectiveCamera:
  //  - ref={cam}로 three.js 카메라 인스턴스를 획득
  //  - makeDefault: 이 카메라를 scene의 기본 카메라로 설정
  //  - position={initial}: 시작 위치(예: [0, 2, 6] → 원점에서 y=2m 높이, z=+6m 뒤)
  //  - fov={fovRef.current}: 초기 시야각(휠로 변경 가능)
  return <PerspectiveCamera ref={cam} makeDefault position={initial} fov={fovRef.current} />
}
