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
  fmtDate,
  toDateInput,
} from '@/lib/sales';
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
  const [loading, setLoading] = useState(true);

  // 유형 필터 적용 후 이벤트 (렌더링은 전부 이 목록 기준)
  const visibleEvents = useMemo(
    () => events.filter((e) => !hiddenTypes.has(e.type)),
    [events, hiddenTypes],
  );

  // 현재 범위의 유형별 개수 (필터 칩에 표시 — 미필터 events 기준)
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.type] = (c[e.type] || 0) + 1;
    return c;
  }, [events]);

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
        actions={<PlanFormToggle onCreated={load} />}
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
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {view === 'month' && <MonthGrid from={from} monthOf={monthOf} today={today} byDay={byDay} />}
            {view === 'week' && <WeekGrid from={from} today={today} byDay={byDay} />}
            {view === 'day' && <DayView day={startOfDay(anchor)} byDay={byDay} />}
          </div>
        </div>
      </Card>

      {/* 하단 리스트 */}
      <div className="mb-2 text-[12.5px] text-[var(--text-3)]">
        이 기간의 일정 {visibleEvents.length}건
        {hiddenTypes.size > 0 && (
          <span className="text-[var(--text-4)]"> (일부 유형 숨김 · 전체 {events.length}건)</span>
        )}
      </div>
      {loading ? (
        <CenterSpinner label="일정 불러오는 중" />
      ) : visibleEvents.length === 0 ? (
        <EmptyState title="이 기간에 표시할 일정이 없습니다" description="유형 필터를 조정하거나 다른 기간을 선택해보세요." />
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
                  <TR key={ev.id}>
                    <TD numeric muted>{fmtDate(ev.date)}</TD>
                    <TD>
                      <Badge tone={meta.tone} size="xs">
                        {meta.label}
                      </Badge>
                    </TD>
                    <TD emphasis>
                      <Link href={ev.url} className="text-[var(--brand-400)] hover:text-[var(--brand-200)] transition-colors">
                        {ev.title}
                      </Link>
                    </TD>
                    <TD className="hidden sm:table-cell" muted>
                      {ev.clientName || '—'}
                    </TD>
                    <TD align="right">
                      {planId && <DeletePlanButton planId={planId} onDeleted={load} />}
                    </TD>
                  </TR>
                );
              })}
          </TBody>
        </Table>
      )}
    </AppLayout>
  );
}

function EventChip({ ev }: { ev: CalendarEvent }) {
  const meta = EVENT_META[ev.type];
  return (
    <Link
      href={ev.url}
      title={`[${meta.label}] ${ev.title}`}
      className="flex items-center gap-1 truncate text-[11px] leading-tight rounded-sm pl-1 pr-1 py-[2px] hover:bg-[var(--bg-3)] transition-colors"
      style={{ borderLeft: `2px solid ${meta.color}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
      <span className="truncate text-[var(--text-2)]">{ev.title}</span>
    </Link>
  );
}

function MonthGrid({
  from,
  monthOf,
  today,
  byDay,
}: {
  from: Date;
  monthOf: Date;
  today: Date;
  byDay: Record<string, CalendarEvent[]>;
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
              className="min-h-[94px] border-b border-r border-[var(--border-1)] p-1 flex flex-col gap-0.5"
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
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {list.slice(0, 3).map((ev) => (
                  <EventChip key={ev.id} ev={ev} />
                ))}
                {list.length > 3 && (
                  <span className="text-[10.5px] text-[var(--text-4)] pl-1">+{list.length - 3}건 더</span>
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
}: {
  from: Date;
  today: Date;
  byDay: Record<string, CalendarEvent[]>;
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
            <div
              className={
                'text-center py-2 border-b border-[var(--border-1)] ' +
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
            </div>
            <div className="flex flex-col gap-1 p-1.5">
              {list.length === 0 ? (
                <span className="text-[10.5px] text-[var(--text-4)] text-center pt-2">—</span>
              ) : (
                list.map((ev) => <EventChip key={ev.id} ev={ev} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ day, byDay }: { day: Date; byDay: Record<string, CalendarEvent[]> }) {
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
              <Link
                key={ev.id}
                href={ev.url}
                className="flex items-center gap-3 p-3 rounded-md border border-[var(--border-1)] bg-[var(--bg-1)] hover:bg-[var(--bg-2)] transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                <Badge tone={meta.tone} size="xs">
                  {meta.label}
                </Badge>
                <span className="text-[13px] text-[var(--text-1)] truncate flex-1">{ev.title}</span>
                {ev.clientName && <span className="text-[12px] text-[var(--text-3)]">{ev.clientName}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg mt-10" onClick={(e) => e.stopPropagation()}>
        <Card padding="lg" tone="elevated">
          <div className="text-[15px] font-semibold text-[var(--text-1)] mb-4">영업계획 등록</div>
          <div className="flex flex-col gap-3 max-h-[85vh] overflow-y-auto">
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
