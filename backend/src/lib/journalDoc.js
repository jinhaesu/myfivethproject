// 영업일지 → Word(.docx) 문서 생성
// 외부 팀 공유용 정리 문서. 열람 비밀번호 해시 등 민감 정보는 절대 포함하지 않는다.
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} = require('docx');
const { STAGE_LABEL } = require('./sales');

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D5D8DC' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return `${dt.getFullYear()}. ${String(dt.getMonth() + 1).padStart(2, '0')}. ${String(dt.getDate()).padStart(2, '0')}`;
}

function text(v, fallback = '—') {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s || fallback;
}

// 줄바꿈 포함 문자열 → Paragraph[] (docx는 \n을 자동 처리하지 않음)
function multiline(v, opts = {}) {
  const lines = text(v).split(/\r?\n/);
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: line || ' ', size: opts.size || 20, font: '맑은 고딕' })],
      }),
  );
}

function heading(t) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 140 },
    children: [new TextRun({ text: t, bold: true, size: 24, font: '맑은 고딕', color: '1F2933' })],
  });
}

function cell(children, opts = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shaded
      ? { type: ShadingType.CLEAR, fill: 'F2F4F6', color: 'auto' }
      : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children,
  });
}

// 라벨 / 값 2열 표
function infoTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            cell(
              [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 19, font: '맑은 고딕', color: '4B5563' })] })],
              { width: 24, shaded: true },
            ),
            cell(multiline(value, { size: 19 }), { width: 76 }),
          ],
        }),
    ),
  });
}

function quoteTable(items) {
  const header = ['제품명', '중량', 'USP', '맛', '제안가격'];
  const rows = [
    new TableRow({
      tableHeader: true,
      children: header.map((h) =>
        cell([new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: '맑은 고딕' })] })], {
          shaded: true,
        }),
      ),
    }),
    ...items.map(
      (q) =>
        new TableRow({
          children: [q.productName, q.weightSpec, q.usp, q.flavor, q.price].map((v) =>
            cell([new Paragraph({ children: [new TextRun({ text: text(v), size: 18, font: '맑은 고딕' })] })]),
          ),
        }),
    ),
  ];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function todoTable(todos) {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['일자', '해야 할 일', '계획', '상태'].map((h) =>
        cell([new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: '맑은 고딕' })] })], {
          shaded: true,
        }),
      ),
    }),
    ...todos.map(
      (t) =>
        new TableRow({
          children: [fmtDate(t.dueDate), text(t.content), text(t.plan), t.isDone ? '완료' : '진행 중'].map((v) =>
            cell([new Paragraph({ children: [new TextRun({ text: v, size: 18, font: '맑은 고딕' })] })]),
          ),
        }),
    ),
  ];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function note(t) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: t, size: 18, font: '맑은 고딕', color: '9AA0A6' })],
  });
}

/**
 * 영업일지 객체(client·author·todos·quoteItems·attachments 포함) → .docx Buffer
 */
async function buildJournalDocx(journal) {
  const clientName = journal.client?.name || '거래처';
  const stageLabel = journal.stage ? STAGE_LABEL[journal.stage] || journal.stage : '—';
  const authorName = journal.author
    ? `${journal.author.name || ''}${journal.author.email ? ` (${journal.author.email})` : ''}`.trim()
    : '—';

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: '영 업 일 지', bold: true, size: 34, font: '맑은 고딕' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
      children: [
        new TextRun({ text: `${clientName} · ${text(journal.title, '미팅 기록')}`, size: 21, font: '맑은 고딕', color: '4B5563' }),
      ],
    }),

    heading('1. 기본 정보'),
    infoTable([
      ['거래처', clientName],
      ['영업 단계', stageLabel],
      ['미팅 구분', journal.isFirstMeeting ? '최초 미팅' : '후속 미팅'],
      ['작성자', authorName],
      ['작성일', fmtDate(journal.createdAt)],
    ]),

    heading('2. 미팅 정보'),
    infoTable([
      ['미팅 일자', fmtDate(journal.meetingDate)],
      ['미팅 목적', journal.meetingPurpose],
      ['장소', journal.meetingLocation],
      ['참석자', journal.attendees],
      ['미팅 개요', journal.meetingSummary],
    ]),

    heading('3. 요청 · 기획 사항'),
    infoTable([
      ['핵심 요청사항', journal.keyRequests],
      ['제품 요청/기획', journal.productRequests],
    ]),

    heading('4. 견적 · 샘플'),
    infoTable([['샘플 제공', journal.sampleProvided ? '제공함' : '미제공']]),
    new Paragraph({ spacing: { after: 100 }, children: [] }),
  ];

  if (journal.quoteItems && journal.quoteItems.length) {
    children.push(quoteTable(journal.quoteItems));
  } else {
    children.push(note(journal.hasQuote ? '견적 제안 있음 (세부 항목 미기재)' : '견적 제안 없음'));
  }

  if (journal.isFirstMeeting && journal.client) {
    const c = journal.client;
    children.push(
      heading('5. 거래처 정보 (최초 미팅)'),
      infoTable([
        ['담당 조직', c.ownerOrg],
        ['바이어 구성', c.buyerComposition],
        ['바이어·거래처 연매출', c.annualRevenue],
        ['기존 거래처', c.existingVendors],
        ['관리 품목', c.managedItems],
        ['보관 조건', c.storageCondition],
        ['물류 조건', c.logisticsCondition],
      ]),
    );
  }

  const todoNo = journal.isFirstMeeting && journal.client ? '6' : '5';
  children.push(heading(`${todoNo}. 향후 스케쥴`));
  if (journal.todos && journal.todos.length) {
    children.push(todoTable(journal.todos));
  } else {
    children.push(note('등록된 향후 스케쥴이 없습니다.'));
  }

  const atts = (journal.attachments || []).filter((a) => a.kind !== 'card');
  if (atts.length) {
    children.push(
      heading(`${Number(todoNo) + 1}. 첨부 자료`),
      ...atts.map(
        (a) =>
          new Paragraph({
            spacing: { after: 60 },
            bullet: { level: 0 },
            children: [new TextRun({ text: a.fileName, size: 19, font: '맑은 고딕' })],
          }),
      ),
      note('※ 첨부 파일은 문서에 포함되지 않습니다. 공유 링크에서 내려받으세요.'),
    );
  }

  children.push(
    new Paragraph({ spacing: { before: 400 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `조인앤조인 · ${fmtDate(new Date())} 생성`,
          size: 17,
          font: '맑은 고딕',
          color: '9AA0A6',
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: '조인앤조인',
    title: `영업일지 - ${clientName}`,
    description: '영업일지 공유 문서',
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

// 다운로드 파일명 (한글 유지 → RFC 5987 인코딩은 라우트에서 처리)
function journalFileName(journal) {
  const clientName = (journal.client?.name || '거래처').replace(/[\\/:*?"<>|]/g, '');
  const d = journal.meetingDate || journal.createdAt;
  const dt = new Date(d);
  const stamp = isNaN(dt.getTime())
    ? ''
    : `_${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
  return `영업일지_${clientName}${stamp}.docx`;
}

module.exports = { buildJournalDocx, journalFileName };
