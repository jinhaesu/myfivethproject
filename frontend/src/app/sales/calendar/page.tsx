'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import {
  CalendarEvent,
  CalendarEventType,
  EVENT_META,
  SalesClient,
  SALES_STAGES,
  STAGE_LABEL,
  fmtDate,
  toDateInput,
} from '@/lib/sales';
import { googleCalendarUrl, downloadEventIcs, downloadIcs } from '@/lib/calendarExport';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Textarea,
  Field,
  Badge,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyState,
  CenterSpinner,
} from '@/components/ui';

type View = 'month' | 'week' | 'day';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function SalesPlansPage() {
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [hiddenTypes, setHiddenTypes] = useState<Set<CalendarEventType>>(new Set());
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(true);
  // 달력 칸은 3건까지만 보여주고 나머지를 '+N건 더'로 접는다 — 그 나머지를 여는 통로
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);

  // 거래처 목록은 기간과 무관하게 고정 — 달을 넘겨도 선택이 목록에서 사라지지 않아야 한다
  useEffect(() => {
    (async () => {
      try {
        const data = await api.sales.listClients();
        setClients(data.clients || []);
      } catch {
        /* 거래처 목록을 못 받아도 캘린더 자체는 보여준다 */
      }
    })();
  }, []);

  // 거래처 필터 적용 후 (출시·단종은 거래처가 없으므로 특정 거래처 선택 시 함께 빠진다)
  const clientFiltered = useMemo(
    () => (clientId ? events.filter((e) => e.clientId === clientId) : events),
    [events, clientId],
  );

  // 유형 필터까지 적용한 최종 이벤트 (렌더링·내보내기는 전부 이 목록 기준)
  const visibleEvents = useMemo(
    () => clientFiltered.filter((e) => !hiddenTypes.has(e.type)),
    [clientFiltered, hiddenTypes],
  );

  // 각 필터의 개수는 "다른 쪽 필터를 적용한 뒤" 기준이라, 지금 고르면 몇 건이 남는지 그대로 보여준다
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of clientFiltered) c[e.type] = (c[e.type] || 0) + 1;
    return c;
  }, [clientFiltered]);

  const clientCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) {
      if (e.clientId && !hiddenTypes.has(e.type)) c[e.clientId] = (c[e.clientId] || 0) + 1;
    }
    return c;
  }, [events, hiddenTypes]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) || null,
    [clients, clientId],
  );
  // 이 기간에 일정이 있는 거래처를 위로 올려, 빈 거래처를 훑지 않아도 되게 한다
  const clientsWithEvents = useMemo(
    () => clients.filter((c) => clientCounts[c.id]),
    [clients, clientCounts],
  );
  const clientsWithoutEvents = useMemo(
    () => clients.filter((c) => !clientCounts[c.id]),
    [clients, clientCounts],
  );

  const toggleType = (t: CalendarEventType) =>
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const today = useMemo(() => startOfDay(new Date()), []);

  // 표시 범위 계산
  const { from, to, monthOf } = useMemo(() => {
    if (view === 'day') {
      const d = startOfDay(anchor);
      return { from: d, to: endOfDay(d), monthOf: d };
    }
    if (view === 'week') {
      const ws = addDays(startOfDay(anchor), -anchor.getDay());
      return { from: ws, to: endOfDay(addDays(ws, 6)), monthOf: ws };
    }
    // month: 그리드 시작(해당 월 1일에서 일요일까지 back) ~ 42칸
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    const gridEnd = addDays(gridStart, 41);
    return { from: gridStart, to: endOfDay(gridEnd), monthOf: first };
  }, [view, anchor]);

  const rangeKey = `${view}:${ymd(from)}:${ymd(to)}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.sales.calendar(from.toISOString(), to.toISOString());
      setEvents(data.events || []);
    } catch (e) {
      console.error('Calendar load failed:', e);
      setEvents([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  useEffect(() => {
    load();
  }, [load]);

  // yyyy-mm-dd → 이벤트[] (유형 필터 반영)
  const byDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of visibleEvents) {
      const key = ymd(new Date(ev.date));
      (map[key] = map[key] || []).push(ev);
    }
    return map;
  }, [visibleEvents]);

  // Esc로 닫기 — 팝업이 겹쳐 있으면 위(이벤트)부터 닫는다
  useEffect(() => {
    if (!openDay && !openEvent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openEvent) setOpenEvent(null);
      else setOpenDay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDay, openEvent]);

  const shift = (dir: number) => {
    if (view === 'month') setAnchor((a) => addMonths(a, dir));
    else if (view === 'week') setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => addDays(a, dir));
  };

  const periodLabel = useMemo(() => {
    if (view === 'day') {
      const d = startOfDay(anchor);
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
    }
    if (view === 'week') {
      const ws = addDays(startOfDay(anchor), -anchor.getDay());
      const we = addDays(ws, 6);
      return `${ymd(ws)} ~ ${String(we.getMonth() + 1).padStart(2, '0')}-${String(we.getDate()).padStart(2, '0')}`;
    }
    return `${monthOf.getFullYear()}년 ${monthOf.getMonth() + 1}월`;
  }, [view, anchor, monthOf]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Sales Calendar"
        title="영업 캘린더"
        description="출시·단종·영업 미팅·영업계획·할일 일정을 통합해서 보여줍니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportRangeButton
              events={visibleEvents}
              periodLabel={periodLabel}
              clientName={selectedClient?.name}
            />
            <PlanFormToggle onCreated={load} />
          </div>
        }
      />

      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-[var(--border-2)] overflow-hidden">
            <button
              onClick={() => shift(-1)}
              className="px-2.5 h-8 text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
              aria-label="이전"
            >
              ‹
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="px-3 h-8 text-[12.5px] text-[var(--text-2)] hover:bg-[var(--bg-2)] border-x border-[var(--border-2)] transition-colors"
            >
              오늘
            </button>
            <button
              onClick={() => shift(1)}
              className="px-2.5 h-8 text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
              aria-label="다음"
            >
              ›
            </button>
          </div>
          <span className="text-[15px] font-semibold text-[var(--text-1)] tabular">{periodLabel}</span>
        </div>

        <div className="flex items-center rounded-md border border-[var(--border-2)] overflow-hidden">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                'px-3 h-8 text-[12.5px] transition-colors ' +
                (view === v
                  ? 'bg-[var(--brand-500)] text-white'
                  : 'text-[var(--text-3)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)]')
              }
            >
              {v === 'day' ? '일' : v === 'week' ? '주' : '월'}
            </button>
          ))}
        </div>
      </div>

      {/* 거래처 필터 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[12px] text-[var(--text-3)]">거래처</span>
        <Select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full sm:w-[280px]"
        >
          <option value="">전체 거래처</option>
          {clientsWithEvents.length > 0 && (
            <optgroup label="이 기간에 일정 있음">
              {clientsWithEvents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({clientCounts[c.id]})
                </option>
              ))}
            </optgroup>
          )}
          {clientsWithoutEvents.length > 0 && (
            <optgroup label="이 기간에 일정 없음">
              {clientsWithoutEvents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        {selectedClient && (
          <>
            <Link
              href={`/sales/clients/${selectedClient.id}`}
              className="text-[12px] text-[var(--brand-400)] hover:text-[var(--brand-200)] transition-colors"
            >
              거래처 상세
            </Link>
            <button
              type="button"
              onClick={() => setClientId('')}
              className="text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
            >
              필터 해제
            </button>
            <span className="text-[11.5px] text-[var(--text-4)]">
              브랜드 공식 출시 일정은 특정 거래처에 속하지 않아 표시되지 않습니다. (거래처 전용 출시는 표시됨)
            </span>
          </>
        )}
      </div>

      {/* 유형 필터 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['launch', 'discontinuation', 'meeting', 'plan', 'todo'] as CalendarEventType[]).map((t) => {
          const meta = EVENT_META[t];
          const active = !hiddenTypes.has(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={active}
              onClick={() => toggleType(t)}
              className={
                'inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2.5 rounded-full border text-[12px] transition-colors ' +
                (active
                  ? 'border-[var(--border-2)] bg-[var(--bg-2)] text-[var(--text-1)]'
                  : 'border-[var(--border-1)] bg-transparent text-[var(--text-4)] line-through opacity-45')
              }
            >
              <span
                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border flex-shrink-0"
                style={
                  active
                    ? { background: meta.color, borderColor: meta.color }
                    : { borderColor: 'var(--border-3)' }
                }
              >
                {active && <span className="text-[9px] leading-none text-[#0B0C0D]">✓</span>}
              </span>
              <span>{meta.label}</span>
              <span className="tabular text-[var(--text-4)]">{typeCounts[t] || 0}</span>
            </button>
          );
        })}
        {hiddenTypes.size > 0 && (
          <button
            type="button"
            onClick={() => setHiddenTypes(new Set())}
            className="text-[12px] text-[var(--brand-400)] hover:text-[var(--brand-200)] transition-colors ml-1"
          >
            전체 표시
          </button>
        )}
      </div>

      {/* 캘린더 그리드 */}
      <Card padding="none" className="overflow-hidden mb-6">
        {/* 월 뷰는 모바일 전용 축약 레이아웃이 있고, 일 뷰는 세로 목록이라 최소 너비가 필요 없다.
            주 뷰만 7일을 나란히 놓아야 해서 가로 스크롤을 유지한다. */}
        <div className={view === 'week' ? 'touch-scroll-x' : ''}>
          <div className={view === 'week' ? 'min-w-[720px]' : ''}>
            {view === 'month' && (
              <MonthGrid
                from={from}
                monthOf={monthOf}
                today={today}
                byDay={byDay}
                onOpenDay={setOpenDay}
                onOpenEvent={setOpenEvent}
              />
            )}
            {view === 'week' && (
              <WeekGrid
                from={from}
                today={today}
                byDay={byDay}
                onOpenDay={setOpenDay}
                onOpenEvent={setOpenEvent}
              />
            )}
            {view === 'day' && (
              <DayView day={startOfDay(anchor)} byDay={byDay} onOpenEvent={setOpenEvent} />
            )}
          </div>
        </div>
      </Card>

      {/* 하단 리스트 */}
      {view === 'month' && (
        <p className="sm:hidden text-[11.5px] text-[var(--text-4)] mb-2 -mt-3">
          달력의 점은 일정 유형입니다. 날짜를 누르면 그날 일정 전체가 열립니다.
        </p>
      )}
      <div className="mb-2 text-[12.5px] text-[var(--text-3)]">
        {selectedClient ? `${selectedClient.name} 일정 ` : '이 기간의 일정 '}
        {visibleEvents.length}건
        {(hiddenTypes.size > 0 || selectedClient) && (
          <span className="text-[var(--text-4)]"> (필터 적용 중 · 이 기간 전체 {events.length}건)</span>
        )}
      </div>
      {loading ? (
        <CenterSpinner label="일정 불러오는 중" />
      ) : visibleEvents.length === 0 ? (
        <EmptyState
          title={
            selectedClient
              ? `이 기간에 ${selectedClient.name} 일정이 없습니다`
              : '이 기간에 표시할 일정이 없습니다'
          }
          description={
            selectedClient
              ? '다른 기간을 보거나 거래처 필터를 해제해보세요.'
              : '유형 필터를 조정하거나 다른 기간을 선택해보세요.'
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>날짜</TH>
              <TH>유형</TH>
              <TH>제목</TH>
              <TH className="hidden sm:table-cell">거래처</TH>
              <TH align="right"> </TH>
            </TR>
          </THead>
          <TBody>
            {[...visibleEvents]
              .sort((a, b) => +new Date(a.date) - +new Date(b.date))
              .map((ev) => {
                const meta = EVENT_META[ev.type];
                const planId = ev.type === 'plan' ? ev.id.replace(/^plan-/, '') : null;
                return (
                  <TR
                    key={ev.id}
                    className="cursor-pointer"
                    onClick={() => setOpenEvent(ev)}
                    title="클릭하면 요약을 봅니다"
                  >
                    <TD numeric muted>{fmtDate(ev.date)}</TD>
                    <TD>
                      <Badge tone={meta.tone} size="xs">
                        {meta.label}
                      </Badge>
                    </TD>
                    <TD emphasis>
                      <span className="text-[var(--brand-400)]">{ev.title}</span>
                    </TD>
                    <TD className="hidden sm:table-cell" muted>
                      {ev.clientName || '—'}
                    </TD>
                    {/* 행 전체가 요약 팝업을 여므로, 행 안의 버튼은 클릭이 위로 새지 않게 막는다 */}
                    <TD align="right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <EventExportActions ev={ev} />
                        {planId && <DeletePlanButton planId={planId} onDeleted={load} />}
                      </div>
                    </TD>
                  </TR>
                );
              })}
          </TBody>
        </Table>
      )}

      {openDay && (
        <DayDetailModal
          dayKey={openDay}
          events={byDay[openDay] || []}
          onPick={setOpenEvent}
          onClose={() => setOpenDay(null)}
        />
      )}
      {openEvent && (
        <EventDetailModal
          ev={openEvent}
          onClose={() => setOpenEvent(null)}
          onDeleted={() => {
            setOpenEvent(null);
            setOpenDay(null);
            load();
          }}
        />
      )}
    </AppLayout>
  );
}

// 하루치 일정 전체 — 달력 칸이 '+N건 더'로 접어 감춘 나머지를 여기서 본다
function DayDetailModal({
  dayKey,
  events,
  onPick,
  onClose,
}: {
  dayKey: string;
  events: CalendarEvent[];
  onPick: (ev: CalendarEvent) => void;
  onClose: () => void;
}) {
  const d = new Date(`${dayKey}T00:00:00`);
  const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[15px] font-semibold text-[var(--text-1)]">{label}</div>
          <div className="text-[12px] text-[var(--text-3)] mt-0.5">일정 {events.length}건</div>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="text-[var(--text-4)] hover:text-[var(--text-1)] transition-colors text-[16px] leading-none"
        >
          ✕
        </button>
      </div>
      {events.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[var(--text-3)]">이 날 표시할 일정이 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
          {events.map((ev) => {
            const meta = EVENT_META[ev.type];
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => onPick(ev)}
                className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md border border-[var(--border-1)] bg-[var(--bg-1)] hover:bg-[var(--bg-2)] transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: meta.color }}
                />
                <Badge tone={meta.tone} size="xs">
                  {meta.label}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-[var(--text-1)] truncate">{ev.title}</span>
                  {ev.clientName ? (
                    <span className="block text-[11px] text-[var(--text-4)] truncate">{ev.clientName}</span>
                  ) : null}
                </span>
                <span className="text-[var(--text-4)] text-[12px] flex-shrink-0">›</span>
              </button>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}

// 일정 하나의 요약 — 페이지로 넘어가지 않고 내용을 확인한다
function EventDetailModal({
  ev,
  onClose,
  onDeleted,
}: {
  ev: CalendarEvent;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const meta = EVENT_META[ev.type];
  const planId = ev.type === 'plan' ? ev.id.replace(/^plan-/, '') : null;
  const rows: [string, string][] = [];
  if (ev.launchScope) {
    rows.push(['출시 대상', ev.launchScope === 'client' ? '거래처 전용' : '브랜드 공식 출시']);
  }
  if (ev.clientName) rows.push(['거래처', ev.clientName]);
  if (ev.stage) rows.push(['영업 단계', STAGE_LABEL[ev.stage] || ev.stage]);
  if (ev.purpose) rows.push(['미팅 목적', ev.purpose]);
  if (ev.location) rows.push(['장소', ev.location]);
  if (ev.parentTitle) rows.push(['소속 일지', ev.parentTitle]);
  if (ev.author) rows.push(['작성자', ev.author]);
  if (ev.status) rows.push(['상태', ev.status]);

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge tone={meta.tone} size="xs">
              {meta.label}
            </Badge>
            {ev.type === 'todo' ? (
              <Badge tone={ev.done ? 'success' : 'warning'} size="xs">
                {ev.done ? '완료' : '진행 중'}
              </Badge>
            ) : null}
          </div>
          <div className="text-[15px] font-semibold text-[var(--text-1)] break-words">{ev.title}</div>
          <div className="text-[12px] text-[var(--text-3)] mt-1 tabular">{fmtDate(ev.date)}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="text-[var(--text-4)] hover:text-[var(--text-1)] transition-colors text-[16px] leading-none flex-shrink-0"
        >
          ✕
        </button>
      </div>

      {rows.length > 0 && (
        <dl className="mt-3 grid grid-cols-[86px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--text-4)]">{k}</dt>
              <dd className="text-[var(--text-2)] break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {ev.detail ? (
        <div className="mt-3">
          <div className="text-[11.5px] text-[var(--text-4)] mb-1">내용</div>
          <div className="text-[12.5px] text-[var(--text-2)] whitespace-pre-wrap break-words max-h-[30vh] overflow-y-auto rounded-md border border-[var(--border-1)] bg-[var(--bg-1)] p-2.5">
            {ev.detail}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* 영업계획은 캘린더 자체가 상세라 이동할 페이지가 따로 없다 */}
        {ev.type !== 'plan' && (
          <Link href={ev.url}>
            <Button variant="primary" size="sm">
              자세히 보기
            </Button>
          </Link>
        )}
        <EventExportActions ev={ev} />
        {planId && <DeletePlanButton planId={planId} onDeleted={onDeleted} />}
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-3 sm:p-8 bg-[var(--bg-overlay)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-md mt-6 sm:mt-16 mb-6" onClick={(e) => e.stopPropagation()}>
        <Card padding="lg" tone="elevated">
          {children}
        </Card>
      </div>
    </div>
  );
}

// 칩 클릭은 요약 팝업 — 칸 클릭(그날 전체 보기)과 겹치지 않게 전파를 끊는다
function EventChip({ ev, onOpen }: { ev: CalendarEvent; onOpen: (ev: CalendarEvent) => void }) {
  const meta = EVENT_META[ev.type];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(ev);
      }}
      title={`[${meta.label}] ${ev.title}`}
      className="flex items-center gap-1 w-full text-left truncate text-[11px] leading-tight rounded-sm pl-1 pr-1 py-[2px] hover:bg-[var(--bg-3)] transition-colors"
      style={{ borderLeft: `2px solid ${meta.color}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
      <span className="truncate text-[var(--text-2)]">{ev.title}</span>
    </button>
  );
}

