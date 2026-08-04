const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    console.error(`API 요청 실패: ${API_URL}${path}`, err);
    throw new Error('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  }

  const data = await res.json().catch(() => ({} as any));

  // 401이라도 '열람 비밀번호가 필요/틀렸다'는 신호(영업일지·관리 메뉴)는 세션 만료가 아니다.
  // 구분하지 않으면 비밀번호를 한 번 틀렸을 때 앱 전체에서 로그아웃돼 버린다.
  const isGateSignal = !!(data?.passwordRequired || data?.invalidPassword);
  if (res.status === 401 && !isGateSignal) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    // 에러에 상태코드·응답 본문을 붙여 호출부가 세부 플래그(passwordRequired 등)를 검사할 수 있게 함
    const err = new Error(data.error || '요청에 실패했습니다.') as Error & { status?: number; data?: any };
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || 'http://localhost:4000';

async function uploadFile(path: string, file: File, fieldName: string = 'designFile') {
  const token = getToken();
  const formData = new FormData();
  formData.append(fieldName, file);

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (err) {
    console.error(`Upload 요청 실패: ${API_URL}${path}`, err);
    throw new Error('서버에 연결할 수 없습니다.');
  }

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '업로드에 실패했습니다.');
  }
  return data;
}

// 인증이 필요한 파일 다운로드 (Word 등) — blob으로 받아 브라우저 저장
async function downloadBlob(path: string, fallbackName: string, headers: Record<string, string> = {}) {
  const token = getToken();
  const h: Record<string, string> = { ...headers };
  if (token) h['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers: h });
  if (!res.ok) {
    let msg = '다운로드에 실패했습니다.';
    try {
      const d = await res.json();
      msg = d.error || msg;
    } catch {
      /* 바이너리 응답이 아닌 경우 무시 */
    }
    throw new Error(msg);
  }

  // Content-Disposition의 filename*(UTF-8) 우선 사용
  const cd = res.headers.get('Content-Disposition') || '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="([^"]+)"/i.exec(cd);
  const name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 관리 메뉴 전용 요청 — 진입 토큰을 헤더에 얹는 것 외에는 공용 request()와 동일하다.
// (게이트 신호 401을 세션 만료와 구분하는 처리는 request() 안에 있다)
function adminRequest(path: string, options: RequestInit = {}, adminToken?: string | null) {
  return request(path, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
    },
  });
}

