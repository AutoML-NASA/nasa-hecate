# NASA Moon Textures

This directory contains high-quality moon surface textures from NASA's Scientific Visualization Studio.

## Setup

The textures are automatically downloaded when you run `npm install` or you can manually run:

```bash
npm run setup
```

## Downloaded Files

The script will download and prepare:

1. **Color Map** (`lroc_color_poles_4k.jpg`) - 4K resolution moon surface texture
   - Source: NASA Lunar Reconnaissance Orbiter Camera (LROC)
   - Resolution: 4096 x 2048 pixels
   - Format: JPG (converted from TIFF)

2. **Displacement Map** (`ldem_3_8bit.jpg`) - Elevation/height map for 3D terrain
   - Source: Lunar Orbiter Laser Altimeter (LOLA)
   - Resolution: 1024 x 512 pixels
   - Format: JPG

## Data Source

All textures are sourced from:
- **NASA Scientific Visualization Studio**: https://svs.gsfc.nasa.gov/4720
- **CGI Moon Kit**: High-resolution maps designed for 3D rendering

## License

These textures are provided by NASA and are in the public domain.

## Manual Download

If automatic download fails, you can manually download:

1. Color map: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif
2. Displacement map: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg

Then convert the TIFF to JPG using ImageMagick:
```bash
magick convert lroc_color_poles_4k.tif -quality 95 lroc_color_poles_4k.jpg
```
