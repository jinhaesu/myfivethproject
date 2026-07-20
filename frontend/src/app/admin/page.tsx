'use client';

// 관리 메뉴 — 직원(사용자) 목록 확인·수정.
//
// 진입 통제는 백엔드가 판단한다(대표 계정은 무조건 통과, 그 외는 진입 비밀번호).
// 여기서는 게이트 상태를 물어보고 화면을 나눠 그리기만 한다.
// 발급받은 진입 토큰은 sessionStorage에 둬서 탭을 닫으면 사라지게 한다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Input,
  Select,
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

const TOKEN_KEY = 'adminGateToken';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  department: string | null;
  role: string;
  createdAt: string;
  isOwner: boolean;
  _count?: { salesJournals: number; launchProjects: number; labels: number };
}

interface GateState {
  isOwner: boolean;
  passwordSet: boolean;
  canEnter: boolean;
  blocked: boolean;
}

const ROLE_LABEL: Record<string, string> = { admin: '관리자', user: '일반' };

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

// ── 인라인 편집 셀 ─────────────────────────────────────────
// 클릭하면 입력창으로 바뀌고, Enter 또는 포커스 이탈 시 저장한다.
function InlineText({
  value,
  placeholder,
  onSave,
  ariaLabel,
}: {
  value: string | null;
  placeholder: string;
  onSave: (next: string) => Promise<void>;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const commit = async () => {
    if (busy) return;
    const next = draft.trim();
    if (next === (value || '')) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={ariaLabel}
        className="w-full text-left min-h-[32px] px-2 py-1 -mx-2 rounded-md hover:bg-[var(--bg-2)] transition-colors"
      >
        {value ? (
          <span className="text-[var(--text-1)]">{value}</span>
        ) : (
          <span className="text-[var(--text-4)]">{placeholder}</span>
        )}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      inputSize="sm"
      value={draft}
      disabled={busy}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setDraft(value || '');
          setEditing(false);
        }
      }}
    />
  );
}

