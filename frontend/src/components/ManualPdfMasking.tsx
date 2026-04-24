'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface PageImage {
  pageNum: number;
  imageBase64: string;
  renderedWidth: number;
  renderedHeight: number;
}

interface MaskRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  renderedWidth: number;
  renderedHeight: number;
}

interface Props {
  labelId: string;
  onSaved: () => void;
  onCancel: () => void;
}

interface DragState {
  page: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export default function ManualPdfMasking({ labelId, onSaved, onCancel }: Props) {
  const [pages, setPages] = useState<PageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rects, setRects] = useState<MaskRect[]>([]);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const imgRefs = useRef<Record<number, HTMLImageElement | null>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await api.uploads.getReportPageImages(labelId);
        setPages(data.pages);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [labelId]);

  // 이미지 element 자체를 측정 → 가장 정확한 좌표 변환
  // displayX/Y는 image element의 좌상단 기준
  const toImageCoords = (page: PageImage, displayX: number, displayY: number) => {
    const img = imgRefs.current[page.pageNum];
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const scaleX = page.renderedWidth / rect.width;
    const scaleY = page.renderedHeight / rect.height;
    return {
      x: Math.round(displayX * scaleX),
      y: Math.round(displayY * scaleY),
    };
  };

  // 마우스 이벤트 좌표를 이미지 element 좌상단 기준으로 변환
  const getDisplayCoords = (e: React.MouseEvent, page: PageImage) => {
    const img = imgRefs.current[page.pageNum];
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      maxX: rect.width,
      maxY: rect.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent, page: PageImage) => {
    const c = getDisplayCoords(e, page);
    if (!c) return;
    setDragging({ page: page.pageNum, startX: c.x, startY: c.y, currentX: c.x, currentY: c.y });
  };

  const handleMouseMove = (e: React.MouseEvent, page: PageImage) => {
    if (!dragging || dragging.page !== page.pageNum) return;
    const c = getDisplayCoords(e, page);
    if (!c) return;
    const x = Math.max(0, Math.min(c.maxX, c.x));
    const y = Math.max(0, Math.min(c.maxY, c.y));
    setDragging({ ...dragging, currentX: x, currentY: y });
  };

  const handleMouseUp = (page: PageImage) => {
    if (!dragging || dragging.page !== page.pageNum) {
      setDragging(null);
      return;
    }

    const w = Math.abs(dragging.currentX - dragging.startX);
    const h = Math.abs(dragging.currentY - dragging.startY);
    if (w < 8 || h < 8) {
      setDragging(null);
      return;
    }

    const displayX = Math.min(dragging.startX, dragging.currentX);
    const displayY = Math.min(dragging.startY, dragging.currentY);
    const tl = toImageCoords(page, displayX, displayY);
    const br = toImageCoords(page, displayX + w, displayY + h);

    const newRect = {
      page: page.pageNum,
      x: tl.x,
      y: tl.y,
      width: br.x - tl.x,
      height: br.y - tl.y,
      renderedWidth: page.renderedWidth,
      renderedHeight: page.renderedHeight,
    };
    console.log('[ManualMask] new rect:', newRect, 'display:', { displayX, displayY, w, h });
    setRects((prev) => [...prev, newRect]);
    setDragging(null);
  };

  const removeRect = (idx: number) => {
    setRects((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearPage = (pageNum: number) => {
    setRects((prev) => prev.filter((r) => r.page !== pageNum));
  };

  const handleSave = async () => {
    if (rects.length === 0) {
      setError('마스킹 영역을 1개 이상 그려주세요.');
      return;
    }
    if (!confirm(
      `총 ${rects.length}개 영역을 영구 마스킹합니다.\n` +
      `한 번 적용하면 되돌릴 수 없습니다 (보고서를 새로 업로드해야 함).\n\n계속하시겠습니까?`
    )) return;

    setSaving(true);
    setError('');
    try {
      await api.uploads.applyReportMask(labelId, rects);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card text-center py-12 text-gray-500">페이지 이미지 로딩 중...</div>;
  }

  if (error && pages.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={onCancel} className="btn-secondary">닫기</button>
      </div>
    );
  }

  // 페이지별 렌더링된 사각형들 가져오기
  const getRectsForPage = (pageNum: number) => rects.filter((r) => r.page === pageNum);

  return (
    <div className="card border-2 border-yellow-400">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            {'\u{1F58C}️'} 수동 마스킹 모드
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            각 페이지 위에서 마우스로 드래그하여 가릴 영역을 그리세요. <br />
            <span className="text-red-600 font-bold">"영구 저장" 클릭 후에는 되돌릴 수 없습니다</span> (보고서 재업로드 필요).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={saving} className="btn-secondary text-sm">취소</button>
          <button
            onClick={handleSave}
            disabled={saving || rects.length === 0}
            className="btn-primary text-sm bg-red-600 hover:bg-red-700"
          >
            {saving ? '저장 중...' : `영구 저장 (${rects.length}개 영역)`}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {pages.map((page) => {
          const pageRects = getRectsForPage(page.pageNum);
          // 렌더링 시 컨테이너 width 기준으로 크기를 맞춤
          // 디스플레이 좌표 → 원본 이미지 좌표 변환은 toImageCoords에서 처리
          return (
            <div key={page.pageNum} className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                <span className="text-sm font-bold">페이지 {page.pageNum}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{pageRects.length}개 영역</span>
                  {pageRects.length > 0 && (
                    <button onClick={() => clearPage(page.pageNum)} className="text-xs text-red-600 hover:underline">
                      이 페이지 영역 모두 삭제
                    </button>
                  )}
                </div>
              </div>
              <div
                ref={(el) => { containerRefs.current[page.pageNum] = el; }}
                className="relative cursor-crosshair select-none inline-block"
                onMouseDown={(e) => handleMouseDown(e, page)}
                onMouseMove={(e) => handleMouseMove(e, page)}
                onMouseUp={() => handleMouseUp(page)}
                onMouseLeave={() => handleMouseUp(page)}
                style={{ touchAction: 'none', width: '100%' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={(el) => { imgRefs.current[page.pageNum] = el; }}
                  src={page.imageBase64}
                  alt={`페이지 ${page.pageNum}`}
                  className="block"
                  style={{ width: '100%', height: 'auto' }}
                  draggable={false}
                />
                {/* 저장된 사각형들 (이미지 픽셀 좌표 → display 좌표로 변환) */}
                {pageRects.map((r, idx) => {
                  const img = imgRefs.current[page.pageNum];
                  if (!img) return null;
                  const imgRect = img.getBoundingClientRect();
                  const containerEl = containerRefs.current[page.pageNum];
                  if (!containerEl) return null;
                  const containerRect = containerEl.getBoundingClientRect();
                  const offsetLeft = imgRect.left - containerRect.left;
                  const offsetTop = imgRect.top - containerRect.top;
                  const scaleX = imgRect.width / page.renderedWidth;
                  const scaleY = imgRect.height / page.renderedHeight;
                  return (
                    <div
                      key={idx}
                      className="absolute bg-white border-2 border-red-500 group"
                      style={{
                        left: offsetLeft + r.x * scaleX,
                        top: offsetTop + r.y * scaleY,
                        width: r.width * scaleX,
                        height: r.height * scaleY,
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const globalIdx = rects.findIndex((rr) => rr === r);
                          if (globalIdx >= 0) removeRect(globalIdx);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                        title="이 영역 삭제"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {/* 현재 드래그 중인 사각형 (이미지 element 좌상단 기준) */}
                {dragging && dragging.page === page.pageNum && (() => {
                  const img = imgRefs.current[page.pageNum];
                  const containerEl = containerRefs.current[page.pageNum];
                  if (!img || !containerEl) return null;
                  const imgRect = img.getBoundingClientRect();
                  const containerRect = containerEl.getBoundingClientRect();
                  const offsetLeft = imgRect.left - containerRect.left;
                  const offsetTop = imgRect.top - containerRect.top;
                  return (
                    <div
                      className="absolute bg-white/70 border-2 border-blue-500 pointer-events-none"
                      style={{
                        left: offsetLeft + Math.min(dragging.startX, dragging.currentX),
                        top: offsetTop + Math.min(dragging.startY, dragging.currentY),
                        width: Math.abs(dragging.currentX - dragging.startX),
                        height: Math.abs(dragging.currentY - dragging.startY),
                      }}
                    />
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
