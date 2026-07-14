/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SVG_PATH = path.join(__dirname, '../public/favicon.svg');
const OUTPUT_DIR = path.join(__dirname, '../public/android-assets');

// Standard Android density launcher sizes
const LAUNCHER_SIZES = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 },
  { name: 'play-store-icon', size: 512 }
];

// Adaptive icon sizes (standard size is 108dp, at xxxhdpi this is 432x432 px)
const ADAPTIVE_SIZE = 432;

async function generateAssets() {
  console.log('🚀 Starting Android Premium Icon Asset Generation...');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Read the master vector SVG
  const svgBuffer = fs.readFileSync(SVG_PATH);

  // 1. Generate legacy launcher PNGs for each standard density
  for (const item of LAUNCHER_SIZES) {
    const destDir = path.join(OUTPUT_DIR, item.name);
    if (!fs.existsSync(destDir) && item.name !== 'play-store-icon') {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const outputFilename = item.name === 'play-store-icon' 
      ? 'ic_launcher_play_store.png'
      : `${item.name}/ic_launcher.png`;

    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    await sharp(svgBuffer)
      .resize(item.size, item.size)
      .png()
      .toFile(outputPath);

    console.log(`✅ Exported standard launcher size ${item.size}x${item.size} to: ${outputFilename}`);
  }

  // 2. Generate Adaptive Icon Background (Solid cosmic dark blue-grey matching theme)
  const bgPath = path.join(OUTPUT_DIR, 'ic_launcher_background.png');
  await sharp({
    create: {
      width: ADAPTIVE_SIZE,
      height: ADAPTIVE_SIZE,
      channels: 4,
      background: { r: 13, g: 17, b: 23, alpha: 1 } // #0D1117
    }
  })
  .png()
  .toFile(bgPath);
  console.log(`✅ Exported adaptive background (108dp / 432px): ic_launcher_background.png`);

  // 3. Generate Adaptive Icon Foreground (Transparent background with crisp glowing logo)
  // We'll extract or overlay the center elements from favicon.svg and render onto a transparent 432x432 container with safe-zone margin.
  // The safe zone for adaptive icons is a 66dp (264px) circle in the center of the 108dp (432px) icon.
  const fgPath = path.join(OUTPUT_DIR, 'ic_launcher_foreground.png');
  
  // We load the SVG, resize it to fit comfortably within the safe-zone viewport
  const innerLogoSize = Math.round(ADAPTIVE_SIZE * 0.72); // 311px
  const logoBuffer = await sharp(svgBuffer)
    .resize(innerLogoSize, innerLogoSize)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: ADAPTIVE_SIZE,
      height: ADAPTIVE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([{
    input: logoBuffer,
    top: Math.round((ADAPTIVE_SIZE - innerLogoSize) / 2),
    left: Math.round((ADAPTIVE_SIZE - innerLogoSize) / 2)
  }])
  .png()
  .toFile(fgPath);
  console.log(`✅ Exported adaptive foreground (108dp / 432px with safe zone padding): ic_launcher_foreground.png`);

  // 4. Generate Adaptive Monochrome Icon (Sleek minimalist mask)
  const monoPath = path.join(OUTPUT_DIR, 'ic_launcher_monochrome.png');
  await sharp(fgPath)
    .grayscale()
    .threshold(128) // High contrast clean edge threshold mask
    .png()
    .toFile(monoPath);
  console.log(`✅ Exported adaptive monochrome mask: ic_launcher_monochrome.png`);

  // 5. Generate Pre-masked Round Launcher (for legacy circular configurations)
  const roundPath = path.join(OUTPUT_DIR, 'ic_launcher_round.png');
  const radius = ADAPTIVE_SIZE / 2;
  const circleSvg = Buffer.from(
    `<svg><circle cx="${radius}" cy="${radius}" r="${radius}" fill="#000"/></svg>`
  );

  await sharp(svgBuffer)
    .resize(ADAPTIVE_SIZE, ADAPTIVE_SIZE)
    .composite([{
      input: circleSvg,
      blend: 'dest-in'
    }])
    .png()
    .toFile(roundPath);
  console.log(`✅ Exported legacy pre-masked round launcher: ic_launcher_round.png`);

  console.log('🎉 All premium Android density and adaptive launcher icon assets have been compiled and exported!');
}

generateAssets().catch(err => {
  console.error('❌ Icon generation failed:', err);
  process.exit(1);
});
