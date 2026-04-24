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

const RATIO_HEADER_PATTERNS = [
  /배\s*합\s*비\s*율/,
  /배\s*합\s*비/,
  /구\s*성\s*비/,
  /함\s*량\s*\(%\)/,
  /^%$/,
];

const NUMBER_PATTERN = /^[\d.,%\s]+$/;

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

      // "배합비율" 헤더 셀 찾기 (여러 셀로 쪼개진 경우 인접 텍스트 결합 시도)
      let headerY = -1;
      let headerX = -1;
      let headerWidth = 0;

      for (let i = 0; i < items.length; i++) {
        const str = (items[i].str || '').replace(/\s/g, '');
        if (!str) continue;

        // 단일 셀 매치
        if (RATIO_HEADER_PATTERNS.some((p) => p.test(str))) {
          const tx = pdfjs.Util.transform(viewport.transform, items[i].transform);
          headerX = tx[4];
          headerY = tx[5];
          headerWidth = (items[i].width || 30) * scale;
          break;
        }

        // 인접 두 셀 결합 (예: "배합비" + "(%)")
        if (i + 1 < items.length) {
          const combined = str + (items[i + 1].str || '').replace(/\s/g, '');
          if (RATIO_HEADER_PATTERNS.some((p) => p.test(combined))) {
            const tx = pdfjs.Util.transform(viewport.transform, items[i].transform);
            const tx2 = pdfjs.Util.transform(viewport.transform, items[i + 1].transform);
            headerX = Math.min(tx[4], tx2[4]);
            headerY = Math.min(tx[5], tx2[5]);
            headerWidth = Math.max(tx[4] + items[i].width * scale, tx2[4] + items[i + 1].width * scale) - headerX;
            break;
          }
        }
      }

      if (headerY < 0) {
        setMaskRects([]);
        return;
      }

      const colXMin = headerX - 8;
      const colXMax = headerX + headerWidth + 16;

      const rects: MaskRect[] = [];
      for (const it of items) {
        if (!it.str || !it.str.trim()) continue;
        const trimmed = it.str.trim();
        const tx = pdfjs.Util.transform(viewport.transform, it.transform);
        const x = tx[4];
        const y = tx[5];
        const w = (it.width || 0) * scale;
        const h = (it.height || 12) * scale;

        // 헤더보다 아래에 있고, 컬럼 X 범위 안에 있고, 숫자 패턴
        const itemCenter = x + w / 2;
        const inColumn = itemCenter >= colXMin && itemCenter <= colXMax;
        if (y > headerY + 4 && inColumn && NUMBER_PATTERN.test(trimmed) && /\d/.test(trimmed)) {
          rects.push({
            x: x - 3,
            y: y - h - 1,
            w: w + 6,
            h: h + 4,
          });
        }
      }
      setMaskRects(rects);
    } catch (e) {
      console.error('Mask computation error:', e);
      setMaskRects([]);
    }
  }, [pageObj, scale, maskRatioColumn]);

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
