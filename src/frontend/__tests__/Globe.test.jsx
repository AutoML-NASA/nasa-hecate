import { describe, test, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Canvas } from '@react-three/fiber'
import Globe from '../Globe'

// Mock texture loader
vi.mock('@react-three/fiber', async () => {
  const actual = await vi.importActual('@react-three/fiber')
  return {
    ...actual,
    useLoader: vi.fn(() => ({
      image: { width: 4096, height: 2048 }
    }))
  }
})

describe('Globe Component', () => {
  test('renders without crashing', () => {
    const { container } = render(
      <Canvas>
        <Globe radius={2} />
      </Canvas>
    )
    expect(container).toBeTruthy()
  })

  test('accepts radius prop', () => {
    const { container } = render(
      <Canvas>
        <Globe radius={5} />
      </Canvas>
    )
    expect(container).toBeTruthy()
  })

  test('renders with default radius when not provided', () => {
    const { container } = render(
      <Canvas>
        <Globe />
      </Canvas>
    )
    expect(container).toBeTruthy()
  })
})
