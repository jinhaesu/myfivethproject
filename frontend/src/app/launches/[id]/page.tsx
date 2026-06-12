'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import {
  LaunchProject,
  LaunchStage,
  getDday,
  STAGE_STATUS_LABEL,
  NOTIFICATION_TYPE_LABEL,
} from '@/lib/launch';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Input,
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

  const handleDelete = async () => {
    if (!confirm('이 출시 프로젝트를 삭제하시겠습니까? 모든 단계·체크리스트가 함께 삭제됩니다.')) return;
    try {
      await api.launches.delete(id);
      router.push('/launches');
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <CenterSpinner label="출시 프로젝트 불러오는 중" />
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
        eyebrow="Launch Operations"
        title={project.productName}
        description={[
          project.productType,
          project.targetLaunchDate
            ? `출시 예정 ${new Date(project.targetLaunchDate).toLocaleDateString('ko-KR')}${
                dday !== null ? ` (${dday === 0 ? 'D-DAY' : dday > 0 ? `D-${dday}` : `D+${-dday}`})` : ''
              }`
            : '출시일 미정',
          project.description,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={project.status} size="md" />
            {project.status === 'on_hold' ? (
              <Button variant="secondary" size="sm" onClick={() => updateStatus('in_progress')}>
                재개
              </Button>
            ) : project.status !== 'completed' ? (
              <Button variant="secondary" size="sm" onClick={() => updateStatus('on_hold')}>
                보류
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              삭제
            </Button>
          </div>
        }
      />

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

      {/* 알림 이력 */}
      <Card padding="lg" className="mt-6">
        <CardHeader title="알림 발송 이력" subtitle="단계 시작·리마인드·출시 일정(D-day) 알림 기록" />
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
