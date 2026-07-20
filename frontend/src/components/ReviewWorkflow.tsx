'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import ChangeLogSection from '@/components/ChangeLogSection';

interface ReviewItem {
  id: string;
  taskName: string;
  department: string;
  isCompleted: boolean;
  reviewerName: string | null;
  reviewerNote: string | null;
  completedAt: string | null;
  reviewer: {
    id: string;
    name: string | null;
    department: string | null;
  } | null;
}

interface ReviewCategory {
  id: string;
  name: string;
  items: ReviewItem[];
}

interface Props {
  labelId: string;
  productName: string;
  reviewCategories: ReviewCategory[];
  onUpdate: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  '법적 필수 표기': 'border-red-500 bg-red-50',
  '문안 및 소구': 'border-orange-500 bg-orange-50',
  '디자인/바코드': 'border-purple-500 bg-purple-50',
  '최종 확인': 'border-blue-500 bg-blue-50',
  '최종 승인': 'border-green-500 bg-green-50',
};

const DEPT_COLORS: Record<string, string> = {
  '품질팀': 'bg-blue-100 text-blue-700',
  '법무팀': 'bg-red-100 text-red-700',
  '마케팅팀': 'bg-purple-100 text-purple-700',
  '연구팀': 'bg-green-100 text-green-700',
  '디자인팀': 'bg-pink-100 text-pink-700',
  '생산팀': 'bg-yellow-100 text-yellow-700',
  '경영팀': 'bg-indigo-100 text-indigo-700',
};

