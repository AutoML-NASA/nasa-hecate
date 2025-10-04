import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GlobeFPS from '../GlobeFPS'

// Mock Canvas component
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }) => <div data-testid="canvas">{children}</div>,
  useThree: () => ({
    camera: {},
    gl: { domElement: document.createElement('canvas') },
    scene: { traverse: vi.fn() }
  }),
  useFrame: vi.fn()
}))

// Mock drei components
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Stars: () => null,
  PerspectiveCamera: () => null
}))

// Mock child components
vi.mock('../Globe', () => ({
  default: () => null
}))

vi.mock('../Annotations', () => ({
  default: () => null
}))

vi.mock('../MoonMap2D', () => ({
  default: () => <div data-testid="moon-map-2d">2D Map</div>
}))

vi.mock('../FPSCamera', () => ({
  default: () => null
}))

describe('GlobeFPS Component', () => {
  test('renders without crashing', () => {
    const { container } = render(<GlobeFPS />)
    expect(container).toBeTruthy()
  })

  test('renders 3D view by default', () => {
    render(<GlobeFPS />)
    const canvas = screen.getByTestId('canvas')
    expect(canvas).toBeTruthy()
  })

  test('toggles to 2D view when button is clicked', () => {
    render(<GlobeFPS />)

    const toggleButton = screen.getByText('2D Map')
    fireEvent.click(toggleButton)

    expect(screen.getByTestId('moon-map-2d')).toBeTruthy()
    expect(screen.getByText('3D View')).toBeTruthy()
  })

  test('toggles back to 3D view', () => {
    render(<GlobeFPS />)

    // Switch to 2D
    const toggleButton = screen.getByText('2D Map')
    fireEvent.click(toggleButton)

    // Switch back to 3D
    const backButton = screen.getByText('3D View')
    fireEvent.click(backButton)

    expect(screen.getByTestId('canvas')).toBeTruthy()
    expect(screen.getByText('2D Map')).toBeTruthy()
  })

  test('toggle button has hover effects', () => {
    render(<GlobeFPS />)

    const toggleButton = screen.getByText('2D Map')
    expect(toggleButton.style.background).toBe('rgba(50, 50, 50, 0.8)')

    fireEvent.mouseEnter(toggleButton)
    expect(toggleButton.style.background).toBe('rgba(70, 70, 70, 0.9)')

    fireEvent.mouseLeave(toggleButton)
    expect(toggleButton.style.background).toBe('rgba(50, 50, 50, 0.8)')
  })
})
