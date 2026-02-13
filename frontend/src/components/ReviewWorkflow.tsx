'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

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

export default function ReviewWorkflow({ labelId, reviewCategories, onUpdate }: Props) {
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [editingName, setEditingName] = useState<string | null>(null);

  const handleToggleItem = async (itemId: string, isCompleted: boolean) => {
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

  // 전체 진행률 계산
  const allItems = reviewCategories.flatMap((c) => c.items);
  const completedCount = allItems.filter((i) => i.isCompleted).length;
  const totalCount = allItems.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div>
      {/* 전체 진행률 */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">검토 진행 현황</h3>
          <span className="text-sm text-gray-500">
            {completedCount} / {totalCount} 완료
          </span>
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
              <div className="px-5 py-3 flex items-center justify-between">
                <h4 className="font-bold text-gray-800">{category.name}</h4>
                <span className="text-sm text-gray-600">
                  {catCompleted}/{catTotal}
                </span>
              </div>

              {/* 검토 항목 테이블 */}
              <div className="bg-white">
                <table className="w-full">
                  <thead className="bg-gray-50 border-y border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-10">
                        확인
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                        검토 항목
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-24">
                        담당 부서
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-28">
                        검토자
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                        비고
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {category.items.map((item) => {
                      const isLoading = loadingItems[item.id];
                      const deptColor = DEPT_COLORS[item.department] || 'bg-gray-100 text-gray-700';

                      return (
                        <tr
                          key={item.id}
                          className={`${
                            item.isCompleted ? 'bg-green-50/50' : ''
                          } hover:bg-gray-50`}
                        >
                          {/* 체크박스 */}
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => handleToggleItem(item.id, item.isCompleted)}
                              disabled={isLoading}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                item.isCompleted
                                  ? 'bg-green-500 border-green-500 text-white'
                                  : 'border-gray-300 hover:border-blue-500'
                              } ${isLoading ? 'opacity-50' : ''}`}
                            >
                              {item.isCompleted && (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          </td>

                          {/* 검토 항목명 */}
                          <td className="px-4 py-2">
                            <span className={`text-sm ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {item.taskName}
                            </span>
                          </td>

                          {/* 담당 부서 */}
                          <td className="px-4 py-2">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${deptColor}`}>
                              {item.department}
                            </span>
                          </td>

                          {/* 검토자 */}
                          <td className="px-4 py-2">
                            {editingName === item.id ? (
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={nameInputs[item.id] ?? item.reviewerName ?? ''}
                                  onChange={(e) =>
                                    setNameInputs((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  className="input-field text-xs py-1"
                                  placeholder="검토자 이름"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveName(item.id)}
                                  disabled={isLoading}
                                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingName(null)}
                                  className="text-xs text-gray-400 hover:underline whitespace-nowrap"
                                >
                                  취소
                                </button>
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
                                className="text-xs text-gray-600 cursor-pointer hover:text-gray-800 min-h-[20px]"
                              >
                                {item.reviewerName || (
                                  <span className="text-gray-300">클릭하여 입력</span>
                                )}
                                {item.completedAt && (
                                  <div className="text-xs text-gray-400">
                                    {new Date(item.completedAt).toLocaleDateString('ko-KR')}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 비고 */}
                          <td className="px-4 py-2">
                            {editingNote === item.id ? (
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={noteInputs[item.id] ?? item.reviewerNote ?? ''}
                                  onChange={(e) =>
                                    setNoteInputs((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  className="input-field text-xs py-1"
                                  placeholder="비고 입력"
                                />
                                <button
                                  onClick={() => handleSaveNote(item.id)}
                                  disabled={isLoading}
                                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingNote(null)}
                                  className="text-xs text-gray-400 hover:underline whitespace-nowrap"
                                >
                                  취소
                                </button>
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
                                className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 min-h-[20px]"
                              >
                                {item.reviewerNote || (
                                  <span className="text-gray-300">클릭하여 입력</span>
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
    </div>
  );
}
