'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import ChangeLogSection from '@/components/ChangeLogSection';
import SalesTabs from '@/components/SalesTabs';
import MeetingPurposeField from '@/components/MeetingPurposeField';
import { api, getFileUrl } from '@/lib/api';
import {
  SalesJournal,
  SalesTodo,
  SalesContact,
  SALES_STAGES,
  STAGE_LABEL,
  STAGE_TONE,
  fmtDate,
  fmtDateTime,
  toDateInput,
} from '@/lib/sales';
import { userLabel } from '@/lib/user';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  Textarea,
  Field,
  Badge,
  CenterSpinner,
} from '@/components/ui';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 py-2 border-b border-[var(--border-1)] last:border-0">
      <div className="text-[12.5px] text-[var(--text-3)]">{label}</div>
      <div className="text-[13px] text-[var(--text-1)] whitespace-pre-wrap break-words">
        {value || <span className="text-[var(--text-4)]">—</span>}
      </div>
    </div>
  );
}

export default function SalesJournalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [journal, setJournal] = useState<SalesJournal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [lockedInfo, setLockedInfo] = useState<SalesJournal | null>(null);
  const [pw, setPw] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // 비밀번호 잠금 해제 토큰 — Word 다운로드 시에도 필요
  const [viewToken, setViewToken] = useState<string | undefined>(undefined);

  const load = useCallback(
    async (token?: string) => {
      setLoading(true);
      setError('');
      try {
        const data = await api.sales.getJournal(id, token);
        setJournal(data.journal);
        setNeedsPassword(false);
      } catch (e) {
        const err = e as Error & { status?: number; data?: any };
        if (err.data?.passwordRequired) {
          setNeedsPassword(true);
          setLockedInfo(err.data.journal || null);
        } else if (err.status === 403) {
          setError('이 영업일지를 열람할 권한이 없습니다.');
        } else {
          setError(err.message || '영업일지를 불러오지 못했습니다.');
        }
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const unlock = async () => {
    setUnlocking(true);
    setError('');
    try {
      const res = await api.sales.verifyJournalPassword(id, pw);
      setViewToken(res.token || undefined);
      await load(res.token || undefined);
    } catch (e) {
      setError((e as Error)?.message || '비밀번호가 일치하지 않습니다.');
    } finally {
      setUnlocking(false);
    }
  };

  const toggleTodo = async (t: SalesTodo) => {
    try {
      await api.sales.toggleTodo(t.id, !t.isDone);
      setJournal((j) =>
        j
          ? { ...j, todos: (j.todos || []).map((x) => (x.id === t.id ? { ...x, isDone: !x.isDone } : x)) }
          : j,
      );
    } catch (e) {
      console.error('todo toggle failed:', e);
    }
  };

  const remove = async () => {
    if (!confirm('이 영업일지를 삭제하시겠습니까?')) return;
    try {
      await api.sales.deleteJournal(id);
      router.push('/sales');
    } catch (e) {
      setError((e as Error)?.message || '삭제에 실패했습니다.');
    }
  };

  // ── 로딩 ──
  if (loading) {
    return (
      <AppLayout>
        <SalesTabs />
        <CenterSpinner label="영업일지 불러오는 중" />
      </AppLayout>
    );
  }

  // ── 비밀번호 잠금 ──
  if (needsPassword) {
    return (
      <AppLayout>
        <SalesTabs />
        <PageHeader
          eyebrow="Sales Journal"
          title={lockedInfo?.title || '잠긴 영업일지'}
          description="이 영업일지는 열람 비밀번호로 보호되어 있습니다."
        />
        <Card padding="lg" className="max-w-md">
          <CardHeader title="🔒 비밀번호 입력" subtitle="작성자에게 부여받은 열람 비밀번호를 입력하세요." />
          <div className="flex flex-col gap-3">
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlock()}
              placeholder="열람 비밀번호"
            />
            {error && <div className="text-[13px] text-[var(--danger-fg)]">{error}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="md" onClick={unlock} loading={unlocking}>
                잠금 해제
              </Button>
              <Link href="/sales">
                <Button variant="ghost" size="md">
                  목록으로
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </AppLayout>
    );
  }

  // ── 오류/권한 없음 ──
  if (error && !journal) {
    return (
      <AppLayout>
        <SalesTabs />
        <PageHeader eyebrow="Sales Journal" title="열람 불가" />
        <Card padding="lg" className="max-w-md">
          <p className="text-[13px] text-[var(--text-2)]">{error}</p>
          <div className="mt-3">
            <Link href="/sales">
              <Button variant="secondary" size="md">
                목록으로
              </Button>
            </Link>
          </div>
        </Card>
      </AppLayout>
    );
  }

  if (!journal) return null;

  const client = journal.client as { id?: string; name?: string } | undefined;
  const author = journal.author;

  // ── 수정 모드 ──
  if (editMode && journal.canEdit) {
    return (
      <AppLayout>
        <SalesTabs />
        <PageHeader eyebrow="Sales Journal" title="영업일지 수정" />
        <EditForm
          journal={journal}
          onCancel={() => setEditMode(false)}
          onSaved={async () => {
            setEditMode(false);
            await load();
          }}
        />
      </AppLayout>
    );
  }

  // ── 상세 ──
  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Sales Journal"
        title={journal.title || '영업일지'}
        description={
          <span className="flex items-center gap-1.5 flex-wrap">
            {journal.stage && (
              <Badge tone={STAGE_TONE[journal.stage] || 'neutral'} size="sm">
                {STAGE_LABEL[journal.stage] || journal.stage}
              </Badge>
            )}
            {journal.isFirstMeeting && (
              <Badge tone="info" size="sm">
                최초 미팅
              </Badge>
            )}
            {journal.passwordProtected && (
              <Badge tone="neutral" size="sm">
                🔒 비밀번호
              </Badge>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <WordDownloadButton journalId={journal.id} viewToken={viewToken} />
            {journal.canEdit && (
              <>
                <Button variant="secondary" size="md" onClick={() => setEditMode(true)}>
                  수정
                </Button>
                <Button variant="danger" size="md" onClick={remove}>
                  삭제
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-5 max-w-3xl">
        {journal.canEdit && <ShareCard journal={journal} onChanged={() => load(viewToken)} />}
        <Card padding="lg">
          <CardHeader title="거래처 · 작성 정보" />
          <Row
            label="거래처"
            value={
              client?.id ? (
                <Link
                  href={`/sales/clients/${client.id}`}
                  className="text-[var(--brand-400)] hover:text-[var(--brand-200)] transition-colors"
                >
                  {client.name}
                </Link>
              ) : (
                client?.name
              )
            }
          />
          <Row label="작성자" value={author ? userLabel(author) : '—'} />
          <Row label="작성일" value={fmtDateTime(journal.createdAt)} />
        </Card>

        <Card padding="lg">
          <CardHeader title="미팅 정보" />
          <Row label="미팅 일자" value={fmtDate(journal.meetingDate)} />
          <Row label="미팅 목적" value={journal.meetingPurpose} />
          <Row label="장소" value={journal.meetingLocation} />
          <Row label="참석자" value={journal.attendees} />
          <Row label="미팅 개요" value={journal.meetingSummary} />
          {/* 음성으로 쓴 일지는 원문을 함께 남긴다 — AI가 잘못 옮겼는지 여기서 대조한다 */}
          {journal.voiceTranscript ? (
            <details className="mt-3 pt-3 border-t border-[var(--border-1)]">
              <summary className="text-[12px] text-[var(--text-3)] cursor-pointer hover:text-[var(--text-1)] transition-colors">
                음성 원문 보기 (AI 정리 전)
              </summary>
              <div className="mt-2 text-[12.5px] text-[var(--text-3)] whitespace-pre-wrap break-words rounded-md border border-[var(--border-1)] bg-[var(--bg-1)] p-2.5">
                {journal.voiceTranscript}
              </div>
            </details>
          ) : null}
        </Card>

        <Card padding="lg">
          <CardHeader title="요청 · 기획 사항" />
          <Row label="핵심 요청사항" value={journal.keyRequests} />
          <Row label="제품 요청/기획" value={journal.productRequests} />
        </Card>

        <Card padding="lg">
          <CardHeader title="견적 · 샘플" />
          <Row
            label="샘플 제공"
            value={
              journal.sampleProvided ? (
                <Badge tone="success" size="sm">제공함</Badge>
              ) : (
                <span className="text-[var(--text-4)]">미제공</span>
              )
            }
          />
          {journal.quoteItems && journal.quoteItems.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12.5px] border-collapse min-w-[520px]">
                <thead>
                  <tr className="text-left text-[var(--text-3)]">
                    <th className="py-1.5 pr-3 font-medium">제품명</th>
                    <th className="py-1.5 pr-3 font-medium">중량</th>
                    <th className="py-1.5 pr-3 font-medium">USP</th>
                    <th className="py-1.5 pr-3 font-medium">맛</th>
                    <th className="py-1.5 pr-3 font-medium">제안가격</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.quoteItems.map((q, i) => (
                    <tr key={q.id || i} className="border-t border-[var(--border-1)]">
                      <td className="py-1.5 pr-3 text-[var(--text-1)] font-medium">{q.productName}</td>
                      <td className="py-1.5 pr-3 text-[var(--text-2)]">{q.weightSpec || '—'}</td>
                      <td className="py-1.5 pr-3 text-[var(--text-2)]">{q.usp || '—'}</td>
                      <td className="py-1.5 pr-3 text-[var(--text-2)]">{q.flavor || '—'}</td>
                      <td className="py-1.5 pr-3 text-[var(--text-1)] tabular">{q.price || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : journal.hasQuote ? (
            <p className="text-[12.5px] text-[var(--text-4)] mt-2">견적 제안 있음 (세부 항목 미기재)</p>
          ) : (
            <p className="text-[12.5px] text-[var(--text-4)] mt-2">견적 제안 없음</p>
          )}
        </Card>

        <AttachmentsSection journal={journal} onChanged={() => load()} />

        {journal.isFirstMeeting && client?.id && (
          <Card padding="lg">
            <CardHeader
              title="최초 미팅 · 거래처 정보"
              subtitle="거래처 마스터에 저장된 기본 정보입니다."
              actions={
                <Link href={`/sales/clients/${client.id}`}>
                  <Button variant="ghost" size="sm">
                    거래처 상세 →
                  </Button>
                </Link>
              }
            />
            <p className="text-[12.5px] text-[var(--text-3)]">
              담당조직·바이어 구성·연매출·보관/물류 조건은 거래처 상세에서 확인·수정할 수 있습니다.
            </p>
          </Card>
        )}

        <Card padding="lg">
          <CardHeader title="참고자" subtitle="열람 권한이 부여된 이메일" />
          {journal.referrers && journal.referrers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {journal.referrers.map((r) => (
                <Badge key={r.id} tone="neutral" size="sm">
                  {r.email}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-[13px] text-[var(--text-4)]">지정된 참고자가 없습니다.</span>
          )}
        </Card>

        <Card padding="lg">
          <CardHeader title="향후 스케쥴 (해야 할 일)" />
          {journal.todos && journal.todos.length > 0 ? (
            <div className="flex flex-col gap-2">
              {journal.todos.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-3 py-2 border-b border-[var(--border-1)] last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={t.isDone}
                    disabled={!journal.canEdit}
                    onChange={() => toggleTodo(t)}
                    className="mt-0.5 w-4 h-4 accent-[var(--brand-500)] disabled:opacity-50"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={t.isDone ? 'success' : 'warning'} size="xs">
                        {fmtDate(t.dueDate)}
                      </Badge>
                      <span
                        className={`text-[13px] ${t.isDone ? 'line-through text-[var(--text-4)]' : 'text-[var(--text-1)]'}`}
                      >
                        {t.content}
                      </span>
                    </div>
                    {t.plan && <div className="text-[12px] text-[var(--text-3)] mt-0.5">{t.plan}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[13px] text-[var(--text-4)]">등록된 향후 스케쥴이 없습니다.</span>
          )}
        </Card>

        {/* 수정 이력 */}
        <ChangeLogSection entityType="journal" entityId={journal.id} viewToken={viewToken} />
      </div>
    </AppLayout>
  );
}

// ============================================================
// 외부 공유 — 링크 복사 · Word 다운로드
// ============================================================
function WordDownloadButton({ journalId, viewToken }: { journalId: string; viewToken?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="md"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.sales.downloadJournalWord(journalId, viewToken);
        } catch (e) {
          alert((e as Error)?.message || 'Word 다운로드에 실패했습니다.');
        } finally {
          setBusy(false);
        }
      }}
    >
      Word 다운로드
    </Button>
  );
}

function ShareCard({ journal, onChanged }: { journal: SalesJournal; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const shareUrl = journal.shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/journal/${journal.shareToken}`
    : '';

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 클립보드 권한이 없는 브라우저 폴백
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const enableAndCopy = async () => {
    setBusy(true);
    setError('');
    try {
      if (journal.shareToken) {
        await copy(shareUrl);
      } else {
        const res = await api.sales.createShareLink(journal.id);
        const url = `${window.location.origin}/share/journal/${res.shareToken}`;
        await copy(url);
        onChanged();
      }
    } catch (e) {
      setError((e as Error)?.message || '공유 링크 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!confirm('공유 링크를 해제할까요? 기존 링크로는 더 이상 열람할 수 없습니다.')) return;
    setBusy(true);
    setError('');
    try {
      await api.sales.revokeShareLink(journal.id);
      onChanged();
    } catch (e) {
      setError((e as Error)?.message || '공유 해제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg">
      <CardHeader
        title="외부 공유"
        subtitle="링크를 아는 사람은 로그인 없이 이 일지를 읽기 전용으로 볼 수 있습니다."
      />
      {journal.shareToken ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Badge tone="success" size="sm">
              공유 중
            </Badge>
            {journal.sharedAt && (
              <span className="text-[11.5px] text-[var(--text-4)]">{fmtDateTime(journal.sharedAt)} 생성</span>
            )}
          </div>
          {/* 모바일에서는 URL 입력창과 복사 버튼이 나란히 놓기엔 좁아 세로로 쌓는다 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="primary" size="md" onClick={enableAndCopy} loading={busy} className="flex-shrink-0">
              {copied ? '복사됨 ✓' : '링크 복사'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={shareUrl} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm">
                공유 화면 미리보기 →
              </Button>
            </a>
            <Button variant="ghost" size="sm" onClick={revoke} loading={busy}>
              공유 해제
            </Button>
          </div>
          {journal.passwordProtected && (
            <p className="text-[11.5px] text-[var(--warning-fg)]">
              ⚠ 이 일지는 열람 비밀번호가 걸려 있지만, 공유 링크로는 비밀번호 없이 열립니다. 외부 전달 시 주의하세요.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-[12.5px] text-[var(--text-3)]">
            아직 공유 링크가 없습니다. 링크를 만들면 외부 팀에 그대로 전달할 수 있습니다.
          </p>
          <div>
            <Button variant="primary" size="md" onClick={enableAndCopy} loading={busy}>
              {copied ? '복사됨 ✓' : '공유 링크 만들고 복사'}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-[12px] text-[var(--danger-fg)] mt-2">{error}</p>}
    </Card>
  );
}

// ============================================================
// 첨부 (제안서 · 명함) — 표시/업로드/삭제
// ============================================================
function AttachmentsSection({ journal, onChanged }: { journal: SalesJournal; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<SalesContact[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const canEdit = !!journal.canEdit;
  const clientId = (journal.client as { id?: string } | undefined)?.id;

  // 거래처에 등록된 명함 목록 (불러오기용)
  useEffect(() => {
    if (!canEdit || !clientId) return;
    let alive = true;
    (async () => {
      try {
        const data = await api.sales.listContacts(clientId);
        if (alive) setContacts((data.contacts || []).filter((c: SalesContact) => c.cardImageUrl));
      } catch (e) {
        console.error('Failed to load contacts:', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canEdit, clientId]);

  const attachFromContact = async (contactId: string) => {
    setBusy(true);
    try {
      await api.sales.attachContactCard(journal.id, contactId);
      setPickerOpen(false);
      onChanged();
    } catch (e) {
      alert((e as Error)?.message || '명함 불러오기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const atts = journal.attachments || [];
  const proposals = atts.filter((a) => a.kind !== 'card');
  const cards = atts.filter((a) => a.kind === 'card');

  const upload = async (files: FileList | null, kind: 'proposal' | 'card') => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await api.sales.uploadJournalAttachment(journal.id, f, kind);
      }
      onChanged();
    } catch (e) {
      alert((e as Error)?.message || '업로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };
  const del = async (attId: string) => {
    if (!confirm('이 첨부를 삭제할까요?')) return;
    try {
      await api.sales.deleteAttachment(attId);
      onChanged();
    } catch (e) {
      alert((e as Error)?.message || '삭제에 실패했습니다.');
    }
  };

  return (
    <Card padding="lg">
      <CardHeader title="첨부 (선택)" subtitle="제안서 파일 · 거래처 명함 — 모두 필수가 아닙니다." />

      {/* 제안서 파일 */}
      <div className="text-[12.5px] font-medium text-[var(--text-2)] mb-2">제안서 파일</div>
      {proposals.length > 0 ? (
        <div className="flex flex-col gap-1.5 mb-2">
          {proposals.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 text-[12.5px] bg-[var(--bg-1)] border border-[var(--border-1)] rounded px-2.5 py-1.5"
            >
              <a
                href={getFileUrl(a.fileUrl)}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--brand-400)] hover:text-[var(--brand-200)] truncate transition-colors"
              >
                📄 {a.fileName}
              </a>
              {canEdit && (
                <button
                  onClick={() => del(a.id)}
                  className="text-[var(--text-4)] hover:text-[var(--danger-fg)] flex-shrink-0"
                  aria-label="삭제"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-[var(--text-4)] mb-2">첨부된 제안서가 없습니다.</p>
      )}
      {canEdit && (
        <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border-2)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[12.5px] text-[var(--text-1)] cursor-pointer transition-colors">
          + 제안서 추가
          <input
            type="file"
            multiple
            accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,image/*"
            className="hidden"
            onChange={(e) => {
              upload(e.target.files, 'proposal');
              e.target.value = '';
            }}
          />
        </label>
      )}

      {/* 거래처 명함 */}
      <div className="text-[12.5px] font-medium text-[var(--text-2)] mt-4 mb-2">거래처 명함</div>
      {cards.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {cards.map((a) => (
            <div key={a.id} className="relative">
              <a href={getFileUrl(a.fileUrl)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getFileUrl(a.fileUrl)}
                  alt={a.fileName}
                  className="w-28 h-20 object-cover rounded border border-[var(--border-1)]"
                />
              </a>
              {canEdit && (
                <button
                  onClick={() => del(a.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-fg)] text-[11px] flex items-center justify-center"
                  aria-label="삭제"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-[var(--text-4)] mb-2">첨부된 명함이 없습니다.</p>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border-2)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[12.5px] text-[var(--text-1)] cursor-pointer transition-colors">
            + 새 명함 이미지
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                upload(e.target.files, 'card');
                e.target.value = '';
              }}
            />
          </label>
          {contacts.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setPickerOpen((o) => !o)}>
              {pickerOpen ? '닫기' : '등록된 명함 불러오기'}
            </Button>
          )}
        </div>
      )}

      {/* 거래처에 등록된 담당자 명함 선택 */}
      {canEdit && pickerOpen && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => attachFromContact(c.id)}
              className="flex items-center gap-3 px-2.5 py-2 rounded-md border border-[var(--border-1)] bg-[var(--bg-1)] hover:bg-[var(--bg-2)] hover:border-[var(--brand-500)] transition-colors text-left disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getFileUrl(c.cardImageUrl || '')}
                alt={c.name}
                className="w-16 h-11 object-cover rounded border border-[var(--border-1)] flex-shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] text-[var(--text-1)] truncate">
                  {c.name}
                  {c.position ? ` ${c.position}` : ''}
                </span>
                <span className="block text-[11px] text-[var(--text-3)] truncate">
                  {[c.title, c.phone, c.email].filter(Boolean).join(' · ') || '연락처 미등록'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {busy && <p className="text-[12px] text-[var(--text-3)] mt-2">처리 중…</p>}
    </Card>
  );
}

// ============================================================
// 인라인 수정 폼
// ============================================================
interface TodoRow {
  dueDate: string;
  content: string;
  plan: string;
}

interface QuoteEditRow {
  productName: string;
  weightSpec: string;
  usp: string;
  flavor: string;
  price: string;
}

function EditForm({
  journal,
  onCancel,
  onSaved,
}: {
  journal: SalesJournal;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(journal.title || '');
  const [stage, setStage] = useState(journal.stage || '');
  const [isFirstMeeting, setIsFirstMeeting] = useState(!!journal.isFirstMeeting);
  const [meetingDate, setMeetingDate] = useState(
    journal.meetingDate ? toDateInput(new Date(journal.meetingDate)) : '',
  );
  const [meetingPurpose, setMeetingPurpose] = useState(journal.meetingPurpose || '');
  const [meetingLocation, setMeetingLocation] = useState(journal.meetingLocation || '');
  const [attendees, setAttendees] = useState(journal.attendees || '');
  const [meetingSummary, setMeetingSummary] = useState(journal.meetingSummary || '');
  const [keyRequests, setKeyRequests] = useState(journal.keyRequests || '');
  const [productRequests, setProductRequests] = useState(journal.productRequests || '');
  const [referrers, setReferrers] = useState<string[]>(
    journal.referrers && journal.referrers.length ? journal.referrers.map((r) => r.email) : [''],
  );
  const [todos, setTodos] = useState<TodoRow[]>(
    journal.todos && journal.todos.length
      ? journal.todos.map((t) => ({
          dueDate: t.dueDate ? toDateInput(new Date(t.dueDate)) : '',
          content: t.content,
          plan: t.plan || '',
        }))
      : [{ dueDate: '', content: '', plan: '' }],
  );
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [sampleProvided, setSampleProvided] = useState(!!journal.sampleProvided);
  const [hasQuote, setHasQuote] = useState(!!journal.hasQuote);
  const [quoteItems, setQuoteItems] = useState<QuoteEditRow[]>(
    journal.quoteItems && journal.quoteItems.length
      ? journal.quoteItems.map((q) => ({
          productName: q.productName,
          weightSpec: q.weightSpec || '',
          usp: q.usp || '',
          flavor: q.flavor || '',
          price: q.price || '',
        }))
      : [{ productName: '', weightSpec: '', usp: '', flavor: '', price: '' }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.sales.locations();
        setLocationOptions(data.locations || []);
      } catch (e) {
        console.error('Failed to load locations:', e);
      }
    })();
  }, []);

  // 필수 항목 — 체크박스·참고자·열람 비밀번호는 제외
  const validate = (): string => {
    const required: [string, string][] = [
      [title, '제목'],
      [stage, '영업 단계'],
      [meetingDate, '미팅 일자'],
      [meetingPurpose, '미팅 목적'],
      [meetingLocation, '장소'],
      [attendees, '참석자 정보'],
      [meetingSummary, '미팅 개요'],
      [keyRequests, '핵심 요청사항'],
      [productRequests, '제품의 구체적 요청 및 기획사항'],
    ];
    const missing = required.filter(([v]) => !v.trim()).map(([, label]) => label);
    if (!todos.some((t) => t.dueDate && t.content.trim())) {
      missing.push('향후 스케쥴 (일자 + 해야 할 일 1건 이상)');
    }
    if (hasQuote && !quoteItems.some((q) => q.productName.trim())) {
      missing.push('견적 항목 (제품명 1건 이상)');
    }
    return missing.length ? `필수 항목을 입력해주세요: ${missing.join(', ')}` : '';
  };

  const updateQuote = (i: number, key: keyof QuoteEditRow, v: string) =>
    setQuoteItems((q) => q.map((x, idx) => (idx === i ? { ...x, [key]: v } : x)));
  const addQuote = () =>
    setQuoteItems((q) => [...q, { productName: '', weightSpec: '', usp: '', flavor: '', price: '' }]);
  const removeQuote = (i: number) => setQuoteItems((q) => q.filter((_, idx) => idx !== i));

  const updateReferrer = (i: number, v: string) =>
    setReferrers((r) => r.map((x, idx) => (idx === i ? v : x)));
  const addReferrer = () => setReferrers((r) => [...r, '']);
  const removeReferrer = (i: number) => setReferrers((r) => r.filter((_, idx) => idx !== i));

  const updateTodo = (i: number, key: keyof TodoRow, v: string) =>
    setTodos((t) => t.map((x, idx) => (idx === i ? { ...x, [key]: v } : x)));
  const addTodo = () => setTodos((t) => [...t, { dueDate: '', content: '', plan: '' }]);
  const removeTodo = (i: number) => setTodos((t) => t.filter((_, idx) => idx !== i));

  const save = async () => {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title: title.trim() || undefined,
        stage: stage || undefined,
        isFirstMeeting,
        meetingDate: meetingDate || undefined,
        meetingPurpose: meetingPurpose.trim() || undefined,
        meetingLocation: meetingLocation.trim() || undefined,
        attendees: attendees.trim() || undefined,
        meetingSummary: meetingSummary.trim() || undefined,
        keyRequests: keyRequests.trim() || undefined,
        productRequests: productRequests.trim() || undefined,
        referrers: referrers.map((e) => e.trim()).filter(Boolean),
        todos: todos
          .filter((t) => t.dueDate && t.content.trim())
          .map((t) => ({ dueDate: t.dueDate, content: t.content.trim(), plan: t.plan.trim() || undefined })),
        sampleProvided,
        hasQuote,
        quoteItems: hasQuote
          ? quoteItems
              .filter((q) => q.productName.trim())
              .map((q) => ({
                productName: q.productName.trim(),
                weightSpec: q.weightSpec.trim() || undefined,
                usp: q.usp.trim() || undefined,
                flavor: q.flavor.trim() || undefined,
                price: q.price.trim() || undefined,
              }))
          : [],
      };
      if (clearPassword) payload.password = '';
      else if (password.trim()) payload.password = password.trim();
      await api.sales.updateJournal(journal.id, payload);
      onSaved();
    } catch (e) {
      setError((e as Error)?.message || '수정에 실패했습니다.');
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <Card padding="lg">
        <CardHeader title="기본 정보" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="제목" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="영업 단계" required hint="선택 시 거래처 파이프라인 단계가 함께 갱신됩니다.">
            <Select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">영업 단계 선택</option>
              {SALES_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="최초 미팅 여부">
            <label className="flex items-center gap-2 h-9 text-[13px] text-[var(--text-2)] cursor-pointer">
              <input
                type="checkbox"
                checked={isFirstMeeting}
                onChange={(e) => setIsFirstMeeting(e.target.checked)}
                className="w-4 h-4 accent-[var(--brand-500)]"
              />
              최초 미팅입니다
            </label>
          </Field>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader title="미팅 정보" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="미팅 일자" required>
            <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </Field>
          <MeetingPurposeField value={meetingPurpose} onChange={setMeetingPurpose} />
          <Field label="장소" required hint="과거에 입력한 장소를 자동완성으로 고를 수 있습니다.">
            <Input
              value={meetingLocation}
              onChange={(e) => setMeetingLocation(e.target.value)}
              list="journal-edit-location-list"
            />
            <datalist id="journal-edit-location-list">
              {locationOptions.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </Field>
          <Field label="참석자 정보" required>
            <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} />
          </Field>
          <Field label="미팅 개요" required className="sm:col-span-2">
            <Textarea value={meetingSummary} onChange={(e) => setMeetingSummary(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader title="요청 · 기획 사항" />
        <div className="grid grid-cols-1 gap-4">
          <Field label="핵심 요청사항" required>
            <Textarea value={keyRequests} onChange={(e) => setKeyRequests(e.target.value)} />
          </Field>
          <Field label="제품의 구체적 요청 및 기획사항" required>
            <Textarea value={productRequests} onChange={(e) => setProductRequests(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader title="견적 · 샘플" />
        <label className="flex items-center gap-2 text-[13px] text-[var(--text-2)] cursor-pointer mb-3">
          <input type="checkbox" checked={sampleProvided} onChange={(e) => setSampleProvided(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
          샘플 제공함
        </label>
        <label className="flex items-center gap-2 text-[13px] text-[var(--text-2)] cursor-pointer mb-1">
          <input type="checkbox" checked={hasQuote} onChange={(e) => setHasQuote(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
          견적 제안 있음
        </label>
        {hasQuote && (
          <div className="mt-3">
            <div className="hidden sm:grid grid-cols-[1.4fr_0.9fr_1.2fr_0.9fr_1fr_auto] gap-2 px-1 pb-1.5 text-[11px] text-[var(--text-3)]">
              <span>제품명</span><span>중량</span><span>USP</span><span>맛</span><span>제안가격</span><span />
            </div>
            {/* 모바일에서는 헤더 행이 없으므로 각 입력 위에 라벨을 붙이고 행을 카드로 구분한다 */}
            <div className="flex flex-col gap-2">
              {quoteItems.map((q, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.9fr_1.2fr_0.9fr_1fr_auto] gap-2 items-start rounded-md border border-[var(--border-1)] p-3 sm:border-0 sm:p-0"
                >
                  <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">제품명 {i + 1}</span>
                  <Input value={q.productName} onChange={(e) => updateQuote(i, 'productName', e.target.value)} placeholder="제품명" />
                  <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">중량</span>
                  <Input value={q.weightSpec} onChange={(e) => updateQuote(i, 'weightSpec', e.target.value)} placeholder="예: 80g" />
                  <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">USP</span>
                  <Input value={q.usp} onChange={(e) => updateQuote(i, 'usp', e.target.value)} placeholder="예: 고단백" />
                  <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">맛</span>
                  <Input value={q.flavor} onChange={(e) => updateQuote(i, 'flavor', e.target.value)} placeholder="예: 초코" />
                  <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">제안가격</span>
                  <Input value={q.price} onChange={(e) => updateQuote(i, 'price', e.target.value)} placeholder="예: 개당 1,200원" />
                  {quoteItems.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeQuote(i)}>삭제</Button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2">
              <Button variant="secondary" size="sm" onClick={addQuote}>+ 견적 항목 추가</Button>
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <CardHeader
          title="참고자"
          subtitle="로그인 이메일 기준으로 열람 권한이 부여됩니다."
          actions={
            <Button variant="secondary" size="sm" onClick={addReferrer}>
              + 참고자 추가
            </Button>
          }
        />
        <div className="flex flex-col gap-2">
          {referrers.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="email" value={r} onChange={(e) => updateReferrer(i, e.target.value)} placeholder="referrer@joinandjoin.com" />
              {referrers.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeReferrer(i)}>
                  삭제
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader
          title="향후 스케쥴 (해야 할 일) *"
          subtitle="일자 + 해야 할 일 최소 1건은 필수입니다."
          actions={
            <Button variant="secondary" size="sm" onClick={addTodo}>
              + 항목 추가
            </Button>
          }
        />
        <div className="flex flex-col gap-3">
          {todos.map((t, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr_auto] gap-2 items-start rounded-md border border-[var(--border-1)] p-3 sm:border-0 sm:p-0"
            >
              <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">기한</span>
              <Input type="date" value={t.dueDate} onChange={(e) => updateTodo(i, 'dueDate', e.target.value)} />
              <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">해야 할 일</span>
              <Input value={t.content} onChange={(e) => updateTodo(i, 'content', e.target.value)} placeholder="해야 할 일" />
              <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">대략적 계획 (선택)</span>
              <Input value={t.plan} onChange={(e) => updateTodo(i, 'plan', e.target.value)} placeholder="대략적 계획 (선택)" />
              {todos.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeTodo(i)}>
                  삭제
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader title="열람 비밀번호" subtitle="변경하려면 새 비밀번호를 입력하세요. 비워두면 기존 설정을 유지합니다." />
        <div className="flex flex-col gap-3 max-w-sm">
          <Field label="새 비밀번호">
            <Input
              type="password"
              value={password}
              disabled={clearPassword}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="변경 시에만 입력"
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-[var(--text-2)] cursor-pointer">
            <input
              type="checkbox"
              checked={clearPassword}
              onChange={(e) => setClearPassword(e.target.checked)}
              className="w-4 h-4 accent-[var(--brand-500)]"
            />
            비밀번호 잠금 해제
          </label>
        </div>
      </Card>

      {error && <div className="text-[13px] text-[var(--danger-fg)]">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="md" onClick={save} loading={saving}>
          저장
        </Button>
        <Button variant="ghost" size="md" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
