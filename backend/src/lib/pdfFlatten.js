// 마스킹된 PDF의 텍스트 레이어를 영구히 제거하기 위한 평탄화(flatten) 유틸.
//
// 배경: pdfMask.js / applyManualMask 가 흰 사각형을 "그리는" 방식이라
// PDF 텍스트 레이어에는 배합비율(%) 텍스트가 그대로 남는다.
// 텍스트 복사·텍스트 추출(pdfjs)·검색을 하면 영업비밀이 노출된다.
//
// 해결: 마스킹된 PDF의 모든 페이지를 PNG로 다시 렌더링한 뒤,
// 새 PDF에 이미지로만 임베드한다 → 텍스트 레이어가 존재하지 않음.

const { PDFDocument } = require('pdf-lib');

let pdfToImagesFn = null;
function loadPdfToImages() {
  if (pdfToImagesFn) return pdfToImagesFn;
  // pdfToImages 는 @napi-rs/canvas 네이티브 모듈에 의존 → 로드 실패 가능
  ({ pdfToImages: pdfToImagesFn } = require('./pdfToImages'));
  return pdfToImagesFn;
}

/**
 * 마스킹된 PDF buffer 를 페이지 이미지만 들어있는 새 PDF buffer 로 변환.
 * 실패하면 null 을 반환하므로 호출자는 원본(시각적 마스킹) buffer 로 폴백할 수 있다.
 *
 * @param {Buffer} maskedBuffer 흰 사각형이 그려진 PDF
 * @param {object} opts
 * @param {number} opts.scale 렌더 스케일 (기본 2.0 ≈ 144dpi, 가독성+용량 균형)
 * @param {number} opts.maxLongEdgePx (기본 1800)
 * @returns {Promise<{ flattenedBuffer: Buffer, pageCount: number } | null>}
 */
async function flattenMaskedPdfToImages(maskedBuffer, opts = {}) {
  const scale = opts.scale ?? 2.0;
  const maxLongEdgePx = opts.maxLongEdgePx ?? 1800;
  // 보고서가 8장 넘는 경우는 거의 없지만 상한을 둠
  const maxPages = opts.maxPages ?? 16;

  let toImages;
  try {
    toImages = loadPdfToImages();
  } catch (err) {
    console.error('[Flatten] pdfToImages 로드 실패:', err.message);
    return null;
  }

  let images;
  try {
    images = await toImages(maskedBuffer, { scale, maxPages, maxLongEdgePx });
  } catch (err) {
    console.error('[Flatten] 페이지 렌더링 실패:', err.message);
    return null;
  }

  if (!images || images.length === 0) {
    return null;
  }

  const out = await PDFDocument.create();
  for (const img of images) {
    const pngImage = await out.embedPng(img.buffer);
    // 원본 PDF 해상도와 동일한 비율을 유지하기 위해
    // 이미지 픽셀 크기를 그대로 PDF 포인트로 사용한다 (1:1).
    const page = out.addPage([pngImage.width, pngImage.height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height,
    });
  }

  const bytes = await out.save();
  return {
    flattenedBuffer: Buffer.from(bytes),
    pageCount: images.length,
  };
}

module.exports = { flattenMaskedPdfToImages };
