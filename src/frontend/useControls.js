// src/useControls.js
import { create } from 'zustand'

export const useControls = create((set) => ({
  // 키보드 상태
  keys: { forward: false, back: false, left: false, right: false, up: false, down: false },
  setKey: (code, pressed) => {
    const mapping = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back',    ArrowDown: 'back',
      KeyA: 'left',    ArrowLeft: 'left',
      KeyD: 'right',   ArrowRight: 'right',
      Space: 'up',     ShiftLeft: 'down', ShiftRight: 'down',
    }
    const k = mapping[code]
    if (!k) return
    set((s) => ({ keys: { ...s.keys, [k]: pressed } }))
  },

  // 휠 줌(FOV)
  fov: 60,
  setFov: (f) => set({ fov: Math.min(85, Math.max(25, f)) }),

  // 포인터락 상태
  locked: false,
  setLocked: (v) => set({ locked: v }),
}))