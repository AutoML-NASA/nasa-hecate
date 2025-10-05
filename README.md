# NASA Space Apps - Hackathon

![GitHub contributors](https://img.shields.io/github/contributors/AutoML-NASA/nasa-hecate)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/AutoML-NASA/nasa-hecate)
[![GitHub issues](https://img.shields.io/github/issues/AutoML-NASA/nasa-hecate?color=%232da44e)](https://github.com/AutoML-NASA/nasa-hecate/issues)
[![GitHub closed pull requests](https://img.shields.io/github/issues-pr-closed/AutoML-NASA/nasa-hecate?color=%238250df)](https://github.com/AutoML-NASA/nasa-hecate/pulls)

### 구성원 (Study Member)
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/shinkm1104"><img src="https://avatars.githubusercontent.com/u/88845797?v=4" width="100px;" alt=""/><br /><sub><b>Kyoungmin Shin</b></sub></a><br /><a href="https://github.com/shinkm1104" title="Code">🏠</a></td>
    <td align="center"><a href="https://github.com/HaeSung-Oh"><img src="https://avatars.githubusercontent.com/u/86648139?v=4" width="100px;" alt=""/><br /><sub><b>Haesung Oh</b></sub></a><br /><a href="https://github.com/HaeSung-Oh" title="Code">🏠</a></td>
    <td align="center"><a href="https://github.com/Kim-Gyuil"><img src="https://avatars.githubusercontent.com/u/224922845?v=4" width="100px;" alt=""/><br /><sub><b>Gyu-Il Kim</b></sub></a><br /><a href="https://github.com/Kim-Gyuil" title="Code">🏠</a></td>
    <td align="center"><a href="https://github.com/Woni0204"><img src="https://avatars.githubusercontent.com/u/162476686?s=400&u=5c39ec579bab20a71034aa15cc222470cfc1cf06&v=4" width="100px;" alt=""/><br /><sub><b>Jeongwon Lee</b></sub></a><br /><a href="https://github.com/Woni0204" title="Code">🏠</a></td>
    <td align="center"><a href="https://github.com/KhrTim"><img src="https://avatars.githubusercontent.com/u/42896525?v=4" width="100px;" alt=""/><br /><sub><b>Timur Khairulov</b></sub></a><br /><a href="https://github.com/KhrTim" title="Code">🏠</a></td>
    <td align="center"><a href="https://github.com/StevenHSKim"><img src="https://avatars.githubusercontent.com/u/102468317?v=4" width="100px;" alt=""/><br /><sub><b>Haesung Kim</b></sub></a><br /><a href="https://github.com/StevenHSKim" title="Code">🏠</a></td>
  </tr>
</table>

# Hecate - Moon Exploration Pathfinder Game

Hecate is a hackathon project for NASA Space Apps Challenge 2025 (Seoul).
A lunar exploration game where players guide a rover to find optimal paths, add annotations, and enhance imagery with AI — inspired by the moon goddess Hecate, the guide at crossroads.

## Features

- **3D Moon Globe** - Interactive 3D visualization of the lunar surface with real NASA textures
  - LROC (Lunar Reconnaissance Orbiter Camera) 4K color mapping
  - LOLA (Lunar Orbiter Laser Altimeter) displacement mapping for realistic terrain
- **2D Map View** - Equirectangular projection with coordinate grid for navigation
- **View Toggle** - Seamless switching between 3D and 2D perspectives
- **FPS Camera Controls** - First-person navigation for immersive moon exploration
- **Annotations System** - Mark points of interest on the lunar surface
- **Path Optimization** - Find optimal rover paths across the moon's terrain

## Tech Stack

- **Frontend**: React 19 + Vite
- **3D Rendering**: Three.js + React Three Fiber
- **State Management**: Zustand
- **Backend / Infra**: AWS (for hosting, API handling)
- **Data Sources**:
  - [NASA Moon Trek API](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon)
  - [NASA SVS - Lunar Textures](https://svs.gsfc.nasa.gov/4720)
  - [Lunaserv](https://lunaserv.im-ldi.com/about.html)
  - Additional 3D/LiDAR datasets

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/AutoML-NASA/nasa-hecate.git
cd nasa-hecate

# Install dependencies
npm install

# Run development server
npm run dev
```

For remote access (SSH):
```bash
npm run dev -- --host
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Project Structure

```
nasa-hecate/
├── src/
│   └── frontend/
│       ├── Globe.jsx           # 3D moon sphere component
│       ├── MoonMap2D.jsx       # 2D map view component
│       ├── GlobeFPS.jsx        # Main scene with view toggle
│       ├── FPSCamera.jsx       # Camera controls
│       ├── Annotations.jsx     # Annotation system
│       ├── CompareView.jsx     # Image comparison tool
│       └── utils/              # Utility functions
├── public/
│   └── assets/
│       ├── lroc_color_poles_4k.jpg  # 4K moon color map
│       └── ldem_3_8bit.jpg          # Displacement/height map
└── .github/
    └── workflows/
        └── ci-test.yml         # CI for linting and builds
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits:
   - Format: `<type>(scope): <description>`
   - Types: `add`, `fix`, `docs`, `refactor`, `test`
   - Example: `add(map): implement 2D moon surface view`
4. Push to your branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

