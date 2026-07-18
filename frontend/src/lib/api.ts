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

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
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
    list: (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.search) query.set('search', params.search);
      if (params?.status) query.set('status', params.status);
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
    // 거래처
    listClients: () => request('/sales/clients'),
    getClient: (id: string) => request(`/sales/clients/${id}`),
    createClient: (data: any) =>
      request('/sales/clients', { method: 'POST', body: JSON.stringify(data) }),
    updateClient: (id: string, data: any) =>
      request(`/sales/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteClient: (id: string) => request(`/sales/clients/${id}`, { method: 'DELETE' }),
    // 명함(담당자)
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
    // 영업계획
    listPlans: (clientId?: string) =>
      request(`/sales/plans${clientId ? `?clientId=${clientId}` : ''}`),
    createPlan: (data: any) =>
      request('/sales/plans', { method: 'POST', body: JSON.stringify(data) }),
    updatePlan: (id: string, data: any) =>
      request(`/sales/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePlan: (id: string) => request(`/sales/plans/${id}`, { method: 'DELETE' }),
    // 통합 캘린더
    calendar: (from?: string, to?: string) => {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      return request(`/sales/calendar${q.toString() ? `?${q.toString()}` : ''}`);
    },
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
