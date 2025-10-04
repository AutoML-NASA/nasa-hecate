#!/bin/bash
# Download and convert NASA moon textures for the project

ASSETS_DIR="public/assets"
mkdir -p "$ASSETS_DIR"

echo "Checking for moon textures..."

# Check if textures already exist
if [ -f "$ASSETS_DIR/lroc_color_poles_4k.jpg" ] && [ -f "$ASSETS_DIR/ldem_3_8bit.jpg" ]; then
    echo "✓ Textures already exist"
    exit 0
fi

echo "Downloading NASA moon textures (4K quality)..."

# Download color map (4K TIFF)
if [ ! -f "$ASSETS_DIR/lroc_color_poles_4k.jpg" ]; then
    echo "Downloading color map (4K)..."
    curl -o "$ASSETS_DIR/lroc_color_poles_4k.tif" \
        "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif"

    # Convert TIFF to JPG with maximum quality
    echo "Converting color map to JPG..."
    if command -v magick &> /dev/null; then
        magick convert "$ASSETS_DIR/lroc_color_poles_4k.tif" \
            -quality 95 "$ASSETS_DIR/lroc_color_poles_4k.jpg"
        rm "$ASSETS_DIR/lroc_color_poles_4k.tif"
        echo "✓ Color map ready"
    else
        echo "⚠ ImageMagick not found. Please convert the TIFF file manually or install ImageMagick"
    fi
fi

# Download displacement map (already in JPG format)
if [ ! -f "$ASSETS_DIR/ldem_3_8bit.jpg" ]; then
    echo "Downloading displacement map..."
    curl -o "$ASSETS_DIR/ldem_3_8bit.jpg" \
        "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg"
    echo "✓ Displacement map ready"
fi

echo ""
echo "✓ All textures downloaded and ready!"
echo "Files created in $ASSETS_DIR:"
ls -lh "$ASSETS_DIR"/*.jpg 2>/dev/null || echo "No JPG files found"