// 로그인 없이 접근하는 공개(공유 링크) 요청
async function publicRequest(path: string) {
  const res = await fetch(`${API_URL}${path}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || '요청에 실패했습니다.') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

export function getFileUrl(filePath: string): string {
  if (!filePath) return '';
  // Next.js rewrites를 통해 /uploads/* → 백엔드로 프록시
  // 상대 경로를 반환하여 환경에 관계없이 동작하도록 함
  return filePath;
}

export const api = {
  auth: {
    sendCode: (email: string) =>
      request('/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    verifyCode: (email: string, code: string) =>
      request('/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      }),
    magicLogin: (token: string) =>
      request('/auth/magic-login', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    getMe: () => request('/auth/me'),
    updateProfile: (data: { name?: string; department?: string }) =>
      request('/auth/me', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  labels: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      completion?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.search) query.set('search', params.search);
      if (params?.status) query.set('status', params.status);
      if (params?.completion) query.set('completion', params.completion);
      return request(`/labels?${query.toString()}`);
    },
    get: (id: string) => request(`/labels/${id}`),
    create: (data: any) =>
      request('/labels', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/labels/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/labels/${id}`, { method: 'DELETE' }),
  },
  ai: {
    generateLabel: (data: any) =>
      request('/ai/generate-label', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    checkCompliance: (data: any) =>
      request('/ai/check-compliance', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    extractFromLinks: (data: any) =>
      request('/ai/extract-from-links', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    reviewDesignVsReport: (labelId: string) =>
      request(`/ai/review-design-vs-report/${labelId}`, { method: 'POST' }),
    draftSalesJournal: (data: any) =>
      request('/ai/draft-sales-journal', { method: 'POST', body: JSON.stringify(data) }),
    parseBusinessCard: (imageBase64: string, mediaType: string) =>
      request('/ai/parse-business-card', { method: 'POST', body: JSON.stringify({ imageBase64, mediaType }) }),
  },
  reviews: {
    updateItem: (itemId: string, data: { isCompleted?: boolean; reviewerNote?: string; reviewerName?: string }) =>
      request(`/reviews/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getProgress: (labelId: string) => request(`/reviews/progress/${labelId}`),
    sendNotification: (data: { labelId: string; productName: string; email: string; deadline: string; message?: string }) =>
      request('/reviews/send-notification', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  launches: {
    list: (kind?: string) => request(`/launches${kind ? `?kind=${kind}` : ''}`),
    getTemplate: (kind?: string) => request(`/launches/meta/template${kind ? `?kind=${kind}` : ''}`),
    clientSuggestions: (kind?: string) =>
      request(`/launches/meta/client-suggestions${kind ? `?kind=${kind}` : ''}`),
    get: (id: string) => request(`/launches/${id}`),
    create: (data: {
      kind?: string;
      productName: string;
      productType?: string;
      weightSpec?: string;
      description?: string;
      targetLaunchDate?: string;
      discontinueReason?: string;
      brandType?: string;
      launchScope?: string;
      clientId?: string;
      clientIds?: string[];
      salesChannels?: string;
      storageCondition?: string;
      usp?: string[];
      targetShelfLife?: string;
      editPassword?: string;
      stageOwners?: Array<{ sortOrder: number; ownerName?: string; ownerEmail?: string; department?: string; dueDate?: string }>;
    }) =>
      request('/launches', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    verifyEditPassword: (id: string, password: string) =>
      request(`/launches/${id}/verify-edit-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    update: (id: string, data: any, editToken?: string) =>
      request(`/launches/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: editToken ? { 'X-Edit-Token': editToken } : undefined,
      }),
    delete: (id: string, editToken?: string) =>
      request(`/launches/${id}`, {
        method: 'DELETE',
        headers: editToken ? { 'X-Edit-Token': editToken } : undefined,
      }),
    updateStage: (
      stageId: string,
      data: { ownerName?: string; ownerEmail?: string; department?: string; dueDate?: string | null; status?: string },
      editToken?: string
    ) =>
      request(`/launches/stages/${stageId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: editToken ? { 'X-Edit-Token': editToken } : undefined,
      }),
    updateTask: (
      taskId: string,
      data: { isCompleted?: boolean; note?: string; completedBy?: string },
      editToken?: string
    ) =>
      request(`/launches/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: editToken ? { 'X-Edit-Token': editToken } : undefined,
      }),
    notify: (id: string, data: { stageId: string; message?: string }, editToken?: string) =>
      request(`/launches/${id}/notify`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: editToken ? { 'X-Edit-Token': editToken } : undefined,
      }),
    createSampleRequest: (
      id: string,
      data: {
        recipientName?: string;
        recipientEmail: string;
        dueDate: string;
        quantity?: string;
        weightSpec?: string;
        specDetails?: string;
        salesChannel?: string;
        clientId?: string;
        message?: string;
      },
      editToken?: string
    ) =>
      request(`/launches/${id}/sample-requests`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: editToken ? { 'X-Edit-Token': editToken } : undefined,
      }),
    updateSampleRequest: (requestId: string, data: { status: string }, editToken?: string) =>
      request(`/launches/sample-requests/${requestId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: editToken ? { 'X-Edit-Token': editToken } : undefined,
      }),
  },
  sales: {
    // 파이프라인 단계 메타
    stages: () => request('/sales/meta/stages'),
    // 과거 입력 장소 목록 (자동완성)
    locations: () => request('/sales/meta/locations'),
    // 거래처
    listClients: () => request('/sales/clients'),
    getClient: (id: string) => request(`/sales/clients/${id}`),
    createClient: (data: any) =>
      request('/sales/clients', { method: 'POST', body: JSON.stringify(data) }),
    updateClient: (id: string, data: any) =>
      request(`/sales/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteClient: (id: string) => request(`/sales/clients/${id}`, { method: 'DELETE' }),
    // 명함(담당자)
    listContacts: (clientId: string) => request(`/sales/clients/${clientId}/contacts`),
    createContact: (clientId: string, data: any) =>
      request(`/sales/clients/${clientId}/contacts`, { method: 'POST', body: JSON.stringify(data) }),
    updateContact: (id: string, data: any) =>
      request(`/sales/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteContact: (id: string) => request(`/sales/contacts/${id}`, { method: 'DELETE' }),
    uploadCard: (contactId: string, file: File) =>
      uploadFile(`/sales/contacts/${contactId}/card`, file, 'cardImage'),
    // 영업일지
    listJournals: (clientId?: string) =>
      request(`/sales/journals${clientId ? `?clientId=${clientId}` : ''}`),
    getJournal: (id: string, viewToken?: string) =>
      request(`/sales/journals/${id}`, {
        headers: viewToken ? { 'X-Journal-Token': viewToken } : undefined,
      }),
    createJournal: (data: any) =>
      request('/sales/journals', { method: 'POST', body: JSON.stringify(data) }),
    updateJournal: (id: string, data: any) =>
      request(`/sales/journals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteJournal: (id: string) => request(`/sales/journals/${id}`, { method: 'DELETE' }),
    verifyJournalPassword: (id: string, password: string) =>
      request(`/sales/journals/${id}/verify-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    toggleTodo: (id: string, isDone: boolean) =>
      request(`/sales/todos/${id}`, { method: 'PUT', body: JSON.stringify({ isDone }) }),
    // 첨부(제안서·명함)
    uploadJournalAttachment: (journalId: string, file: File, kind: 'proposal' | 'card' | 'etc') =>
      uploadFile(`/sales/journals/${journalId}/attachments?kind=${kind}`, file, 'file'),
    deleteAttachment: (id: string) => request(`/sales/attachments/${id}`, { method: 'DELETE' }),
    // 거래처에 등록된 명함을 첨부로 불러오기
    attachContactCard: (journalId: string, contactId: string) =>
      request(`/sales/journals/${journalId}/attachments/from-contact`, {
        method: 'POST',
        body: JSON.stringify({ contactId }),
      }),
    // 외부 공유 링크
    createShareLink: (journalId: string, regenerate = false) =>
      request(`/sales/journals/${journalId}/share`, {
        method: 'POST',
        body: JSON.stringify({ regenerate }),
      }),
    revokeShareLink: (journalId: string) =>
      request(`/sales/journals/${journalId}/share`, { method: 'DELETE' }),
    // Word 다운로드 (사내)
    downloadJournalWord: (journalId: string, viewToken?: string) =>
      downloadBlob(
        `/sales/journals/${journalId}/word`,
        '영업일지.docx',
        viewToken ? { 'X-Journal-Token': viewToken } : {},
      ),
    // 공개 공유 링크 (로그인 불필요)
    publicJournal: (token: string) => publicRequest(`/sales/public/journals/${token}`),
    publicJournalWordUrl: (token: string) => `${API_URL}/sales/public/journals/${token}/word`,
    // 영업계획
    listPlans: (clientId?: string) =>
      request(`/sales/plans${clientId ? `?clientId=${clientId}` : ''}`),
    createPlan: (data: any) =>
      request('/sales/plans', { method: 'POST', body: JSON.stringify(data) }),
    updatePlan: (id: string, data: any) =>
      request(`/sales/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePlan: (id: string) => request(`/sales/plans/${id}`, { method: 'DELETE' }),
    // 영업 대시보드
    dashboard: () => request('/sales/dashboard'),
    // 매출채권 (거래처별 월별 잔액)
    receivables: (year: number) => request(`/sales/receivables?year=${year}`),
    upsertReceivable: (data: { clientId: string; year: number; month: number; amount: number }) =>
      request('/sales/receivables', { method: 'POST', body: JSON.stringify(data) }),
    // 파이프라인 분석 — 단계별 병목·승패·예상 계약일 기준 매출 타임라인
    pipelineAnalytics: () => request('/sales/pipeline/analytics'),
    // 드롭다운 선택지(딜 상태·실패 사유·미팅 목적) — 백엔드와 어긋나지 않게 서버에서 받는다
    options: () => request('/sales/meta/options'),
    // 통합 캘린더
    calendar: (from?: string, to?: string) => {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      return request(`/sales/calendar${q.toString() ? `?${q.toString()}` : ''}`);
    },
  },
  changelog: {
    // 출시/단종/검수 등 열람 제한이 없는 자료의 변경 이력
    list: (entityType: string, entityId: string) =>
      request(`/changelog/${entityType}/${entityId}`),
    // 출시 프로젝트 본체 + 하위 단계·업무 이력을 한 번에
    project: (projectId: string) => request(`/changelog/project/${projectId}/all`),
    // 라벨(제품) 단위 QCQA 검수 항목 이력
    labelReview: (labelId: string) => request(`/changelog/label/${labelId}/review`),
    // 전사 최근 변경 활동 피드 (대시보드)
    recent: (opts: { days?: number; limit?: number; group?: string } = {}) => {
      const q = new URLSearchParams();
      if (opts.days) q.set('days', String(opts.days));
      if (opts.limit) q.set('limit', String(opts.limit));
      if (opts.group) q.set('group', opts.group);
      return request(`/changelog/recent${q.toString() ? `?${q.toString()}` : ''}`);
    },
    // 영업일지는 열람 권한 검사가 필요해 sales 라우트에서 처리
    journal: (journalId: string, viewToken?: string) =>
      request(`/sales/journals/${journalId}/history`, {
        headers: viewToken ? { 'X-Journal-Token': viewToken } : {},
      }),
  },
  admin: {
    // 진입 게이트 상태 — 대표 여부·비밀번호 설정 여부·현재 진입 가능 여부
    gate: (adminToken?: string | null) => adminRequest('/admin/gate', {}, adminToken),
    // 비밀번호 확인 → 진입 토큰 발급 (대표는 token: null로 통과)
    verifyPassword: (password: string) =>
      adminRequest('/admin/gate/verify', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    // 진입 비밀번호 설정/변경. 빈 문자열이면 해제 (대표 전용)
    setPassword: (password: string) =>
      adminRequest('/admin/gate/password', {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }),
    // 직원 목록
    listUsers: (adminToken?: string | null) => adminRequest('/admin/users', {}, adminToken),
    // 직원 이름·부서·권한 수정
    updateUser: (
      id: string,
      data: { name?: string; department?: string; role?: string },
      adminToken?: string | null,
    ) =>
      adminRequest(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }, adminToken),
  },
  uploads: {
    uploadDesign: (labelId: string, file: File) =>
      uploadFile(`/uploads/${labelId}/design`, file, 'designFile'),
    deleteDesign: (labelId: string) =>
      request(`/uploads/${labelId}/design`, { method: 'DELETE' }),
    uploadManufacturingReport: (labelId: string, file: File) =>
      uploadFile(`/uploads/${labelId}/manufacturing-report`, file, 'reportFile'),
    deleteManufacturingReport: (labelId: string) =>
      request(`/uploads/${labelId}/manufacturing-report`, { method: 'DELETE' }),
    getReportPageImages: (labelId: string) =>
      request(`/uploads/${labelId}/manufacturing-report/page-images`),
    applyReportMask: (labelId: string, pageRects: any[]) =>
      request(`/uploads/${labelId}/manufacturing-report/apply-mask`, {
        method: 'POST',
        body: JSON.stringify({ pageRects }),
      }),
  },
};
