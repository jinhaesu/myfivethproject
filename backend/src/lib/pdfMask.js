// 품목제조보고서 PDF에서 배합비율(%) 컬럼을 흰색 박스로 마스킹된 새 PDF 생성
// pdfjs-dist (Node legacy 빌드)로 텍스트+좌표 추출 → pdf-lib으로 흰 박스 그림

const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');

const RATIO_PAGE_KEYWORDS = [/배\s*합\s*비\s*율/, /배\s*합\s*비/, /구\s*성\s*비\s*율/, /구\s*성\s*비/];
const PERCENT_VALUE = /^\s*\d+(?:[,.]\d+)?\s*%\s*$/;
const NUMBER_ONLY = /^\s*\d+(?:[,.]\d+)?\s*$/;
const PERCENT_ONLY = /^\s*%\s*$/;
const HAS_HANGUL = /[가-힣]/;

let pdfjsLib = null;
function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  return pdfjsLib;
}

/**
 * 품목제조보고서 PDF의 배합비율 컬럼을 마스킹한 새 PDF buffer 반환.
 * 텍스트 레이어가 없으면 null 반환 (스캔 PDF인 경우).
 *
 * @param {Buffer} inputBuffer 원본 PDF buffer
 * @returns {Promise<{maskedBuffer: Buffer, stats: object} | null>}
 */
async function createMaskedReportPdf(inputBuffer) {
  const pdfjs = getPdfjs();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(inputBuffer),
    disableFontFace: true,
    useSystemFonts: false,
  });
  const pdfDoc = await loadingTask.promise;

  const pdfLibDoc = await PDFDocument.load(inputBuffer);

  let totalTextItems = 0;
  let totalMasked = 0;
  let pagesWithKeyword = 0;

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const items = textContent.items;
    totalTextItems += items.length;

    if (items.length === 0) continue;

    const allText = items.map((it) => it.str || '').join('').replace(/\s/g, '');
    const hasKeyword = RATIO_PAGE_KEYWORDS.some((p) => p.test(allText));
    if (!hasKeyword) continue;
    pagesWithKeyword++;

    // 마스킹할 셀들 좌표 수집
    const masks = [];
    const percentOnlyItems = [];

    for (const it of items) {
      const trimmed = (it.str || '').trim();
      if (PERCENT_ONLY.test(trimmed)) {
        const tr = it.transform;
        percentOnlyItems.push({
          x: tr[4],
          y: tr[5],
          w: it.width || 0,
          h: it.height || 12,
        });
      }
    }

    for (const it of items) {
      const trimmed = (it.str || '').trim();
      if (!trimmed) continue;
      if (HAS_HANGUL.test(trimmed)) continue;

      const tr = it.transform;
      const x = tr[4];
      const y = tr[5];
      const w = it.width || 0;
      const h = it.height || 12;

      if (PERCENT_VALUE.test(trimmed)) {
        masks.push({ x, y, w: Math.max(w, 24), h });
      } else if (NUMBER_ONLY.test(trimmed)) {
        // 같은 행에 % 셀이 인접해 있으면 마스킹
        const hasAdjacentPercent = percentOnlyItems.some(
          (p) => Math.abs(p.y - y) < h * 1.5 && p.x > x && p.x - (x + w) < w * 4
        );
        if (hasAdjacentPercent) {
          masks.push({ x, y, w: Math.max(w, 24), h });
        }
      }
    }

    // % 만 있는 셀은 위에서 매칭된 숫자 셀 옆에 있는 것만 추가 마스킹
    for (const p of percentOnlyItems) {
      const hasMatchedNumber = masks.some(
        (m) => Math.abs(m.y - p.y) < p.h * 1.5 && p.x > m.x && p.x - (m.x + m.w) < m.w * 4
      );
      if (hasMatchedNumber) {
        masks.push({ x: p.x, y: p.y, w: Math.max(p.w, 12), h: p.h });
      }
    }

    if (masks.length === 0) continue;

    // pdf-lib에 흰색 사각형 그리기
    const pdfLibPage = pdfLibDoc.getPages()[pageNum - 1];
    const pageHeight = pdfLibPage.getHeight();

    for (const m of masks) {
      // pdf.js 좌표는 baseline 기준, pdf-lib은 좌하단 기준 (y는 동일하게 PDF 좌표계)
      // pdf.js의 transform[5]는 baseline y, pdf-lib의 drawRectangle y는 사각형 좌하단
      pdfLibPage.drawRectangle({
        x: m.x - 2,
        y: m.y - 2,
        width: m.w + 4,
        height: m.h + 4,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    }
    totalMasked += masks.length;
  }

  const maskedBytes = await pdfLibDoc.save();
  return {
    maskedBuffer: Buffer.from(maskedBytes),
    stats: {
      totalPages: pdfDoc.numPages,
      pagesWithKeyword,
      totalTextItems,
      totalMasked,
    },
  };
}

/**
 * 사용자가 지정한 좌표(이미지 픽셀 단위)로 PDF에 흰색 박스를 그려 영구 마스킹.
 * 좌표는 frontend에서 받은 렌더 이미지 기준이므로 PDF 좌표로 변환.
 *
 * @param {Buffer} inputBuffer 원본 PDF
 * @param {Array<{page: number, x: number, y: number, width: number, height: number, renderedWidth: number, renderedHeight: number}>} pageRects
 *        - page: 1-based 페이지 번호
 *        - x, y, width, height: 이미지 픽셀 좌표 (top-left 기준)
 *        - renderedWidth, renderedHeight: 좌표 기준이 된 렌더 이미지의 크기
 * @returns {Promise<Buffer>} 마스킹된 PDF buffer
 */
async function applyManualMask(inputBuffer, pageRects) {
  const pdfLibDoc = await PDFDocument.load(inputBuffer);
  const pages = pdfLibDoc.getPages();

  // 페이지별 그룹핑
  const byPage = new Map();
  for (const r of pageRects) {
    if (!byPage.has(r.page)) byPage.set(r.page, []);
    byPage.get(r.page).push(r);
  }

  for (const [pageNum, rects] of byPage.entries()) {
    if (pageNum < 1 || pageNum > pages.length) continue;
    const page = pages[pageNum - 1];
    const pdfWidth = page.getWidth();
    const pdfHeight = page.getHeight();

    for (const r of rects) {
      const renderedW = r.renderedWidth || pdfWidth;
      const renderedH = r.renderedHeight || pdfHeight;
      const scaleX = pdfWidth / renderedW;
      const scaleY = pdfHeight / renderedH;

      // 이미지 좌표(top-left 기준) → PDF 좌표(bottom-left 기준)
      const pdfX = r.x * scaleX;
      const pdfRectW = r.width * scaleX;
      const pdfRectH = r.height * scaleY;
      const pdfY = pdfHeight - (r.y * scaleY) - pdfRectH;

      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: pdfRectW,
        height: pdfRectH,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    }
  }

  const bytes = await pdfLibDoc.save();
  return Buffer.from(bytes);
}

module.exports = { createMaskedReportPdf, applyManualMask };
