'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { HealthClaim, getClaimBadgeColor } from '@/lib/healthClaims';

interface Label {
  id: string;
  productName: string;
  productType: string | null;
  salesChannel: string | null;
  status: string;
  healthClaims: HealthClaim[] | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    department: string | null;
  };
  reviewCategories: Array<{
    items: Array<{ isCompleted: boolean }>;
  }>;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '초안', color: 'bg-gray-100 text-gray-700' },
  in_review: { label: '검토 중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인 완료', color: 'bg-green-100 text-green-700' },
};

export default function DashboardPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  const fetchLabels = async (page = 1) => {
    try {
      setLoading(true);
      const data = await api.labels.list({
        page,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setLabels(data.labels);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch labels:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabels();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLabels(1);
  };

  const getReviewProgress = (label: Label) => {
    const allItems = label.reviewCategories.flatMap((c) => c.items);
    if (allItems.length === 0) return 0;
    return Math.round((allItems.filter((i) => i.isCompleted).length / allItems.length) * 100);
  };

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">표기사항 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            영양성분 표기사항 이력을 확인하고 관리합니다.
          </p>
        </div>
        <Link href="/labels/new" className="btn-primary">
          + 새 라벨 작성
        </Link>
      </div>

      {/* 검색 및 필터 */}
      <div className="card mb-6">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제품명으로 검색..."
            className="input-field flex-1"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field sm:w-40"
          >
            <option value="">전체 상태</option>
            <option value="draft">초안</option>
            <option value="in_review">검토 중</option>
            <option value="approved">승인 완료</option>
          </select>
          <button type="submit" className="btn-primary">
            검색
          </button>
        </form>
      </div>

      {/* 라벨 목록 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">로딩 중...</div>
      ) : labels.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">등록된 표기사항이 없습니다.</p>
          <Link href="/labels/new" className="btn-primary">
            첫 라벨 작성하기
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    제품명
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                    강조 표기
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    상태
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                    검토 진행률
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                    작성자
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    작성일
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {labels.map((label) => {
                  const progress = getReviewProgress(label);
                  const statusInfo = STATUS_MAP[label.status] || STATUS_MAP.draft;
                  const claims = (label.healthClaims as HealthClaim[]) || [];
                  const eligibleClaims = claims.filter(c => c.eligible);

                  return (
                    <tr key={label.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/labels/${label.id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {label.productName}
                        </Link>
                        {label.productType && (
                          <p className="text-xs text-gray-400 mt-0.5">{label.productType}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {eligibleClaims.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {eligibleClaims.slice(0, 3).map(c => (
                              <span key={c.id} className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                                {c.name}
                              </span>
                            ))}
                            {eligibleClaims.length > 3 && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                                +{eligibleClaims.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                        {label.createdBy.name || label.createdBy.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(label.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center mt-6 gap-2">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => fetchLabels(page)}
                  className={`px-3 py-1 rounded text-sm ${
                    page === pagination.page
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
