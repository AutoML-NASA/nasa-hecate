import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import SpaceBackground from './space.jsx' // 우주 배경

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <SpaceBackground />  {/* 화면 전체 우주 배경 */}

      {/* 내용 */}
      <div>
        <a href="https://vitejs.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      {/* 반응형 제목 */}
      <h1 className="hero">Hello World</h1>

      {/* (원하면 삭제해도 됨) */}
      <div className="card">
        <button onClick={() => setCount((c) => c + 1)}>
          count is {count}
        </button>
      </div>
    </>
  )
}

export default App
