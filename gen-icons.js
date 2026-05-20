const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, 'icon-source.png');

// mipmap sizes
const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Also generate adaptive icon foregrounds (108dp canvas, inner icon ~72dp)
const fgSizes = {
  'drawable-v24': { size: 108, name: 'ic_launcher_foreground' },
  // Also generate legacy launcher icons as round
};

async function main() {
  for (const [folder, size] of Object.entries(sizes)) {
    const dir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', folder);
    await sharp(src)
      .resize(size, size)
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(src)
      .resize(size, size)
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));
    console.log(`${folder} ${size}px ✓`);
  }

  // Adaptive icon foreground (108dp, content area ~72dp = 72px at xxxhdpi... actually mdpi baseline: 108px canvas, icon ~72px)
  const fgDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'drawable-v24');
  // Foreground: 108x108 dp → at mdpi that's 108px, icon should be ~72px centered
  const fgSize = 108;
  const iconSize = 72;
  const padding = (fgSize - iconSize) / 2;
  await sharp(src)
    .resize(iconSize, iconSize)
    .extend({
      top: Math.round(padding),
      bottom: Math.round(padding),
      left: Math.round(padding),
      right: Math.round(padding),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(path.join(fgDir, 'ic_launcher_foreground.png'));
  console.log(`drawable-v24/ic_launcher_foreground ${fgSize}px ✓`);

  console.log('\nAll icons generated!');
}

main().catch(console.error);
