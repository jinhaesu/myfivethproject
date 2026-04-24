// 큰 이미지를 격자로 분할 + 적절한 크기로 리사이즈
// Claude Vision은 1568px 이상 다운샘플링하므로, 4분할하여 작은 글자도 식별 가능하게 함

const sharp = require('sharp');

/**
 * 이미지를 분석하기 좋은 형태로 준비:
 * 1) 원본 (overview용, 최대 1568px)
 * 2) 충분히 크면 NxN 분할 타일 (각 타일 ~1500px)
 * 3) 약간의 sharpen 적용으로 작은 글자 가독성 ↑
 *
 * @param {Buffer} buffer 원본 이미지 버퍼
 * @param {object} opts
 * @param {number} opts.divisionsThresholdPx 가로/세로 둘 중 하나라도 이 픽셀 이상이면 분할 (기본 1800)
 * @param {number} opts.divisions 분할 수 (각 축, 2면 4분할, 3이면 9분할)
 * @returns {Promise<Array<{label: string, buffer: Buffer, width: number, height: number}>>}
 */
async function prepareImageTiles(buffer, opts = {}) {
  const divisionsThreshold = opts.divisionsThresholdPx ?? 1800;
  const divisions = opts.divisions ?? 2;

  const meta = await sharp(buffer, { failOnError: false }).metadata();
  const origW = meta.width || 0;
  const origH = meta.height || 0;

  if (!origW || !origH) {
    return [{
      label: '원본',
      buffer,
      width: origW,
      height: origH,
    }];
  }

  // 1) 원본 (overview): 가로/세로 1568px로 맞춤
  const overviewLongEdge = 1568;
  const overviewBuffer = await sharp(buffer, { failOnError: false })
    .resize({
      width: origW >= origH ? overviewLongEdge : null,
      height: origH > origW ? overviewLongEdge : null,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .sharpen({ sigma: 0.7 })
    .png({ compressionLevel: 6 })
    .toBuffer();
  const overviewMeta = await sharp(overviewBuffer).metadata();

  const tiles = [{
    label: '전체 (overview)',
    buffer: overviewBuffer,
    width: overviewMeta.width || 0,
    height: overviewMeta.height || 0,
  }];

  // 2) 분할 타일: 작은 이미지면 분할 의미 없음
  const longEdge = Math.max(origW, origH);
  if (longEdge < divisionsThreshold) {
    return tiles;
  }

  // 분할 시 각 타일을 1500px 정도로 리사이즈하여 Claude vision sweet spot에 맞춤
  const tileTargetLongEdge = 1500;
  const tileW = Math.floor(origW / divisions);
  const tileH = Math.floor(origH / divisions);
  const labels = ['좌상', '우상', '좌하', '우하']; // divisions=2 기준

  for (let row = 0; row < divisions; row++) {
    for (let col = 0; col < divisions; col++) {
      const left = col * tileW;
      const top = row * tileH;
      // 가장자리 정확히 맞추기 위해 마지막 행/열은 끝까지
      const w = col === divisions - 1 ? origW - left : tileW;
      const h = row === divisions - 1 ? origH - top : tileH;

      const tileLongEdge = Math.max(w, h);
      let tileBuffer = await sharp(buffer, { failOnError: false })
        .extract({ left, top, width: w, height: h })
        .toBuffer();

      // 분할 후 적절한 크기로 (선명도 유지하되 너무 크지 않게)
      if (tileLongEdge > tileTargetLongEdge) {
        tileBuffer = await sharp(tileBuffer)
          .resize({
            width: w >= h ? tileTargetLongEdge : null,
            height: h > w ? tileTargetLongEdge : null,
            withoutEnlargement: true,
            fit: 'inside',
          })
          .sharpen({ sigma: 0.7 })
          .png({ compressionLevel: 6 })
          .toBuffer();
      } else {
        tileBuffer = await sharp(tileBuffer)
          .sharpen({ sigma: 0.7 })
          .png({ compressionLevel: 6 })
          .toBuffer();
      }

      const tileMeta = await sharp(tileBuffer).metadata();
      const idx = row * divisions + col;
      const labelText = divisions === 2 && idx < labels.length ? labels[idx] : `${row + 1}행 ${col + 1}열`;
      tiles.push({
        label: `${labelText} 영역 확대`,
        buffer: tileBuffer,
        width: tileMeta.width || 0,
        height: tileMeta.height || 0,
      });
    }
  }

  return tiles;
}

module.exports = { prepareImageTiles };
