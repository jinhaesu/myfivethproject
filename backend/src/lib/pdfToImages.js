// PDF buffer → 페이지별 고해상도 PNG buffer 배열
// pdfjs-dist (legacy) + @napi-rs/canvas (prebuilt native, Railway 호환)
// 한국어/일본어 텍스트 렌더링을 위해 CMap + 표준 폰트 지원

const fs = require('fs').promises;
const path = require('path');
const napiCanvas = require('@napi-rs/canvas');
const { createCanvas } = napiCanvas;

// pdfjs-dist legacy 빌드는 'canvas' npm 패키지를 require하여 DOMMatrix/Path2D 등을 polyfill하려 함.
// 우리는 @napi-rs/canvas를 사용하므로 globalThis에 직접 주입하여 polyfill 경고 + 렌더링 깨짐 방지.
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = napiCanvas.DOMMatrix;
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = napiCanvas.Path2D;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = napiCanvas.ImageData;
if (typeof globalThis.DOMPoint === 'undefined') globalThis.DOMPoint = napiCanvas.DOMPoint;
if (typeof globalThis.DOMRect === 'undefined') globalThis.DOMRect = napiCanvas.DOMRect;

const PDFJS_PATH = path.dirname(require.resolve('pdfjs-dist/package.json'));
const CMAP_PATH = path.join(PDFJS_PATH, 'cmaps');
const FONT_PATH = path.join(PDFJS_PATH, 'standard_fonts');

let pdfjsLib = null;
function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  return pdfjsLib;
}

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    const context = canvas.getContext('2d');
    return { canvas, context };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = Math.ceil(width);
    canvasAndContext.canvas.height = Math.ceil(height);
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

class NodeCMapReaderFactory {
  async fetch({ name }) {
    const data = await fs.readFile(path.join(CMAP_PATH, name + '.bcmap'));
    return {
      cMapData: new Uint8Array(data),
      compressionType: 1, // CMapCompressionType.BINARY
    };
  }
}

class NodeStandardFontDataFactory {
  async fetch({ filename }) {
    const data = await fs.readFile(path.join(FONT_PATH, filename));
    return new Uint8Array(data);
  }
}

/**
 * PDF buffer를 페이지별 PNG buffer 배열로 변환.
 *
 * @param {Buffer} buffer 원본 PDF
 * @param {object} opts
 * @param {number} opts.scale 렌더 스케일 (기본 2.5 ≈ 180dpi)
 * @param {number} opts.maxPages 최대 페이지 수 (기본 8)
 * @param {number} opts.maxLongEdgePx 가로/세로 중 긴 쪽 최대 픽셀 (기본 2200)
 * @returns {Promise<Array<{pageNum, buffer, width, height}>>}
 */
async function pdfToImages(buffer, opts = {}) {
  const scale = opts.scale ?? 2.5;
  const maxPages = opts.maxPages ?? 8;
  const maxLongEdge = opts.maxLongEdgePx ?? 2200;

  const pdfjs = getPdfjs();
  const factory = new NodeCanvasFactory();

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    canvasFactory: factory,
    CMapReaderFactory: NodeCMapReaderFactory,
    cMapPacked: true,
    StandardFontDataFactory: NodeStandardFontDataFactory,
    useSystemFonts: false,
    // ★ Node(@napi-rs/canvas) 환경에선 반드시 true. glyph를 vector path로 직접 렌더한다.
    // false면 폰트페이스 로딩 경로로 가는데 CIDFontType0(CFF CID, Identity-H) 임베드 한글 폰트
    // (SDGothicNeo/NanumSquareNeo 등)를 못 그려서 한글이 전부 .notdef □(두부박스)로 깨진다.
    // 라벨 디자인 표시사항이 대부분 이 방식이라, 한글 판독 실패의 근본 원인이었다.
    disableFontFace: true,
  }).promise;

  const pageCount = Math.min(doc.numPages, maxPages);
  const images = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    let viewport = page.getViewport({ scale });

    const longEdge = Math.max(viewport.width, viewport.height);
    if (longEdge > maxLongEdge) {
      const adjustedScale = scale * (maxLongEdge / longEdge);
      viewport = page.getViewport({ scale: adjustedScale });
    }

    const canvasAndContext = factory.create(viewport.width, viewport.height);
    canvasAndContext.context.fillStyle = '#ffffff';
    canvasAndContext.context.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory: factory,
      background: '#ffffff',
    }).promise;

    const png = await canvasAndContext.canvas.encode('png');
    images.push({
      pageNum: i,
      buffer: Buffer.from(png),
      width: Math.ceil(viewport.width),
      height: Math.ceil(viewport.height),
    });
    factory.destroy(canvasAndContext);
  }

  await doc.destroy();
  return images;
}

module.exports = { pdfToImages };