function MonthGrid({
  from,
  monthOf,
  today,
  byDay,
  onOpenDay,
  onOpenEvent,
}: {
  from: Date;
  monthOf: Date;
  today: Date;
  byDay: Record<string, CalendarEvent[]>;
  onOpenDay: (key: string) => void;
  onOpenEvent: (ev: CalendarEvent) => void;
}) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <div>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={
              'text-center text-[11px] py-1.5 border-b border-[var(--border-1)] ' +
              (i === 0 ? 'text-[var(--danger-fg)]' : i === 6 ? 'text-[var(--info-fg)]' : 'text-[var(--text-3)]')
            }
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const key = ymd(d);
          const list = byDay[key] || [];
          const inMonth = d.getMonth() === monthOf.getMonth();
          const isToday = sameDay(d, today);
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 일정 ${list.length}건`}
              onClick={() => onOpenDay(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenDay(key);
                }
              }}
              className="min-h-[56px] sm:min-h-[94px] border-b border-r border-[var(--border-1)] p-1 flex flex-col gap-0.5 cursor-pointer hover:bg-[var(--bg-2)] transition-colors"
            >
              <div className="flex items-center justify-between px-0.5">
                <span
                  className={
                    'text-[11.5px] tabular ' +
                    (isToday
                      ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--brand-500)] text-white'
                      : inMonth
                      ? d.getDay() === 0
                        ? 'text-[var(--danger-fg)]'
                        : d.getDay() === 6
                        ? 'text-[var(--info-fg)]'
                        : 'text-[var(--text-2)]'
                      : 'text-[var(--text-4)]')
                  }
                >
                  {d.getDate()}
                </span>
              </div>
              {/* 모바일: 칸이 좁아 제목을 못 담으므로 유형별 점으로만 표시 (상세는 아래 목록에서 확인) */}
              <div className="sm:hidden flex flex-wrap items-center gap-[3px] px-0.5">
                {list.slice(0, 4).map((ev) => (
                  <span
                    key={ev.id}
                    title={`[${EVENT_META[ev.type].label}] ${ev.title}`}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: EVENT_META[ev.type].color }}
                  />
                ))}
                {list.length > 4 && (
                  <span className="text-[9.5px] text-[var(--text-4)] leading-none">+{list.length - 4}</span>
                )}
              </div>
              {/* 데스크톱: 제목까지 보여주는 기존 칩 */}
              <div className="hidden sm:flex flex-col gap-0.5 overflow-hidden">
                {list.slice(0, 3).map((ev) => (
                  <EventChip key={ev.id} ev={ev} onOpen={onOpenEvent} />
                ))}
                {list.length > 3 && (
                  <span className="text-[10.5px] text-[var(--brand-400)] pl-1">
                    +{list.length - 3}건 더 보기
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  from,
  today,
  byDay,
  onOpenDay,
  onOpenEvent,
}: {
  from: Date;
  today: Date;
  byDay: Record<string, CalendarEvent[]>;
  onOpenDay: (key: string) => void;
  onOpenEvent: (ev: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="grid grid-cols-7">
      {days.map((d, i) => {
        const key = ymd(d);
        const list = byDay[key] || [];
        const isToday = sameDay(d, today);
        return (
          <div key={key} className="min-h-[280px] border-r border-[var(--border-1)] flex flex-col">
            <button
              type="button"
              onClick={() => onOpenDay(key)}
              title="이 날 일정 전체 보기"
              className={
                'w-full text-center py-2 border-b border-[var(--border-1)] hover:bg-[var(--bg-2)] transition-colors ' +
                (isToday ? 'bg-[var(--bg-2)]' : '')
              }
            >
              <div
                className={
                  'text-[11px] ' +
                  (i === 0 ? 'text-[var(--danger-fg)]' : i === 6 ? 'text-[var(--info-fg)]' : 'text-[var(--text-3)]')
                }
              >
                {WEEKDAYS[d.getDay()]}
              </div>
              <div className={'text-[15px] font-semibold tabular ' + (isToday ? 'text-[var(--brand-400)]' : 'text-[var(--text-1)]')}>
                {d.getDate()}
              </div>
            </button>
            <div className="flex flex-col gap-1 p-1.5">
              {list.length === 0 ? (
                <span className="text-[10.5px] text-[var(--text-4)] text-center pt-2">—</span>
              ) : (
                list.map((ev) => <EventChip key={ev.id} ev={ev} onOpen={onOpenEvent} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({
  day,
  byDay,
  onOpenEvent,
}: {
  day: Date;
  byDay: Record<string, CalendarEvent[]>;
  onOpenEvent: (ev: CalendarEvent) => void;
}) {
  const list = byDay[ymd(day)] || [];
  return (
    <div className="p-4">
      {list.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[var(--text-3)]">이 날 등록된 일정이 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((ev) => {
            const meta = EVENT_META[ev.type];
            return (
              <div
                key={ev.id}
                onClick={() => onOpenEvent(ev)}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-md border border-[var(--border-1)] bg-[var(--bg-1)] cursor-pointer hover:bg-[var(--bg-2)] transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                <Badge tone={meta.tone} size="xs">
                  {meta.label}
                </Badge>
                <span className="text-[13px] text-[var(--text-1)] truncate flex-1 min-w-[140px]">
                  {ev.title}
                </span>
                {ev.clientName && <span className="text-[12px] text-[var(--text-3)]">{ev.clientName}</span>}
                <span onClick={(e) => e.stopPropagation()}>
                  <EventExportActions ev={ev} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 일정 하나를 구글 캘린더로 보내거나 .ics로 내려받는 버튼 묶음
function EventExportActions({ ev }: { ev: CalendarEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <a
        href={googleCalendarUrl(ev)}
        target="_blank"
        rel="noopener noreferrer"
        title="구글 캘린더에 이 일정 추가"
        className="inline-flex items-center h-7 px-2 rounded-md border border-[var(--border-2)] text-[12px] text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] transition-colors whitespace-nowrap"
      >
        구글 캘린더
      </a>
      <Button variant="ghost" size="xs" title="이 일정을 .ics 파일로 저장" onClick={() => downloadEventIcs(ev)}>
        .ics
      </Button>
    </div>
  );
}

// 현재 조회 범위의 일정 전체를 .ics 한 파일로 내보낸다 (화면에 적용한 필터를 그대로 따른다)
function ExportRangeButton({
  events,
  periodLabel,
  clientName,
}: {
  events: CalendarEvent[];
  periodLabel: string;
  clientName?: string;
}) {
  if (events.length === 0) return null;
  const slug = (s: string) => s.replace(/[^0-9A-Za-z가-힣]/g, '');
  const fileName = `영업캘린더_${clientName ? `${slug(clientName)}_` : ''}${slug(periodLabel)}.ics`;
  return (
    <Button
      variant="secondary"
      size="md"
      title={`${clientName ? `${clientName} · ` : ''}${periodLabel} 일정 ${events.length}건을 .ics 파일로 내보냅니다`}
      onClick={() => downloadIcs(events, fileName)}
    >
      일정 내보내기 ({events.length})
    </Button>
  );
}

function DeletePlanButton({ planId, onDeleted }: { planId: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="xs"
      loading={busy}
      onClick={async () => {
        if (!window.confirm('이 영업계획을 삭제할까요?')) return;
        setBusy(true);
        try {
          await api.sales.deletePlan(planId);
          onDeleted();
        } catch (e: any) {
          alert(e?.message || '삭제에 실패했습니다.');
          setBusy(false);
        }
      }}
    >
      삭제
    </Button>
  );
}

function PlanFormToggle({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="md" onClick={() => setOpen((o) => !o)}>
        {open ? '닫기' : '+ 영업계획 등록'}
      </Button>
      {open && <PlanFormModal onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

function PlanFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [planDate, setPlanDate] = useState(toDateInput(new Date()));
  const [clientId, setClientId] = useState('');
  const [stage, setStage] = useState('');
  const [location, setLocation] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.sales.listClients();
        setClients(data.clients || []);
      } catch {
        /* noop */
      }
    })();
    (async () => {
      try {
        const data = await api.sales.locations();
        setLocations(data.locations || []);
      } catch {
        /* 자동완성 목록은 실패해도 입력에는 영향 없음 */
      }
    })();
  }, []);

  const submit = async () => {
    setError('');
    if (!title.trim()) return setError('계획 제목을 입력해주세요.');
    if (!planDate) return setError('계획 일정을 입력해주세요.');
    if (!stage) return setError('영업 단계를 선택해주세요.');
    if (!clientId) return setError('거래처를 선택해주세요.');
    if (!location.trim()) return setError('장소(주소지)를 입력해주세요.');
    if (!content.trim()) return setError('내용을 입력해주세요.');
    setBusy(true);
    try {
      await api.sales.createPlan({
        title: title.trim(),
        planDate,
        clientId,
        stage,
        location: location.trim(),
        content: content.trim(),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message || '등록에 실패했습니다.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-3 sm:p-8 bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg mt-4 sm:mt-10 mb-6" onClick={(e) => e.stopPropagation()}>
        <Card padding="lg" tone="elevated">
          <div className="text-[15px] font-semibold text-[var(--text-1)] mb-4">영업계획 등록</div>
          <div className="flex flex-col gap-3 max-h-[70vh] sm:max-h-[85vh] overflow-y-auto">
            <Field label="제목" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: ○○마트 2차 제안 미팅 준비" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="일정" required>
                <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
              </Field>
              <Field label="영업 단계" required>
                <Select value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option value="">영업 단계 선택</option>
                  {SALES_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="거래처" required>
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">거래처 선택</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="장소(주소지)"
              required
              hint="과거에 입력한 장소를 자동완성으로 고를 수 있습니다."
            >
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                list="plan-location-list"
                placeholder="예: ○○마트 본사 3층 회의실"
              />
              <datalist id="plan-location-list">
                {locations.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </Field>
            <Field label="내용" required>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="계획 상세 내용" />
            </Field>
            {error && <div className="text-[12px] text-[var(--danger-fg)]">{error}</div>}
            <div className="flex justify-end gap-2 mt-1">
              <Button variant="ghost" size="md" onClick={onClose}>
                취소
              </Button>
              <Button variant="primary" size="md" loading={busy} onClick={submit}>
                등록
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