export default function ReviewWorkflow({ labelId, productName, reviewCategories, onUpdate }: Props) {
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [editingName, setEditingName] = useState<string | null>(null);
  const [reviewerWarning, setReviewerWarning] = useState<string | null>(null);

  // 이메일 알림 상태
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailDeadline, setEmailDeadline] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleToggleItem = async (itemId: string, isCompleted: boolean, reviewerName: string | null) => {
    // 체크하려는 경우(완료 처리) 검토자 이름 필수 확인
    if (!isCompleted && !reviewerName) {
      setReviewerWarning(itemId);
      setTimeout(() => setReviewerWarning(null), 3000);
      return;
    }

    setLoadingItems((prev) => ({ ...prev, [itemId]: true }));
    try {
      await api.reviews.updateItem(itemId, { isCompleted: !isCompleted });
      onUpdate();
    } catch (error) {
      console.error('Failed to update review item:', error);
    } finally {
      setLoadingItems((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleSaveNote = async (itemId: string) => {
    setLoadingItems((prev) => ({ ...prev, [itemId]: true }));
    try {
      await api.reviews.updateItem(itemId, {
        reviewerNote: noteInputs[itemId] || '',
      });
      setEditingNote(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setLoadingItems((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleSaveName = async (itemId: string) => {
    setLoadingItems((prev) => ({ ...prev, [itemId]: true }));
    try {
      await api.reviews.updateItem(itemId, {
        reviewerName: nameInputs[itemId] || '',
      });
      setEditingName(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to save reviewer name:', error);
    } finally {
      setLoadingItems((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) return;
    if (!emailDeadline.trim()) return;

    setEmailSending(true);
    setEmailResult(null);
    try {
      await api.reviews.sendNotification({
        labelId,
        productName,
        email: emailTo.trim(),
        deadline: emailDeadline,
        message: emailMessage,
      });
      setEmailResult({ success: true, message: '검토 요청 이메일이 발송되었습니다.' });
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailResult(null);
        setEmailTo('');
        setEmailDeadline('');
        setEmailMessage('');
      }, 2000);
    } catch (error: any) {
      setEmailResult({ success: false, message: error.message || '이메일 발송에 실패했습니다.' });
    } finally {
      setEmailSending(false);
    }
  };

  // 전체 진행률 계산
  const allItems = reviewCategories.flatMap((c) => c.items);
  const completedCount = allItems.filter((i) => i.isCompleted).length;
  const totalCount = allItems.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // 기본 마감일: 오늘 + 3일
  const defaultDeadline = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  })();

  return (
    <div>
      {/* 전체 진행률 */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-lg font-bold">검토 진행 현황</h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500">
              {completedCount} / {totalCount} 완료
            </span>
            <button
              onClick={() => {
                setShowEmailModal(true);
                if (!emailDeadline) setEmailDeadline(defaultDeadline);
              }}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              이메일로 검토 요청
            </button>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all duration-500 ${
              overallProgress === 100 ? 'bg-green-500' : 'bg-blue-600'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-500">{overallProgress}%</span>
          {overallProgress === 100 && (
            <span className="text-xs text-green-600 font-medium">
              모든 검토가 완료되었습니다
            </span>
          )}
        </div>
      </div>

      {/* 이메일 알림 모달 */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEmailModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 sm:p-6 w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">검토 요청 이메일 발송</h3>
            <p className="text-xs text-gray-500 mb-4">
              검토 담당자에게 &quot;{productName}&quot; 제품의 검토 요청 이메일을 발송합니다.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">받는 사람 (이메일) *</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="input-field"
                  placeholder="reviewer@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">검토 마감일 *</label>
                <input
                  type="date"
                  value={emailDeadline}
                  onChange={(e) => setEmailDeadline(e.target.value)}
                  className="input-field"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">추가 메시지 (선택)</label>
                <textarea
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="input-field"
                  rows={3}
                  placeholder="검토 시 참고할 사항을 입력하세요..."
                />
              </div>

              {/* 미리보기 */}
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">이메일 제목 미리보기:</p>
                <p className="text-sm font-medium text-gray-800">
                  [{productName}] 표기사항 검토 요청
                </p>
                <p className="text-xs text-gray-500 mt-2">주요 내용:</p>
                <p className="text-xs text-gray-600">
                  {emailDeadline ? `${emailDeadline}까지 검토 완료 요청` : '마감일 미지정'}
                  {' | '}
                  진행률 {overallProgress}% ({completedCount}/{totalCount})
                </p>
              </div>
            </div>

            {emailResult && (
              <div className={`mt-3 p-2 rounded text-sm ${emailResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {emailResult.message}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowEmailModal(false)}
                className="btn-secondary flex-1"
              >
                취소
              </button>
              <button
                onClick={handleSendEmail}
                disabled={emailSending || !emailTo.trim() || !emailDeadline.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {emailSending ? '발송 중...' : '발송하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리별 검토 */}
      <div className="space-y-4">
        {reviewCategories.map((category) => {
          const catColor = CATEGORY_COLORS[category.name] || 'border-gray-500 bg-gray-50';
          const catCompleted = category.items.filter((i) => i.isCompleted).length;
          const catTotal = category.items.length;

          return (
            <div
              key={category.id}
              className={`rounded-xl border-l-4 overflow-hidden ${catColor}`}
            >
              {/* 카테고리 헤더 */}
              <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
                <h4 className="font-bold text-gray-800 min-w-0 break-words">{category.name}</h4>
                <span className="text-sm text-gray-600">
                  {catCompleted}/{catTotal}
                </span>
              </div>

              {/* 검토 항목 — 모바일 카드 뷰 (표는 minWidth 700px라 폰에서 가로 스크롤하며 입력해야 함) */}
              <div className="sm:hidden bg-white divide-y divide-gray-100">
                {category.items.map((item) => {
                  const isLoading = loadingItems[item.id];
                  const deptColor = DEPT_COLORS[item.department] || 'bg-gray-100 text-gray-700';
                  const hasNoReviewer = !item.reviewerName;
                  const showWarning = reviewerWarning === item.id;

                  return (
                    <div key={item.id} className={`p-3 ${item.isCompleted ? 'bg-green-50/50' : ''}`}>
                      <div className="flex items-start gap-2.5">
                        <button
                          onClick={() => handleToggleItem(item.id, item.isCompleted, item.reviewerName)}
                          disabled={isLoading}
                          aria-label={item.isCompleted ? '검토 완료 해제' : '검토 완료로 표시'}
                          className={`mt-0.5 shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                            item.isCompleted
                              ? 'bg-green-500 border-green-500 text-white'
                              : hasNoReviewer
                              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                              : 'border-gray-300'
                          } ${isLoading ? 'opacity-50' : ''}`}
                        >
                          {item.isCompleted && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`text-sm break-words ${
                                item.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'
                              }`}
                            >
                              {item.taskName}
                            </span>
                            <span
                              className={`shrink-0 inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${deptColor}`}
                            >
                              {item.department}
                            </span>
                          </div>

                          {showWarning && (
                            <p className="mt-1 text-xs text-red-600">검토자를 먼저 입력해주세요</p>
                          )}

                          {/* 검토자 */}
                          <div className="mt-2">
                            <span className="text-xs text-gray-400">검토자</span>
                            {editingName === item.id ? (
                              <div className="mt-1 space-y-1.5">
                                <input
                                  type="text"
                                  value={nameInputs[item.id] ?? item.reviewerName ?? ''}
                                  onChange={(e) =>
                                    setNameInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName(item.id);
                                    if (e.key === 'Escape') setEditingName(null);
                                  }}
                                  className="input-field text-sm w-full"
                                  placeholder="검토자 이름 입력"
                                  autoFocus
                                />
                                <div className="flex gap-3">
                                  <button
                                    onClick={() => handleSaveName(item.id)}
                                    disabled={isLoading}
                                    className="text-xs text-blue-600 py-1"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingName(null)}
                                    className="text-xs text-gray-400 py-1"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingName(item.id);
                                  setNameInputs((prev) => ({ ...prev, [item.id]: item.reviewerName || '' }));
                                }}
                                className={`mt-1 text-sm rounded px-2 py-2 min-h-[40px] flex items-center break-words ${
                                  item.reviewerName
                                    ? 'text-gray-700 bg-gray-50'
                                    : 'border border-dashed border-gray-300'
                                }`}
                              >
                                {item.reviewerName ? (
                                  <span>{item.reviewerName}</span>
                                ) : (
                                  <span className="text-gray-400 text-xs">검토자 입력 (필수)</span>
                                )}
                              </div>
                            )}
                            {item.completedAt && editingName !== item.id && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {new Date(item.completedAt).toLocaleDateString('ko-KR')}
                              </div>
                            )}
                          </div>

                          {/* 비고 */}
                          <div className="mt-2">
                            <span className="text-xs text-gray-400">비고</span>
                            {editingNote === item.id ? (
                              <div className="mt-1 space-y-1.5">
                                <input
                                  type="text"
                                  value={noteInputs[item.id] ?? item.reviewerNote ?? ''}
                                  onChange={(e) =>
                                    setNoteInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveNote(item.id);
                                    if (e.key === 'Escape') setEditingNote(null);
                                  }}
                                  className="input-field text-sm w-full"
                                  placeholder="비고 입력"
                                  autoFocus
                                />
                                <div className="flex gap-3">
                                  <button
                                    onClick={() => handleSaveNote(item.id)}
                                    disabled={isLoading}
                                    className="text-xs text-blue-600 py-1"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingNote(null)}
                                    className="text-xs text-gray-400 py-1"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingNote(item.id);
                                  setNoteInputs((prev) => ({ ...prev, [item.id]: item.reviewerNote || '' }));
                                }}
                                className="mt-1 text-sm text-gray-600 rounded px-2 py-2 min-h-[40px] flex items-center break-words bg-gray-50"
                              >
                                {item.reviewerNote ? (
                                  <span>{item.reviewerNote}</span>
                                ) : (
                                  <span className="text-gray-400 text-xs">탭하여 입력</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 검토 항목 테이블 (데스크톱) */}
              <div className="bg-white overflow-x-auto hidden sm:block">
                <table className="w-full" style={{ minWidth: '700px' }}>
                  <thead className="bg-gray-50 border-y border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500" style={{ width: '50px' }}>
                        확인
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500" style={{ width: '30%' }}>
                        검토 항목
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500" style={{ width: '90px' }}>
                        담당 부서
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500" style={{ width: '25%', minWidth: '160px' }}>
                        검토자
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500" style={{ minWidth: '160px' }}>
                        비고
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {category.items.map((item) => {
                      const isLoading = loadingItems[item.id];
                      const deptColor = DEPT_COLORS[item.department] || 'bg-gray-100 text-gray-700';
                      const hasNoReviewer = !item.reviewerName;
                      const showWarning = reviewerWarning === item.id;

                      return (
                        <tr
                          key={item.id}
                          className={`${
                            item.isCompleted ? 'bg-green-50/50' : ''
                          } hover:bg-gray-50`}
                        >
                          {/* 체크박스 */}
                          <td className="px-3 py-2 text-center">
                            <div className="relative">
                              <button
                                onClick={() => handleToggleItem(item.id, item.isCompleted, item.reviewerName)}
                                disabled={isLoading}
                                title={hasNoReviewer && !item.isCompleted ? '검토자를 먼저 입력해주세요' : ''}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  item.isCompleted
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : hasNoReviewer
                                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                                    : 'border-gray-300 hover:border-blue-500'
                                } ${isLoading ? 'opacity-50' : ''}`}
                              >
                                {item.isCompleted && (
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                              {showWarning && (
                                <div className="absolute left-6 top-0 whitespace-nowrap bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                                  검토자를 먼저 입력해주세요
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 검토 항목명 */}
                          <td className="px-3 py-2">
                            <span className={`text-sm ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {item.taskName}
                            </span>
                          </td>

                          {/* 담당 부서 */}
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${deptColor}`}>
                              {item.department}
                            </span>
                          </td>

                          {/* 검토자 */}
                          <td className="px-3 py-2">
                            {editingName === item.id ? (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={nameInputs[item.id] ?? item.reviewerName ?? ''}
                                  onChange={(e) =>
                                    setNameInputs((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName(item.id);
                                    if (e.key === 'Escape') setEditingName(null);
                                  }}
                                  className="input-field text-sm py-1.5 w-full"
                                  placeholder="검토자 이름 입력"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveName(item.id)}
                                    disabled={isLoading}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingName(null)}
                                    className="text-xs text-gray-400 hover:underline"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingName(item.id);
                                  setNameInputs((prev) => ({
                                    ...prev,
                                    [item.id]: item.reviewerName || '',
                                  }));
                                }}
                                className={`text-sm cursor-pointer hover:bg-gray-100 rounded px-1.5 py-1 -mx-1.5 min-h-[28px] flex items-center ${
                                  item.reviewerName ? 'text-gray-700' : 'border border-dashed border-gray-300'
                                }`}
                              >
                                {item.reviewerName ? (
                                  <span>{item.reviewerName}</span>
                                ) : (
                                  <span className="text-gray-400 text-xs">검토자 입력 (필수)</span>
                                )}
                              </div>
                            )}
                            {item.completedAt && !editingName && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {new Date(item.completedAt).toLocaleDateString('ko-KR')}
                              </div>
                            )}
                          </td>

                          {/* 비고 */}
                          <td className="px-3 py-2">
                            {editingNote === item.id ? (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={noteInputs[item.id] ?? item.reviewerNote ?? ''}
                                  onChange={(e) =>
                                    setNoteInputs((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveNote(item.id);
                                    if (e.key === 'Escape') setEditingNote(null);
                                  }}
                                  className="input-field text-sm py-1.5 w-full"
                                  placeholder="비고 입력"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveNote(item.id)}
                                    disabled={isLoading}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingNote(null)}
                                    className="text-xs text-gray-400 hover:underline"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingNote(item.id);
                                  setNoteInputs((prev) => ({
                                    ...prev,
                                    [item.id]: item.reviewerNote || '',
                                  }));
                                }}
                                className="text-sm text-gray-600 cursor-pointer hover:bg-gray-100 rounded px-1.5 py-1 -mx-1.5 min-h-[28px] flex items-center"
                              >
                                {item.reviewerNote ? (
                                  <span>{item.reviewerNote}</span>
                                ) : (
                                  <span className="text-gray-300 text-xs">클릭하여 입력</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* 검수 항목 수정 이력 — 누가 언제 무엇을 체크·수정했는지 */}
      <ChangeLogSection entityType="labelReview" entityId={labelId} title="검수 수정 이력" />
    </div>
  );
}
