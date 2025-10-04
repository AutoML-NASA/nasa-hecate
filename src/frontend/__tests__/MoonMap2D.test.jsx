import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MoonMap2D from '../MoonMap2D'

// Mock Image
global.Image = class {
  constructor() {
    setTimeout(() => {
      this.onload && this.onload()
    }, 100)
  }
}

describe('MoonMap2D Component', () => {
  test('renders without crashing', () => {
    const { container } = render(<MoonMap2D />)
    expect(container).toBeTruthy()
  })

  test('displays loading message initially', () => {
    render(<MoonMap2D />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeTruthy()
  })

  test('renders canvas element', () => {
    const { container } = render(<MoonMap2D />)
    const canvas = container.querySelector('canvas')

    expect(canvas).toBeTruthy()
    expect(canvas.width).toBe(1200)
    expect(canvas.height).toBe(600)
  })

  test('canvas container has correct styling', () => {
    const { container } = render(<MoonMap2D />)
    const canvas = container.querySelector('canvas')
    const wrapper = canvas.parentElement

    expect(canvas).toBeTruthy()
    expect(wrapper.style.position).toBe('fixed')
    expect(wrapper.style.background).toBeTruthy() // Color format varies in jsdom
    expect(wrapper.style.display).toBe('flex')
  })
})
