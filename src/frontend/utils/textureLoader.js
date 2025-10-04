// src/frontend/utils/textureLoader.js
// Utility to ensure NASA moon textures are available

const TEXTURE_FILES = {
  color: {
    path: '/assets/lroc_color_poles_4k.jpg',
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif',
    name: 'lroc_color_poles_4k.jpg'
  },
  displacement: {
    path: '/assets/ldem_3_8bit.jpg',
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg',
    name: 'ldem_3_8bit.jpg'
  }
}

async function checkTextureExists(path) {
  try {
    const response = await fetch(path, { method: 'HEAD' })
    return response.ok
  } catch (error) {
    return false
  }
}

async function downloadTexture(url, filename) {
  console.log(`Downloading ${filename} from NASA...`)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download ${filename}: ${response.statusText}`)
    }

    const blob = await response.blob()

    // For TIFF files, we need to convert them
    // Since we can't convert TIFF to JPG in the browser easily,
    // we'll use the JPG version directly when available
    return blob
  } catch (error) {
    console.error(`Error downloading ${filename}:`, error)
    throw error
  }
}

export async function ensureTexturesAvailable() {
  const status = {
    colorMap: await checkTextureExists(TEXTURE_FILES.color.path),
    displacementMap: await checkTextureExists(TEXTURE_FILES.displacement.path)
  }

  console.log('Texture availability:', status)

  if (!status.colorMap || !status.displacementMap) {
    console.warn('Moon textures not found. Please download them from NASA:')
    console.warn('Color map (4K): https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif')
    console.warn('Displacement map: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg')
    console.warn('Save them to public/assets/ and convert TIFF to JPG if needed.')

    // Return fallback or throw error
    return {
      available: false,
      missing: {
        colorMap: !status.colorMap,
        displacementMap: !status.displacementMap
      }
    }
  }

  return {
    available: true,
    paths: {
      colorMap: TEXTURE_FILES.color.path,
      displacementMap: TEXTURE_FILES.displacement.path
    }
  }
}

export function getTexturePaths() {
  return {
    colorMap: TEXTURE_FILES.color.path,
    displacementMap: TEXTURE_FILES.displacement.path
  }
}
