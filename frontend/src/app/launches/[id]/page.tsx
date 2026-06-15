'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import {
  LaunchProject,
  LaunchStage,
  SampleRequest,
  getDday,
  STAGE_STATUS_LABEL,
  SAMPLE_STATUS_LABEL,
  NOTIFICATION_TYPE_LABEL,
} from '@/lib/launch';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Input,
  Textarea,
  Field,
  Badge,
  StatusPill,
  CenterSpinner,
} from '@/components/ui';

const STAGE_TONE: Record<string, 'neutral' | 'info' | 'success'> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
};

const SAMPLE_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  requested: 'warning',
  in_progress: 'info',
  delivered: 'success',
  canceled: 'neutral',
};

function SampleRequestSection({
  project,
  onChanged,
}: {
  project: LaunchProject;
  onChanged: () => void;
}) {
  const firstStage = project.stages[0];
  const canRequest = firstStage?.status === 'completed';
  const devStage = project.stages[1]; // 배합·시제품 개발 단계 — 기본 수신 담당자

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    recipientName: devStage?.ownerName || '',
    recipientEmail: devStage?.ownerEmail || '',
    dueDate: '',
    quantity: '',
    weightSpec: '',
    specDetails: '',
    salesChannel: project.salesChannels || '',
    message: '',
  });

  const setField = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipientEmail.trim() || !form.dueDate) {
      setNotice('담당자 이메일과 납기일은 필수입니다.');
      return;
    }
    try {
      setBusy(true);
      setNotice('');
      const res = await api.launches.createSampleRequest(project.id, {
        recipientName: form.recipientName.trim() || undefined,
        recipientEmail: form.recipientEmail.trim(),
        dueDate: form.dueDate,
        quantity: form.quantity.trim() || undefined,
        weightSpec: form.weightSpec.trim() || undefined,
        specDetails: form.specDetails.trim() || undefined,
        salesChannel: form.salesChannel.trim() || undefined,
        message: form.message.trim() || undefined,
      });
      setNotice(res.message);
      setShowForm(false);
      setForm((f) => ({ ...f, dueDate: '', quantity: '', weightSpec: '', specDetails: '', salesChannel: '', message: '' }));
      onChanged();
    } catch (err: any) {
      setNotice(err.message || '샘플 요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (requestId: string, status: string) => {
    try {
      setBusy(true);
      await api.launches.updateSampleRequest(requestId, { status });
      onChanged();
    } catch (err: any) {
      setNotice(err.message || '상태 변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const requests = project.sampleRequests || [];

  return (
    <Card padding="lg" className="mt-6">
      <CardHeader
        title="샘플 요청 (영업 선제안)"
        subtitle="기획·컨셉 단계 완료 후, 판매채널 제안용 샘플 제작을 담당자에게 요청합니다. 브랜드 유형·보관조건·USP·타겟 소비기한 등 출시 전략 정보가 요청 메일에 자동 포함됩니다."
        actions={
          canRequest ? (
            <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? '닫기' : '+ 샘플 요청'}
            </Button>
          ) : (
            <Badge tone="warning" size="sm">
              {firstStage ? `${firstStage.name.replace(/^\d+\.\s*/, '')} 단계 완료 후 요청 가능` : '단계 없음'}
            </Badge>
          )
        }
      />

      {notice && <p className="text-[12px] text-[var(--warning-fg)] mb-3">{notice}</p>}

      {showForm && canRequest && (
        <form
          onSubmit={submit}
          className="mb-5 p-4 rounded-md bg-[var(--bg-2)] border border-[var(--border-1)] space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="담당자 이름">
              <Input
                value={form.recipientName}
                onChange={(e) => setField({ recipientName: e.target.value })}
                placeholder={devStage?.ownerName || '샘플 제작 담당자'}
                inputSize="sm"
              />
            </Field>
            <Field label="담당자 이메일" required>
              <Input
                type="email"
                value={form.recipientEmail}
                onChange={(e) => setField({ recipientEmail: e.target.value })}
                placeholder="rd@joinandjoin.com"
                inputSize="sm"
              />
            </Field>
            <Field label="납기일 (언제까지)" required>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setField({ dueDate: e.target.value })}
                inputSize="sm"
              />
            </Field>
            <Field label="수량">
              <Input
                value={form.quantity}
                onChange={(e) => setField({ quantity: e.target.value })}
                placeholder="예: 20개 (채널 3곳 × 6개 + 여분)"
                inputSize="sm"
              />
            </Field>
            <Field label="중량 / 규격">
              <Input
                value={form.weightSpec}
                onChange={(e) => setField({ weightSpec: e.target.value })}
                placeholder="예: 개당 80g, 4입 트레이 포장"
                inputSize="sm"
              />
            </Field>
            <Field label="제안 판매채널">
              <Input
                value={form.salesChannel}
                onChange={(e) => setField({ salesChannel: e.target.value })}
                placeholder="예: 쿠팡 로켓프레시, ○○백화점 B2B"
                inputSize="sm"
              />
            </Field>
          </div>
          <Field label="스펙 상세">
            <Textarea
              value={form.specDetails}
              onChange={(e) => setField({ specDetails: e.target.value })}
              placeholder="맛/식감 방향, 포장 형태, 라벨 가안 필요 여부 등"
              rows={2}
            />
          </Field>
          <Field label="요청 메시지">
            <Textarea
              value={form.message}
              onChange={(e) => setField({ message: e.target.value })}
              placeholder="제안 일정·바이어 미팅 정보 등 담당자가 알아야 할 내용"
              rows={2}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              {busy ? '발송 중…' : '요청 등록 + 이메일 발송'}
            </Button>
          </div>
        </form>
      )}

      {requests.length === 0 ? (
        <p className="text-[12.5px] text-[var(--text-4)]">등록된 샘플 요청이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-1)]">
          {requests.map((r: SampleRequest) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={SAMPLE_TONE[r.status] || 'neutral'} size="sm" dot={r.status === 'in_progress'}>
                    {SAMPLE_STATUS_LABEL[r.status] || r.status}
                  </Badge>
                  <span className="text-[13px] text-[var(--text-1)] font-medium">
                    납기 {new Date(r.dueDate).toLocaleDateString('ko-KR')}
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">
                    → {r.recipientName || r.recipientEmail}
                    {r.recipientName ? ` (${r.recipientEmail})` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {r.status === 'requested' && (
                    <Button variant="secondary" size="xs" onClick={() => updateStatus(r.id, 'in_progress')} disabled={busy}>
                      제작 시작
                    </Button>
                  )}
                  {r.status === 'in_progress' && (
                    <Button variant="primary" size="xs" onClick={() => updateStatus(r.id, 'delivered')} disabled={busy}>
                      전달 완료
                    </Button>
                  )}
                  {(r.status === 'requested' || r.status === 'in_progress') && (
                    <Button variant="ghost" size="xs" onClick={() => updateStatus(r.id, 'canceled')} disabled={busy}>
                      취소
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-1.5 text-[12px] text-[var(--text-3)] space-x-3">
                {r.quantity && <span>수량: {r.quantity}</span>}
                {r.weightSpec && <span>중량/규격: {r.weightSpec}</span>}
                {r.salesChannel && <span>채널: {r.salesChannel}</span>}
                <span className="text-[var(--text-4)]">
                  요청 {r.requestedBy?.name || r.requestedBy?.email} ·{' '}
                  {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                </span>
              </div>
              {r.specDetails && (
                <p className="mt-1 text-[12px] text-[var(--text-4)]">스펙: {r.specDetails}</p>
              )}
              {r.message && (
                <p className="mt-1 text-[12px] text-[var(--text-4)] whitespace-pre-wrap">메시지: {r.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StageCard({
  stage,
  projectId,
  onChanged,
}: {
  stage: LaunchStage;
  projectId: string;
  onChanged: () => void;
}) {
  const [editingOwner, setEditingOwner] = useState(false);
  const [ownerName, setOwnerName] = useState(stage.ownerName || '');
  const [ownerEmail, setOwnerEmail] = useState(stage.ownerEmail || '');
  const [department, setDepartment] = useState(stage.department);
  const [dueDate, setDueDate] = useState(stage.dueDate ? stage.dueDate.slice(0, 10) : '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const completed = stage.tasks.filter((t) => t.isCompleted).length;
  const total = stage.tasks.length;

  const saveOwner = async () => {
    try {
      setBusy(true);
      await api.launches.updateStage(stage.id, {
        ownerName: ownerName.trim() || undefined,
        ownerEmail: ownerEmail.trim() || undefined,
        department: department.trim() || undefined,
        dueDate: dueDate || null,
      });
      setEditingOwner(false);
      onChanged();
    } catch (err: any) {
      setNotice(err.message || '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const startStage = async () => {
    try {
      setBusy(true);
      const res = await api.launches.updateStage(stage.id, { status: 'in_progress' });
      if (res.notification && !res.notification.delivered) {
        setNotice(`단계를 시작했지만 알림 미발송: ${res.notification.reason}`);
      }
      onChanged();
    } catch (err: any) {
      setNotice(err.message || '단계 시작에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const sendReminder = async () => {
    try {
      setBusy(true);
      setNotice('');
      await api.launches.notify(projectId, { stageId: stage.id });
      setNotice('리마인드 알림을 발송했습니다.');
    } catch (err: any) {
      setNotice(err.message || '알림 발송에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (taskId: string, isCompleted: boolean) => {
    try {
      await api.launches.updateTask(taskId, { isCompleted });
      onChanged();
    } catch (err) {
      console.error('Toggle task error:', err);
    }
  };

  const saveTaskNote = async (taskId: string, note: string, original: string | null) => {
    if (note === (original || '')) return;
    try {
      await api.launches.updateTask(taskId, { note });
      onChanged();
    } catch (err) {
      console.error('Save note error:', err);
    }
  };

  return (
    <Card padding="lg" className={stage.status === 'in_progress' ? 'border-[var(--brand-500)]' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[14px] font-semibold text-[var(--text-1)]">{stage.name}</span>
          <Badge tone={STAGE_TONE[stage.status] || 'neutral'} size="sm" dot={stage.status === 'in_progress'}>
            {STAGE_STATUS_LABEL[stage.status] || stage.status}
          </Badge>
          <span className="text-[12px] text-[var(--text-3)]">
            {department}
            {stage.ownerName ? ` · ${stage.ownerName}` : ''}
            {stage.ownerEmail ? ` (${stage.ownerEmail})` : ''}
          </span>
          {stage.dueDate && (
            <span className="text-[11.5px] text-[var(--text-4)] tabular">
              마감 {new Date(stage.dueDate).toLocaleDateString('ko-KR')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-[var(--text-3)] tabular mr-1">
            {completed}/{total}
          </span>
          {stage.status === 'pending' && (
            <Button variant="primary" size="xs" onClick={startStage} disabled={busy}>
              단계 시작 + 알림
            </Button>
          )}
          {stage.status === 'in_progress' && stage.ownerEmail && (
            <Button variant="secondary" size="xs" onClick={sendReminder} disabled={busy}>
              리마인드 발송
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={() => setEditingOwner((v) => !v)}>
            담당 편집
          </Button>
        </div>
      </div>

      {notice && <p className="text-[12px] text-[var(--warning-fg)] mb-2">{notice}</p>}

      {editingOwner && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 my-3 p-3 rounded-md bg-[var(--bg-2)] border border-[var(--border-1)]">
          <Field label="담당 부서">
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} inputSize="sm" />
          </Field>
          <Field label="담당자 이름">
            <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} inputSize="sm" />
          </Field>
          <Field label="담당자 이메일">
            <Input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              inputSize="sm"
            />
          </Field>
          <Field label="단계 마감일">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} inputSize="sm" />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" size="sm" onClick={saveOwner} disabled={busy}>
              저장
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-2 divide-y divide-[var(--border-1)]">
        {stage.tasks.map((task) => (
          <li key={task.id} className="py-2.5 flex items-start gap-3">
            <input
              type="checkbox"
              checked={task.isCompleted}
              onChange={(e) => toggleTask(task.id, e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border-2)] accent-[var(--brand-500)] cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <p
                className={
                  task.isCompleted
                    ? 'text-[13px] text-[var(--text-4)] line-through'
                    : 'text-[13px] text-[var(--text-1)]'
                }
              >
                {task.name}
              </p>
              {task.checkPoint && (
                <p className="text-[11.5px] text-[var(--text-4)] mt-0.5">체크: {task.checkPoint}</p>
              )}
              {task.isCompleted && task.completedBy && (
                <p className="text-[11px] text-[var(--success-fg)] mt-0.5">
                  ✓ {task.completedBy} ·{' '}
                  {task.completedAt ? new Date(task.completedAt).toLocaleDateString('ko-KR') : ''}
                </p>
              )}
            </div>
            <Input
              defaultValue={task.note || ''}
              placeholder="비고"
              inputSize="sm"
              className="w-40 sm:w-52"
              onBlur={(e) => saveTaskNote(task.id, e.target.value, task.note)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function LaunchDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = useState<LaunchProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProject = useCallback(async () => {
    try {
      const data = await api.launches.get(id);
      setProject(data.project);
    } catch (err: any) {
      setError(err.message || '출시 프로젝트 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const updateStatus = async (status: string) => {
    try {
      await api.launches.update(id, { status });
      fetchProject();
    } catch (err) {
      console.error('Update status error:', err);
    }
  };

  const isDisc = project?.kind === 'discontinuation';
  const listPath = isDisc ? '/discontinuations' : '/launches';
  const newPath = isDisc ? '/discontinuations/new' : '/launches/new';
  const procLabel = isDisc ? '단종' : '출시';

  const handleDelete = async () => {
    if (!confirm(`이 ${procLabel} 프로젝트를 삭제하시겠습니까? 모든 단계·체크리스트가 함께 삭제됩니다.`)) return;
    try {
      await api.launches.delete(id);
      router.push(listPath);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <CenterSpinner label="프로젝트 불러오는 중" />
      </AppLayout>
    );
  }

  if (error || !project) {
    return (
      <AppLayout>
        <Card padding="lg">
          <p className="text-[13px] text-[var(--danger-fg)]">{error || '프로젝트를 찾을 수 없습니다.'}</p>
        </Card>
      </AppLayout>
    );
  }

  const dday = getDday(project.targetLaunchDate);
  const allTasks = project.stages.flatMap((s) => s.tasks);
  const progress =
    allTasks.length > 0
      ? Math.round((allTasks.filter((t) => t.isCompleted).length / allTasks.length) * 100)
      : 0;

  return (
    <AppLayout>
      <PageHeader
        eyebrow={isDisc ? 'Discontinuation Operations' : 'Launch Operations'}
        title={project.productName}
        description={[
          project.productType,
          isDisc && project.discontinueReason ? `사유: ${project.discontinueReason}` : null,
          project.targetLaunchDate
            ? `${isDisc ? '단종 목표' : '출시 예정'} ${new Date(project.targetLaunchDate).toLocaleDateString('ko-KR')}${
                dday !== null ? ` (${dday === 0 ? 'D-DAY' : dday > 0 ? `D-${dday}` : `D+${-dday}`})` : ''
              }`
            : isDisc ? '목표일 미정' : '출시일 미정',
          project.description,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={project.status} size="md" kind={project.kind} />
            {project.status === 'on_hold' ? (
              <Button variant="secondary" size="sm" onClick={() => updateStatus('in_progress')}>
                재개
              </Button>
            ) : project.status !== 'completed' ? (
              <Button variant="secondary" size="sm" onClick={() => updateStatus('on_hold')}>
                보류
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`${newPath}?from=${project.id}`)}
            >
              프로젝트 복사
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              삭제
            </Button>
          </div>
        }
      />

      {/* 출시 전략 (출시 프로젝트 전용) */}
      {!isDisc && (project.brandType ||
        project.salesChannels ||
        project.storageCondition ||
        (project.usp && project.usp.length > 0) ||
        project.targetShelfLife) && (
        <Card padding="md" className="mb-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {project.brandType && (
              <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)]">
                브랜드
                <Badge tone="violet" size="sm">
                  {project.brandType}
                </Badge>
              </span>
            )}
            {project.storageCondition && (
              <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)]">
                보관
                <Badge tone="info" size="sm">
                  {project.storageCondition}
                </Badge>
              </span>
            )}
            {project.targetShelfLife && (
              <span className="text-[12.5px] text-[var(--text-3)]">
                타겟 소비기한 <span className="text-[var(--text-1)]">{project.targetShelfLife}</span>
              </span>
            )}
            {project.salesChannels && (
              <span className="text-[12.5px] text-[var(--text-3)]">
                영업채널 <span className="text-[var(--text-1)]">{project.salesChannels}</span>
              </span>
            )}
            {project.usp && project.usp.length > 0 && (
              <span className="flex items-center gap-1.5 flex-wrap text-[12.5px] text-[var(--text-3)]">
                USP
                {project.usp.map((u) => (
                  <Badge key={u} tone="success" size="xs">
                    {u}
                  </Badge>
                ))}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* 단계 파이프라인 요약 */}
      <Card padding="md" className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[12px] text-[var(--text-3)]">전체 진행률</span>
          <div className="flex-1 h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--brand-500)] transition-all duration-base ease-out-soft"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[12px] text-[var(--text-2)] tabular">{progress}%</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {project.stages.map((s) => (
            <a key={s.id} href={`#stage-${s.sortOrder}`} className="inline-flex">
              <Badge tone={STAGE_TONE[s.status] || 'neutral'} size="xs" dot={s.status === 'in_progress'}>
                {s.name.replace(/^\d+\.\s*/, '')}
              </Badge>
            </a>
          ))}
        </div>
      </Card>

      {/* 단계별 카드 */}
      <div className="space-y-4">
        {project.stages.map((stage) => (
          <div key={stage.id} id={`stage-${stage.sortOrder}`}>
            <StageCard stage={stage} projectId={project.id} onChanged={fetchProject} />
          </div>
        ))}
      </div>

      {/* 샘플 요청 (출시 프로젝트 전용) */}
      {!isDisc && <SampleRequestSection project={project} onChanged={fetchProject} />}

      {/* 알림 이력 */}
      <Card padding="lg" className="mt-6">
        <CardHeader
          title="알림 발송 이력"
          subtitle={`단계 시작·리마인드·${isDisc ? '단종 목표일' : '출시 일정'}(D-day) 알림 기록`}
        />
        {!project.notifications || project.notifications.length === 0 ? (
          <p className="text-[12.5px] text-[var(--text-4)]">발송된 알림이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-1)]">
            {project.notifications.map((n) => (
              <li key={n.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-[var(--text-2)]">
                  {NOTIFICATION_TYPE_LABEL[n.type] || n.type}
                  <span className="text-[var(--text-4)] ml-2">→ {n.sentTo}</span>
                </span>
                <span className="text-[11.5px] text-[var(--text-4)] tabular shrink-0">
                  {new Date(n.sentAt).toLocaleString('ko-KR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppLayout>
  );
}