// ── 비밀번호 관리 (대표 전용) ───────────────────────────────
function PasswordCard({
  passwordSet,
  onChanged,
}: {
  passwordSet: boolean;
  onChanged: () => void;
}) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    if (pw.trim().length < 4) {
      setError('비밀번호는 4자 이상으로 설정해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api.admin.setPassword(pw);
      setPw('');
      setNotice(res.message || '설정했습니다.');
      onChanged();
    } catch (e) {
      setError((e as Error)?.message || '비밀번호 설정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (
      !confirm(
        '진입 비밀번호를 해제하면 대표 계정 외에는 아무도 관리 메뉴에 들어올 수 없습니다.\n해제하시겠습니까?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api.admin.setPassword('');
      setPw('');
      setNotice(res.message || '해제했습니다.');
      onChanged();
    } catch (e) {
      setError((e as Error)?.message || '비밀번호 해제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className="mb-5">
      <CardHeader
        title="관리 메뉴 진입 비밀번호"
        subtitle="대표 계정은 비밀번호 없이 언제든 들어올 수 있습니다. 다른 직원은 여기서 설정한 비밀번호를 입력해야 진입할 수 있습니다."
        actions={
          <Badge tone={passwordSet ? 'success' : 'warning'} size="sm">
            {passwordSet ? '설정됨' : '미설정'}
          </Badge>
        }
      />

      {!passwordSet && (
        <p className="text-[12.5px] text-[var(--warning-fg)] mb-3">
          아직 비밀번호가 없어 대표 계정만 이 화면에 들어올 수 있습니다.
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <Field label={passwordSet ? '새 비밀번호' : '비밀번호'} className="flex-1 min-w-0">
          <Input
            type="password"
            value={pw}
            autoComplete="new-password"
            placeholder="4자 이상"
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="md" onClick={save} loading={busy}>
            {passwordSet ? '변경' : '설정'}
          </Button>
          {passwordSet && (
            <Button variant="danger" size="md" onClick={clear} disabled={busy}>
              해제
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-[12.5px] text-[var(--danger-fg)] mt-2">{error}</p>}
      {notice && !error && <p className="text-[12.5px] text-[var(--success-fg)] mt-2">{notice}</p>}
    </Card>
  );
}

// ── 비밀번호 입력 화면 ──────────────────────────────────────
function GateForm({ onUnlocked }: { onUnlocked: (token: string) => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!pw) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.admin.verifyPassword(pw);
      setPw('');
      onUnlocked(res.token || '');
    } catch (e) {
      setError((e as Error)?.message || '비밀번호가 일치하지 않습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className="max-w-md">
      <CardHeader title="🔒 관리 메뉴 비밀번호" subtitle="대표에게 부여받은 진입 비밀번호를 입력하세요." />
      <div className="flex flex-col gap-3">
        <Input
          type="password"
          value={pw}
          autoComplete="current-password"
          placeholder="진입 비밀번호"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <p className="text-[13px] text-[var(--danger-fg)]">{error}</p>}
        <div>
          <Button variant="primary" size="md" onClick={submit} loading={busy}>
            진입
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function AdminPage() {
  const [gate, setGate] = useState<GateState | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);

  // 마운트 시 저장해 둔 진입 토큰 복구 (sessionStorage는 클라이언트에서만 접근 가능)
  useEffect(() => {
    setToken(readToken());
  }, []);

  const loadUsers = useCallback(async (t: string | null) => {
    const data = await api.admin.listUsers(t);
    setUsers(data.users || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const t = readToken();
    setToken(t);
    try {
      const g: GateState = await api.admin.gate(t);
      setGate(g);
      if (g.canEnter) {
        await loadUsers(t);
      } else {
        setUsers(null);
      }
    } catch (e) {
      setError((e as Error)?.message || '관리 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    load();
  }, [load]);

  const onUnlocked = async (t: string) => {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t || null);
    await load();
  };

  // 낙관적 갱신 — 저장 실패 시 목록을 다시 불러 원복한다
  const saveUser = async (id: string, patch: { name?: string; department?: string; role?: string }) => {
    try {
      const res = await api.admin.updateUser(id, patch, token);
      setUsers((prev) => (prev ? prev.map((u) => (u.id === id ? { ...u, ...res.user } : u)) : prev));
      setError('');
    } catch (e) {
      setError((e as Error)?.message || '직원 정보 수정에 실패했습니다.');
      await loadUsers(token).catch(() => undefined);
    }
  };

  // 이름이 비어 있는 직원을 위로 — 이 화면의 주 목적이 이름 채우기라서
  const sorted = useMemo(() => {
    if (!users) return [];
    return [...users].sort((a, b) => {
      const an = a.name ? 1 : 0;
      const bn = b.name ? 1 : 0;
      if (an !== bn) return an - bn;
      return a.email.localeCompare(b.email);
    });
  }, [users]);

  const missingNames = useMemo(() => sorted.filter((u) => !u.name).length, [sorted]);

  if (loading) {
    return (
      <AppLayout>
        <CenterSpinner label="관리 정보 불러오는 중" />
      </AppLayout>
    );
  }

  // 비밀번호 미설정 + 대표가 아님 → 진입 자체가 불가
  if (gate?.blocked) {
    return (
      <AppLayout>
        <PageHeader eyebrow="Admin" title="관리" />
        <EmptyState
          title="아직 관리 메뉴가 열려 있지 않습니다"
          description="대표 계정에서 진입 비밀번호를 설정해야 다른 직원이 들어올 수 있습니다."
        />
      </AppLayout>
    );
  }

  // 비밀번호 필요
  if (gate && !gate.canEnter) {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Admin"
          title="관리"
          description="직원 목록을 보려면 진입 비밀번호가 필요합니다."
        />
        <GateForm onUnlocked={onUnlocked} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Admin"
        title="관리"
        description="로그인 가능한 직원 계정의 이름·부서·권한을 관리합니다. 이름을 지정하면 시스템 전반에서 이메일과 함께 표시됩니다."
        actions={
          <Button variant="secondary" size="md" onClick={load}>
            새로고침
          </Button>
        }
      />

      {gate?.isOwner && <PasswordCard passwordSet={!!gate.passwordSet} onChanged={load} />}

      {error && (
        <Card padding="md" className="mb-4">
          <p className="text-[13px] text-[var(--danger-fg)]">{error}</p>
        </Card>
      )}

      <Card padding="lg">
        <CardHeader
          title={`직원 ${sorted.length}명`}
          subtitle="이름·부서는 값을 클릭해 바로 수정할 수 있습니다. (Enter 저장 · Esc 취소)"
          actions={
            missingNames > 0 ? (
              <Badge tone="warning" size="sm">
                이름 미입력 {missingNames}명
              </Badge>
            ) : (
              <Badge tone="success" size="sm">
                이름 모두 입력됨
              </Badge>
            )
          }
        />

        {sorted.length === 0 ? (
          <EmptyState title="등록된 직원이 없습니다" />
        ) : (
          <>
            {/* 데스크톱: 표 */}
            <div className="hidden sm:block">
              <Table>
                <THead>
                  <TR>
                    <TH>이메일</TH>
                    <TH>이름</TH>
                    <TH>부서</TH>
                    <TH>권한</TH>
                    <TH align="right">작성 자료</TH>
                  </TR>
                </THead>
                <TBody>
                  {sorted.map((u) => (
                    <TR key={u.id}>
                      <TD emphasis>
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="break-all">{u.email}</span>
                          {u.isOwner && (
                            <Badge tone="brand" size="xs">
                              대표
                            </Badge>
                          )}
                        </span>
                      </TD>
                      <TD>
                        <InlineText
                          value={u.name}
                          placeholder="이름 입력"
                          ariaLabel={`${u.email} 이름`}
                          onSave={(v) => saveUser(u.id, { name: v })}
                        />
                      </TD>
                      <TD>
                        <InlineText
                          value={u.department}
                          placeholder="부서 입력"
                          ariaLabel={`${u.email} 부서`}
                          onSave={(v) => saveUser(u.id, { department: v })}
                        />
                      </TD>
                      <TD>
                        <Select
                          inputSize="sm"
                          value={u.role}
                          disabled={u.isOwner}
                          aria-label={`${u.email} 권한`}
                          onChange={(e) => saveUser(u.id, { role: e.target.value })}
                        >
                          <option value="user">일반</option>
                          <option value="admin">관리자</option>
                        </Select>
                      </TD>
                      <TD numeric muted>
                        일지 {u._count?.salesJournals ?? 0} · 출시 {u._count?.launchProjects ?? 0} · 표기{' '}
                        {u._count?.labels ?? 0}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            {/* 모바일: 카드 */}
            <div className="sm:hidden space-y-2">
              {sorted.map((u) => (
                <div
                  key={u.id}
                  className="rounded-lg border border-[var(--border-1)] bg-[var(--bg-1)] p-3"
                >
                  <div className="flex items-center gap-1.5 flex-wrap mb-2 min-w-0">
                    <span className="text-[13px] font-medium text-[var(--text-1)] break-all">
                      {u.email}
                    </span>
                    {u.isOwner && (
                      <Badge tone="brand" size="xs">
                        대표
                      </Badge>
                    )}
                    {!u.name && (
                      <Badge tone="warning" size="xs">
                        이름 미입력
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <div className="text-[11.5px] text-[var(--text-3)] mb-0.5">이름</div>
                      <InlineText
                        value={u.name}
                        placeholder="이름 입력"
                        ariaLabel={`${u.email} 이름`}
                        onSave={(v) => saveUser(u.id, { name: v })}
                      />
                    </div>
                    <div>
                      <div className="text-[11.5px] text-[var(--text-3)] mb-0.5">부서</div>
                      <InlineText
                        value={u.department}
                        placeholder="부서 입력"
                        ariaLabel={`${u.email} 부서`}
                        onSave={(v) => saveUser(u.id, { department: v })}
                      />
                    </div>
                    <div>
                      <div className="text-[11.5px] text-[var(--text-3)] mb-0.5">권한</div>
                      <Select
                        inputSize="sm"
                        value={u.role}
                        disabled={u.isOwner}
                        aria-label={`${u.email} 권한`}
                        onChange={(e) => saveUser(u.id, { role: e.target.value })}
                      >
                        <option value="user">일반</option>
                        <option value="admin">관리자</option>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-[var(--border-1)] text-[11.5px] text-[var(--text-4)]">
                    일지 {u._count?.salesJournals ?? 0} · 출시 {u._count?.launchProjects ?? 0} · 표기{' '}
                    {u._count?.labels ?? 0} · 권한 {ROLE_LABEL[u.role] || u.role}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </AppLayout>
  );
}
