'use client';

import { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

interface MaskRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PdfViewerProps {
  url: string;
  maskRatioColumn?: boolean;
  maxHeight?: string;
  initialScale?: number;
}

// 페이지에 "배합비율" 또는 "구성비" 같은 키워드가 있으면 마스킹 모드 활성화
const RATIO_PAGE_KEYWORDS = [
  /배\s*합\s*비\s*율/,
  /배\s*합\s*비/,
  /구\s*성\s*비\s*율/,
  /구\s*성\s*비/,
];

// 단일 셀에 "숫자%"가 모두 있는 경우 (예: "28.8%", "0.1%", "100%")
const PERCENT_VALUE_PATTERN = /^\s*\d+(?:[,.]\d+)?\s*%\s*$/;
// 단일 셀에 숫자만 있는 경우 (예: "28.8", "0.1") - % 가 별도 셀로 분리되었을 가능성
const NUMBER_ONLY_PATTERN = /^\s*\d+(?:[,.]\d+)?\s*$/;
// 단일 셀에 % 만 있는 경우
const PERCENT_ONLY_PATTERN = /^\s*%\s*$/;

// 헤더 자체("배합비율(%)" 등)는 마스킹 제외
const PERCENT_HEADER_PATTERN = /[가-힣]/;

export default function PdfViewer({
  url,
  maskRatioColumn = false,
  maxHeight = '80vh',
  initialScale = 1.2,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNum, setPageNum] = useState<number>(1);
  const [scale, setScale] = useState<number>(initialScale);
  const [maskRects, setMaskRects] = useState<MaskRect[]>([]);
  const [pageObj, setPageObj] = useState<any>(null);
  const [loadError, setLoadError] = useState<string>('');
  const [pageWidth, setPageWidth] = useState<number>(0);
  const [pageHeight, setPageHeight] = useState<number>(0);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNum(1);
    setLoadError('');
  };

  const onDocumentLoadError = (err: Error) => {
    console.error('PDF load error:', err);
    setLoadError('PDF를 불러올 수 없습니다. 파일이 손상되었거나 접근할 수 없습니다.');
  };

  // 페이지 객체를 받아 저장 (텍스트 분석용)
  const onPageLoad = (page: any) => {
    setPageObj(page);
  };

  // 페이지 렌더 완료 후 페이지 크기 저장
  const onPageRenderSuccess = (page: any) => {
    setPageWidth(page.width);
    setPageHeight(page.height);
  };

  // pageObj/scale 변경 시 배합비율 컬럼 마스킹 영역 계산
  const computeMasks = useCallback(async () => {
    if (!maskRatioColumn || !pageObj) {
      setMaskRects([]);
      return;
    }
    try {
      const textContent = await pageObj.getTextContent();
      const viewport = pageObj.getViewport({ scale });
      const items: any[] = textContent.items;

      // 1. 페이지에 "배합비율" 키워드가 있는지 검사
      const allText = items.map((it: any) => (it.str || '')).join('').replace(/\s/g, '');
      const hasKeyword = RATIO_PAGE_KEYWORDS.some((p) => p.test(allText));

      console.log(
        `[PdfViewer] page=${pageNum} items=${items.length} hasRatioKeyword=${hasKeyword} ` +
          `sampleTexts=${JSON.stringify(items.slice(0, 8).map((i: any) => i.str))}`
      );

      if (!hasKeyword) {
        setMaskRects([]);
        return;
      }

      // 2. 마스킹 대상 수집
      // (a) 단일 셀 "28.8%" 패턴
      // (b) "28.8" 셀 + 그 직후/직전/위/아래에 인접한 "%" 셀 → 결합해서 둘 다 마스킹
      // (c) "28.8" 셀 + 같은 페이지 어딘가에 "%"만 있는 셀이 있으면 (배합비율 표 안의 숫자) 마스킹
      const rects: MaskRect[] = [];
      const maskedIndices = new Set<number>();

      // 페이지 내 % 기호만 있는 셀 위치 모두 수집
      const percentOnlyItems: { idx: number; x: number; y: number; w: number; h: number }[] = [];
      for (let i = 0; i < items.length; i++) {
        const trimmed = (items[i].str || '').trim();
        if (PERCENT_ONLY_PATTERN.test(trimmed)) {
          const tx = pdfjs.Util.transform(viewport.transform, items[i].transform);
          percentOnlyItems.push({
            idx: i,
            x: tx[4],
            y: tx[5],
            w: (items[i].width || 0) * scale,
            h: (items[i].height || 12) * scale,
          });
        }
      }

      const pushRect = (it: any, idx: number) => {
        if (maskedIndices.has(idx)) return;
        maskedIndices.add(idx);
        const tx = pdfjs.Util.transform(viewport.transform, it.transform);
        const x = tx[4];
        const y = tx[5];
        const w = (it.width || 0) * scale;
        const h = (it.height || 12) * scale;
        rects.push({
          x: x - 3,
          y: y - h - 1,
          w: Math.max(w + 6, 24),
          h: h + 4,
        });
      };

      for (let i = 0; i < items.length; i++) {
        const raw = items[i].str || '';
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (PERCENT_HEADER_PATTERN.test(trimmed)) continue; // 한글 포함 헤더 셀 제외

        // (a) 단일 셀에 "숫자%" 모두 있음
        if (PERCENT_VALUE_PATTERN.test(trimmed)) {
          pushRect(items[i], i);
          continue;
        }

        // (b)/(c) 숫자만 있는 셀 — 인접 % 또는 페이지 내 % 셀과 결합 가능 시 마스킹
        if (NUMBER_ONLY_PATTERN.test(trimmed)) {
          // 같은 행(y 비슷)에 "%"만 있는 셀이 있는지 확인
          const tx = pdfjs.Util.transform(viewport.transform, items[i].transform);
          const numY = tx[5];
          const numX = tx[4];
          const numW = (items[i].width || 0) * scale;
          const numH = (items[i].height || 12) * scale;

          const hasNearbyPercent = percentOnlyItems.some((p) => {
            const sameRow = Math.abs(p.y - numY) < numH * 1.2;
            const closeX = p.x > numX && p.x - (numX + numW) < numW * 3;
            return sameRow && closeX;
          });

          if (hasNearbyPercent) {
            pushRect(items[i], i);
          }
          continue;
        }
      }

      // % 만 있는 셀들도 같이 마스킹 (헤더 셀 안에 있는 % 가 아닌 본문에 있는 것)
      // 본문 % 셀: 위 (b)/(c)에서 숫자와 짝지어진 % 만 마스킹
      for (const p of percentOnlyItems) {
        const matched = rects.some(
          (r) => Math.abs(r.y + r.h / 2 - (p.y - p.h / 2)) < p.h * 1.2 && p.x > r.x
        );
        if (matched) {
          rects.push({
            x: p.x - 2,
            y: p.y - p.h - 1,
            w: p.w + 4,
            h: p.h + 4,
          });
        }
      }

      console.log(`[PdfViewer] masked ${rects.length} cells on page ${pageNum}`);
      setMaskRects(rects);
    } catch (e) {
      console.error('[PdfViewer] Mask computation error:', e);
      setMaskRects([]);
    }
  }, [pageObj, scale, maskRatioColumn, pageNum]);

  useEffect(() => {
    computeMasks();
  }, [computeMasks]);

  const zoomIn = () => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(0.4, +(s - 0.2).toFixed(2)));
  const fitWidth = () => setScale(1.4);
  const reset = () => setScale(initialScale);

  if (loadError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        {loadError}
        <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2 text-blue-600 underline">
          새 탭에서 열기
        </a>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            ◀
          </button>
          <span className="text-xs text-gray-700 px-2 min-w-[70px] text-center">
            {pageNum} / {numPages || '?'}
          </span>
          <button
            type="button"
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages}
            className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            ▶
          </button>
        </div>
        <div className="border-l border-gray-300 h-5 mx-1" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
          >
            −
          </button>
          <span className="text-xs text-gray-700 px-2 min-w-[50px] text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={zoomIn}
            className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={fitWidth}
            className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 ml-1"
          >
            폭 맞춤
          </button>
          <button
            type="button"
            onClick={reset}
            className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
          >
            기본
          </button>
        </div>
        {maskRatioColumn && maskRects.length > 0 && (
          <span className="ml-auto text-xs text-gray-500 italic">
            배합비율 {maskRects.length}개 항목 마스킹됨
          </span>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline ml-auto"
        >
          새 탭
        </a>
      </div>

      {/* PDF 영역 */}
      <div className="overflow-auto p-4 flex justify-center" style={{ maxHeight }}>
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="py-12 text-gray-500 text-sm">PDF 로딩 중...</div>}
          error={<div className="py-12 text-red-600 text-sm">PDF를 불러올 수 없습니다.</div>}
        >
          <div className="relative shadow-lg" style={{ width: pageWidth || 'auto', height: pageHeight || 'auto' }}>
            <Page
              pageNumber={pageNum}
              scale={scale}
              onLoadSuccess={onPageLoad}
              onRenderSuccess={onPageRenderSuccess}
              renderAnnotationLayer={false}
            />
            {/* 배합비율 컬럼 마스킹 오버레이 */}
            {maskRatioColumn &&
              maskRects.map((r, i) => (
                <div
                  key={i}
                  className="absolute bg-white border border-white"
                  style={{
                    left: r.x,
                    top: r.y,
                    width: r.w,
                    height: r.h,
                    pointerEvents: 'none',
                  }}
                />
              ))}
          </div>
        </Document>
      </div>
    </div>
  );
}
