# Icon source files

The PNGs in `icons/` are exported from these SVGs. Edit the SVG, then re-export to PNG at 16, 32, 48, and 128 px.

## Re-export with ImageMagick

```bash
cd icons/source
for size in 16 32 48 128; do
  magick -background none eye.svg     -resize ${size}x${size} ../icon${size}.png
  magick -background none eye_red.svg -resize ${size}x${size} ../icon${size}_red.png
done
```

## Re-export with Inkscape

```bash
cd icons/source
for size in 16 32 48 128; do
  inkscape eye.svg     -o ../icon${size}.png     -w ${size} -h ${size}
  inkscape eye_red.svg -o ../icon${size}_red.png -w ${size} -h ${size}
done
```

## Two-state design

- `eye.svg` — default / idle icon (blue iris)
- `eye_red.svg` — recording icon (red iris + recording dot in upper-right)

`background.js` (`setBadge`) swaps between the two icon sets based on whether a recording session is active.
