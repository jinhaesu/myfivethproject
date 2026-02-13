'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import NutritionLabel from '@/components/NutritionLabel';
import ReviewWorkflow from '@/components/ReviewWorkflow';
import { api } from '@/lib/api';

interface Label {
  id: string;
  productName: string;
  salesChannel: string | null;
  status: string;
  servingSize: number | null;
  servingUnit: string | null;
  totalContent: number | null;
  totalUnit: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    department: string | null;
  };
  nutritionInfo: any;
  ingredients: Array<{
    id: string;
    name: string;
    ratio: number;
    origin: string | null;
    allergen: boolean;
    allergenInfo: string | null;
  }>;
  reviewCategories: any[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '초안', color: 'bg-gray-100 text-gray-700' },
  in_review: { label: '검토 중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인 완료', color: 'bg-green-100 text-green-700' },
};

export default function LabelDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [label, setLabel] = useState<Label | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'result' | 'review'>('result');
  const [deleting, setDeleting] = useState(false);

  const fetchLabel = async () => {
    try {
      const data = await api.labels.get(id);
      setLabel(data.label);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabel();
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('이 표기사항을 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      await api.labels.delete(id);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-gray-500">로딩 중...</div>
      </AppLayout>
    );
  }

  if (error || !label) {
    return (
      <AppLayout>
        <div className="card text-center py-12">
          <p className="text-red-600 mb-4">{error || '라벨을 찾을 수 없습니다.'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary">
            대시보드로 돌아가기
          </button>
        </div>
      </AppLayout>
    );
  }

  const statusInfo = STATUS_MAP[label.status] || STATUS_MAP.draft;

  return (
    <AppLayout>
      {/* 헤더 */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{label.productName}</h1>
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            {label.salesChannel && <span>채널: {label.salesChannel}</span>}
            <span>작성: {label.createdBy.name || label.createdBy.email}</span>
            <span>{new Date(label.createdAt).toLocaleDateString('ko-KR')}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-danger text-sm"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('result')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'result'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            표기사항 결과
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'review'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            부서별 검토
          </button>
        </div>
      </div>

      {/* 컨텐츠 */}
      {activeTab === 'result' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 영양성분표 */}
          <div className="card flex flex-col items-center">
            <h3 className="text-lg font-bold mb-4 self-start">영양성분표</h3>
            <NutritionLabel
              productName={label.productName}
              servingSize={label.servingSize}
              servingUnit={label.servingUnit}
              totalContent={label.totalContent}
              totalUnit={label.totalUnit}
              nutritionInfo={label.nutritionInfo}
            />
          </div>

          {/* 원재료 정보 */}
          <div className="card">
            <h3 className="text-lg font-bold mb-4">원재료명 및 함량</h3>
            {label.ingredients.length > 0 ? (
              <>
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">원재료 표기문</h4>
                  <div className="p-3 bg-gray-50 rounded-lg text-sm leading-relaxed">
                    {label.ingredients
                      .sort((a, b) => b.ratio - a.ratio)
                      .map((ing) => {
                        let text = ing.name;
                        if (ing.origin) text += `(${ing.origin})`;
                        text += ` ${ing.ratio}%`;
                        return text;
                      })
                      .join(', ')}
                  </div>
                </div>

                {label.ingredients.some((ing) => ing.allergen) && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h4 className="text-sm font-bold text-yellow-800 mb-1">
                      알레르기 유발물질
                    </h4>
                    <p className="text-sm text-yellow-700">
                      {label.ingredients
                        .filter((ing) => ing.allergen && ing.allergenInfo)
                        .map((ing) => ing.allergenInfo)
                        .join(', ')}
                    </p>
                  </div>
                )}

                <h4 className="text-sm font-medium text-gray-600 mb-2">배합비 상세</h4>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left text-xs text-gray-500">원재료</th>
                      <th className="px-2 py-1 text-left text-xs text-gray-500">배합비</th>
                      <th className="px-2 py-1 text-left text-xs text-gray-500">원산지</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {label.ingredients
                      .sort((a, b) => b.ratio - a.ratio)
                      .map((ing) => (
                        <tr key={ing.id}>
                          <td className="px-2 py-1.5">
                            {ing.name}
                            {ing.allergen && (
                              <span className="ml-1 text-xs text-yellow-600">(알레르기)</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">{ing.ratio}%</td>
                          <td className="px-2 py-1.5 text-gray-500">{ing.origin || '-'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-gray-500 text-sm">등록된 원재료가 없습니다.</p>
            )}
          </div>

          {/* 제품 요약 정보 */}
          <div className="card">
            <h3 className="text-lg font-bold mb-4">제품 정보 요약</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500">제품명</dt>
                <dd className="text-sm font-medium">{label.productName}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">판매채널</dt>
                <dd className="text-sm font-medium">{label.salesChannel || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">총 내용량</dt>
                <dd className="text-sm font-medium">
                  {label.totalContent && label.totalUnit
                    ? `${label.totalContent}${label.totalUnit}`
                    : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">1회 제공량</dt>
                <dd className="text-sm font-medium">
                  {label.servingSize && label.servingUnit
                    ? `${label.servingSize}${label.servingUnit}`
                    : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">상태</dt>
                <dd>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">작성자</dt>
                <dd className="text-sm font-medium">
                  {label.createdBy.name || label.createdBy.email}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">작성일</dt>
                <dd className="text-sm font-medium">
                  {new Date(label.createdAt).toLocaleString('ko-KR')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">수정일</dt>
                <dd className="text-sm font-medium">
                  {new Date(label.updatedAt).toLocaleString('ko-KR')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : (
        <ReviewWorkflow
          labelId={label.id}
          reviewCategories={label.reviewCategories}
          onUpdate={fetchLabel}
        />
      )}
    </AppLayout>
  );
}
