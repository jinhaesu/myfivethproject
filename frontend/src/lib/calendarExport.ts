// 캘린더 일정 → 구글 캘린더 / .ics 내보내기
// OAuth 없이 동작한다: 구글은 render?action=TEMPLATE 링크, 그 외 캘린더 앱은 .ics 파일.

import { CalendarEvent, EVENT_META } from '@/lib/sales';

// 백엔드 /calendar 응답에는 아직 location이 없지만, 추가되면 그대로 반영되도록 열어둔다.
export type ExportableEvent = CalendarEvent & { location?: string | null };

const PRODID = '-//JoinAndJoin//Launch and Compliance Console//KO';
const UID_DOMAIN = 'myfivethproject.joinandjoin.com';

// ── 날짜 처리 ────────────────────────────────────────────────
// 일정 값은 대부분 input[type=date]에서 온 날짜(=UTC 자정)라 종일 일정으로 다뤄야 한다.
// 자정이 아니면 시각이 지정된 일정으로 보고 UTC 타임스탬프로 내보낸다.
function isAllDay(iso: string): boolean {
  return /T00:00:00(\.000)?Z$/.test(iso);
}

// UTC 자정 값에서 달력상의 날짜(YYYYMMDD)를 그대로 뽑는다 (로컬 타임존 보정 없이).
function dateStampUTC(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

function addDaysToStamp(stamp: string, days: number): string {
  const y = Number(stamp.slice(0, 4));
  const m = Number(stamp.slice(4, 6));
  const d = Number(stamp.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

function utcStamp(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

// ── 이벤트 → 표시용 필드 ─────────────────────────────────────
function eventTitle(ev: ExportableEvent): string {
  const label = EVENT_META[ev.type]?.label || '일정';
  return `[${label}] ${ev.title}`;
}

function eventDescription(ev: ExportableEvent): string {
  const lines: string[] = [];
  if (ev.clientName) lines.push(`거래처: ${ev.clientName}`);
  if (ev.type === 'todo') lines.push(`상태: ${ev.done ? '완료' : '미완료'}`);
  if (ev.status) lines.push(`진행 상태: ${ev.status}`);
  if (typeof window !== 'undefined' && ev.url) {
    lines.push(`상세 보기: ${window.location.origin}${ev.url}`);
  }
  lines.push('제품 출시 관리 및 표기사항 검수 시스템에서 내보냄');
  return lines.join('\n');
}

function eventUrl(ev: ExportableEvent): string {
  if (typeof window === 'undefined' || !ev.url) return '';
  return `${window.location.origin}${ev.url}`;
}

// ── 구글 캘린더 링크 ─────────────────────────────────────────
/**
 * 구글 캘린더 '일정 만들기' 화면을 미리 채워서 여는 링크.
 * 로그인된 구글 계정에서 열리며, 사용자가 저장 버튼을 눌러야 실제로 등록된다.
 */
export function googleCalendarUrl(ev: ExportableEvent): string {
  const iso = new Date(ev.date).toISOString();
  let dates: string;

  if (isAllDay(iso)) {
    const start = dateStampUTC(iso);
    // 구글의 종일 일정은 종료일이 exclusive라 하루를 더한다.
    dates = `${start}/${addDaysToStamp(start, 1)}`;
  } else {
    const start = new Date(ev.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 기본 1시간
    dates = `${utcStamp(start)}/${utcStamp(end)}`;
  }

  const params: Record<string, string> = {
    action: 'TEMPLATE',
    text: eventTitle(ev),
    dates,
    details: eventDescription(ev),
  };
  if (ev.location) params.location = ev.location;

  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  return `https://calendar.google.com/calendar/render?${qs}`;
}

// ── .ics 생성 (RFC 5545) ─────────────────────────────────────
// TEXT 값의 특수문자 이스케이프. 순서 중요 — 역슬래시를 먼저 처리해야 한다.
function escapeText(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// 한 줄은 75옥텟을 넘을 수 없다. 넘으면 CRLF + 공백으로 접는다.
// 한글은 UTF-8에서 3바이트이므로 문자 수가 아니라 바이트 수로 세야 한다.
function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75; // 접힌 줄은 선행 공백 1바이트를 쓰므로 74

  // 코드포인트 단위로 순회 — 서로게이트 페어(이모지 등)가 쪼개지지 않게
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    if (curBytes + chBytes > limit) {
      parts.push(cur);
      cur = ch;
      curBytes = chBytes;
      limit = 74;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  if (cur) parts.push(cur);
  return parts.join('\r\n ');
}

/** 이벤트 목록 → .ics 문서 문자열 */
export function buildIcs(events: ExportableEvent[], now: Date = new Date()): string {
  const stamp = utcStamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    const iso = new Date(ev.date).toISOString();
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@${UID_DOMAIN}`);
    lines.push(`DTSTAMP:${stamp}`);

    if (isAllDay(iso)) {
      const start = dateStampUTC(iso);
      lines.push(`DTSTART;VALUE=DATE:${start}`);
      lines.push(`DTEND;VALUE=DATE:${addDaysToStamp(start, 1)}`);
    } else {
      const start = new Date(ev.date);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART:${utcStamp(start)}`);
      lines.push(`DTEND:${utcStamp(end)}`);
    }

    lines.push(`SUMMARY:${escapeText(eventTitle(ev))}`);
    lines.push(`DESCRIPTION:${escapeText(eventDescription(ev))}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    const url = eventUrl(ev);
    if (url) lines.push(`URL:${url}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // 각 줄을 접은 뒤 CRLF로 결합. 마지막 줄에도 CRLF를 붙여야 하는 파서가 있다.
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** .ics 파일 다운로드 */
export function downloadIcs(events: ExportableEvent[], fileName: string) {
  const ics = buildIcs(events);
  // BOM 없이 UTF-8. text/calendar여야 모바일에서 캘린더 앱으로 열린다.
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.ics') ? fileName : `${fileName}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 단일 일정 .ics 다운로드 — 파일명에 일정 제목과 날짜를 넣는다 */
export function downloadEventIcs(ev: ExportableEvent) {
  const date = new Date(ev.date).toISOString().slice(0, 10).replace(/-/g, '');
  const safe = ev.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  downloadIcs([ev], `${safe}_${date}.ics`);
}
