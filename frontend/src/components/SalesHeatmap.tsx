'use client';

// 미팅 빈도 히트맵 — 행: 담당자/거래처, 열: 최근 12주, 셀: 그 주의 미팅 건수.
// 데이터가 적을 때도 빈 그리드로 자연스럽게 보이도록, 0은 옅은 배경으로만 둔다.

import { HeatmapGrid, HeatmapWeek } from '@/lib/sales';

// 셀 강도 → 배경색. maxCell 대비 비율로 5단계.
// 브랜드 색(--brand) 계열의 알파를 키운다. 0은 격자만 보이게.
function cellStyle(count: number, maxCell: number): React.CSSProperties {
  if (count <= 0) return { background: 'var(--bg-2)' };
  const ratio = maxCell > 0 ? count / maxCell : 0;
  // 0.18~0.92 사이로 매핑 — 1건이어도 눈에 보이게 하한을 둔다
  const alpha = 0.18 + ratio * 0.74;
  return { background: `rgba(94, 106, 210, ${alpha.toFixed(3)})` };
}

function textColor(count: number, maxCell: number): string {
  if (count <= 0) return 'transparent';
  const ratio = maxCell > 0 ? count / maxCell : 0;
  return ratio > 0.5 ? '#fff' : 'var(--text-1)';
}

export default function SalesHeatmap({
  title,
  subtitle,
  rowLabel,
  weeks,
  grid,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  rowLabel: string; // 첫 열 헤더 (담당자 / 거래처)
  weeks: HeatmapWeek[];
  grid: HeatmapGrid;
  emptyText: string;
}) {
  const hasData = grid.rows.length > 0 && grid.maxCell > 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-3">
        <div className="text-[var(--text-1)] font-semibold tracking-tight">{title}</div>
        {subtitle ? <div className="text-[11.5px] text-[var(--text-4)]">{subtitle}</div> : null}
      </div>

      {!hasData ? (
        <p className="text-[13px] text-[var(--text-4)] py-3">{emptyText}</p>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="border-separate" style={{ borderSpacing: '3px' }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--bg-1)] text-left text-[11px] font-medium text-[var(--text-3)] pr-2 align-bottom">
                    {rowLabel}
                  </th>
                  {weeks.map((w) => (
                    <th
                      key={w.key}
                      className="text-[10px] font-normal text-[var(--text-4)] tabular w-[26px] align-bottom pb-0.5"
                      title={`${w.label} 주`}
                    >
                      {w.label}
                    </th>
                  ))}
                  <th className="text-[10px] font-medium text-[var(--text-3)] pl-2 align-bottom pb-0.5">계</th>
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 z-10 bg-[var(--bg-1)] text-[12px] text-[var(--text-1)] pr-2 whitespace-nowrap max-w-[160px] truncate">
                      <span className="block max-w-[160px] truncate" title={r.name}>
                        {r.name}
                      </span>
                    </td>
                    {r.cells.map((c, i) => (
                      <td
                        key={weeks[i]?.key || i}
                        className="w-[26px] h-[26px] rounded-[5px] text-center text-[10px] tabular align-middle"
                        style={{ ...cellStyle(c, grid.maxCell), color: textColor(c, grid.maxCell) }}
                        title={`${r.name} · ${weeks[i]?.label || ''} 주 · ${c}건`}
                      >
                        {c > 0 ? c : ''}
                      </td>
                    ))}
                    <td className="pl-2 text-[12px] font-semibold text-[var(--text-1)] tabular text-right">
                      {r.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[10.5px] text-[var(--text-4)]">
            <span>적음</span>
            {[0.18, 0.4, 0.6, 0.8, 0.92].map((a) => (
              <span
                key={a}
                className="w-3.5 h-3.5 rounded-[3px] inline-block"
                style={{ background: `rgba(94, 106, 210, ${a})` }}
              />
            ))}
            <span>많음</span>
            {grid.hiddenRows > 0 ? (
              <span className="ml-auto">상위 {grid.rows.length}개 표시 · {grid.hiddenRows}개 더 있음</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
