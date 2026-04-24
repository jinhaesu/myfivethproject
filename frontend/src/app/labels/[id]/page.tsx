'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import NutritionLabel from '@/components/NutritionLabel';
import PrintableLabel from '@/components/PrintableLabel';
import ReviewWorkflow from '@/components/ReviewWorkflow';
import { api, getFileUrl } from '@/lib/api';
import { HealthClaim, getClaimBadgeColor } from '@/lib/healthClaims';
import { analyzeOriginRequirements, OriginRequirement } from '@/lib/originRules';

interface AiDesignReviewItem {
  field: string;
  reportValue: string | null;
  designValue: string | null;
  status: 'match' | 'minor' | 'mismatch' | 'needs_review' | 'not_found_in_design' | 'not_found_in_report';
  comment: string;
}

interface DetectedCompany {
  name: string;
  role?: string;
}

interface AiDesignReview {
  summary: string;
  overallStatus: 'ok' | 'needs_review' | 'critical';
  detectedCompanies?: Array<DetectedCompany | string>;
  reporterInfoExcluded?: string;
  items: AiDesignReviewItem[];
  criticalIssues: string[];
  recommendations: string[];
}

interface Label {
  id: string;
  productName: string;
  productType: string | null;
  salesChannel: string | null;
  status: string;
  servingSize: number | null;
  servingUnit: string | null;
  totalContent: number | null;
  totalUnit: string | null;
  shelfLife: string | null;
  storageMethod: string | null;
  crossContaminationAllergens: string | null;
  healthClaims: HealthClaim[] | null;
  aiNotes: any | null;
  labelSnapshot: any | null;
  designFileUrl: string | null;
  designFileName: string | null;
  designUploadedAt: string | null;
  manufacturingReportUrl: string | null;
  manufacturingReportMaskedUrl: string | null;
  manufacturingReportName: string | null;
  manufacturingReportUploadedAt: string | null;
  aiReportExtraction: any | null;
  aiDesignExtraction: any | null;
  aiDesignReview: AiDesignReview | null;
  aiDesignReviewedAt: string | null;
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
  const [activeTab, setActiveTab] = useState<'result' | 'label' | 'design' | 'claims' | 'ainotes' | 'review'>('result');
  const [deleting, setDeleting] = useState(false);
  const [labelFormat, setLabelFormat] = useState<'korea' | 'us' | 'japan'>('korea');

  // 디자인 파일 업로드 관련
  const [uploading, setUploading] = useState(false);
  const [designCompareMode, setDesignCompareMode] = useState(false);
  const [designFileStatus, setDesignFileStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');

  // 품목제조보고서 업로드 관련
  const [reportUploading, setReportUploading] = useState(false);
  const [aiReviewing, setAiReviewing] = useState(false);
  const [aiReviewError, setAiReviewError] = useState('');

  // 수정 모드
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editChannel, setEditChannel] = useState('');
  const [editServingSize, setEditServingSize] = useState('');
  const [editServingUnit, setEditServingUnit] = useState('g');
  const [editTotalContent, setEditTotalContent] = useState('');
  const [editTotalUnit, setEditTotalUnit] = useState('g');
  const [editNutrition, setEditNutrition] = useState<Record<string, string>>({});

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

  useEffect(() => {
    if (label?.designFileUrl) {
      setDesignFileStatus('checking');
      fetch(getFileUrl(label.designFileUrl), { method: 'HEAD' })
        .then(res => setDesignFileStatus(res.ok ? 'available' : 'unavailable'))
        .catch(() => setDesignFileStatus('unavailable'));
    }
  }, [label?.designFileUrl]);

  const startEdit = () => {
    if (!label) return;
    setEditName(label.productName);
    setEditType(label.productType || '');
    setEditChannel(label.salesChannel || '');
    setEditServingSize(label.servingSize != null ? String(label.servingSize) : '');
    setEditServingUnit(label.servingUnit || 'g');
    setEditTotalContent(label.totalContent != null ? String(label.totalContent) : '');
    setEditTotalUnit(label.totalUnit || 'g');
    const ni = label.nutritionInfo || {};
    setEditNutrition({
      calories: ni.calories != null ? String(ni.calories) : '',
      carbohydrates: ni.carbohydrates != null ? String(ni.carbohydrates) : '',
      sugars: ni.sugars != null ? String(ni.sugars) : '',
      dietaryFiber: ni.dietaryFiber != null ? String(ni.dietaryFiber) : '',
      protein: ni.protein != null ? String(ni.protein) : '',
      totalFat: ni.totalFat != null ? String(ni.totalFat) : '',
      saturatedFat: ni.saturatedFat != null ? String(ni.saturatedFat) : '',
      transFat: ni.transFat != null ? String(ni.transFat) : '',
      cholesterol: ni.cholesterol != null ? String(ni.cholesterol) : '',
      sodium: ni.sodium != null ? String(ni.sodium) : '',
      vitaminA: ni.vitaminA != null ? String(ni.vitaminA) : '',
      vitaminC: ni.vitaminC != null ? String(ni.vitaminC) : '',
      calcium: ni.calcium != null ? String(ni.calcium) : '',
      iron: ni.iron != null ? String(ni.iron) : '',
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!label) return;
    setSaving(true);
    setError('');
    try {
      await api.labels.update(id, {
        productName: editName,
        productType: editType || null,
        salesChannel: editChannel || null,
        servingSize: editServingSize || null,
        servingUnit: editServingUnit,
        totalContent: editTotalContent || null,
        totalUnit: editTotalUnit,
        nutritionInfo: editNutrition,
      });
      setEditMode(false);
      setLoading(true);
      await fetchLabel();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDesignUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await api.uploads.uploadDesign(id, file);
      await fetchLabel();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDesignDelete = async () => {
    if (!confirm('디자인 파일을 삭제하시겠습니까?')) return;
    try {
      await api.uploads.deleteDesign(id);
      await fetchLabel();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReportUploading(true);
    setError('');
    try {
      await api.uploads.uploadManufacturingReport(id, file);
      await fetchLabel();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReportUploading(false);
      e.target.value = '';
    }
  };

  const handleReportDelete = async () => {
    if (!confirm('품목제조보고서를 삭제하시겠습니까?')) return;
    try {
      await api.uploads.deleteManufacturingReport(id);
      await fetchLabel();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAiReview = async () => {
    setAiReviewing(true);
    setAiReviewError('');
    try {
      await api.ai.reviewDesignVsReport(id);
      await fetchLabel();
    } catch (err: any) {
      setAiReviewError(err.message);
    } finally {
      setAiReviewing(false);
    }
  };

  // 디자인+품목제조보고서 모두 첨부되면 AI 검토 자동 트리거 (아직 검토 결과 없을 때만)
  useEffect(() => {
    if (
      label?.designFileUrl &&
      label?.manufacturingReportUrl &&
      !label?.aiDesignReview &&
      !aiReviewing &&
      designFileStatus === 'available'
    ) {
      handleAiReview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label?.designFileUrl, label?.manufacturingReportUrl, designFileStatus]);

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

  if (error && !label) {
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

  if (!label) return null;

  const statusInfo = STATUS_MAP[label.status] || STATUS_MAP.draft;
  const healthClaims: HealthClaim[] = (label.healthClaims as HealthClaim[]) || [];
  const eligibleClaims = healthClaims.filter(c => c.eligible);
  const aiNotes = label.aiNotes as any;
  const snapshot = label.labelSnapshot as any;

  // 라벨 프리뷰용 데이터 변환
  const nutritionForPreview = label.nutritionInfo || {};
  const ingredientsForPreview = label.ingredients.map(i => ({
    name: i.name,
    ratio: String(i.ratio),
    origin: i.origin || '',
    allergen: i.allergen,
    allergenInfo: i.allergenInfo || '',
  }));

  const TABS = [
    { id: 'result' as const, name: '표기사항 결과' },
    { id: 'label' as const, name: '라벨 디자인' },
    { id: 'design' as const, name: `디자인 검수${label.designFileUrl ? ' ✓' : ''}` },
    { id: 'claims' as const, name: '강조 표기사항' },
    { id: 'ainotes' as const, name: 'AI 검수 노트' },
    { id: 'review' as const, name: '부서별 검토' },
  ];

  return (
    <AppLayout>
      {/* 헤더 */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{label.productName}</h1>
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {eligibleClaims.length > 0 && (
              <div className="flex gap-1">
                {eligibleClaims.slice(0, 4).map(c => (
                  <span key={c.id} className={`px-2 py-0.5 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                    {c.name}
                  </span>
                ))}
                {eligibleClaims.length > 4 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                    +{eligibleClaims.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            {label.productType && <span>{label.productType}</span>}
            {label.salesChannel && <span>채널: {label.salesChannel}</span>}
            <span>작성: {label.createdBy.name || label.createdBy.email}</span>
            <span>{new Date(label.createdAt).toLocaleDateString('ko-KR')}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {!editMode && (
            <button onClick={startEdit} className="btn-secondary text-sm">
              수정
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-danger text-sm"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 탭 */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* 수정 모드 */}
      {editMode && (
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">제품 정보 수정</h2>
            <div className="flex gap-2">
              <button onClick={() => setEditMode(false)} className="btn-secondary text-sm">취소</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">제품명</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">식품유형</label>
              <input type="text" value={editType} onChange={e => setEditType(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">판매채널</label>
              <input type="text" value={editChannel} onChange={e => setEditChannel(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">1회 제공량</label>
              <div className="flex gap-1">
                <input type="number" value={editServingSize} onChange={e => setEditServingSize(e.target.value)}
                  className="input-field text-sm flex-1" step="any" />
                <select value={editServingUnit} onChange={e => setEditServingUnit(e.target.value)} className="input-field text-sm w-16">
                  <option value="g">g</option><option value="ml">ml</option>
                  <option value="개">개</option><option value="포">포</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">총 내용량</label>
              <div className="flex gap-1">
                <input type="number" value={editTotalContent} onChange={e => setEditTotalContent(e.target.value)}
                  className="input-field text-sm flex-1" step="any" />
                <select value={editTotalUnit} onChange={e => setEditTotalUnit(e.target.value)} className="input-field text-sm w-16">
                  <option value="g">g</option><option value="ml">ml</option>
                  <option value="kg">kg</option><option value="L">L</option>
                </select>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold mb-3">영양성분</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { key: 'calories', label: '열량(kcal)' },
              { key: 'carbohydrates', label: '탄수화물(g)' },
              { key: 'sugars', label: '당류(g)' },
              { key: 'dietaryFiber', label: '식이섬유(g)' },
              { key: 'protein', label: '단백질(g)' },
              { key: 'totalFat', label: '지방(g)' },
              { key: 'saturatedFat', label: '포화지방(g)' },
              { key: 'transFat', label: '트랜스지방(g)' },
              { key: 'cholesterol', label: '콜레스테롤(mg)' },
              { key: 'sodium', label: '나트륨(mg)' },
              { key: 'vitaminA', label: '비타민A' },
              { key: 'vitaminC', label: '비타민C' },
              { key: 'calcium', label: '칼슘' },
              { key: 'iron', label: '철' },
            ].map(({ key, label: lbl }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-0.5">{lbl}</label>
                <input type="number" value={editNutrition[key] || ''}
                  onChange={e => setEditNutrition(prev => ({ ...prev, [key]: e.target.value }))}
                  className="input-field text-sm" step="any" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 표기사항 결과 */}
      {activeTab === 'result' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          <div className="card">
            <h3 className="text-lg font-bold mb-4">원재료명 및 함량</h3>
            {label.ingredients.length > 0 ? (
              <>
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">원재료 표기문 (실제 라벨 표기)</h4>
                  <div className="p-3 bg-gray-50 rounded-lg text-sm leading-relaxed">
                    {(() => {
                      const sorted = [...label.ingredients].sort((a, b) => b.ratio - a.ratio);
                      const originAnalysis = analyzeOriginRequirements(
                        sorted.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin || '' })),
                        label.productType || '',
                        label.productName,
                      );
                      return sorted.map(ing => {
                        let text = ing.name;
                        const req = originAnalysis.find(r => r.ingredientName === ing.name.trim());
                        if (req?.required && ing.origin) text += `(${ing.origin})`;
                        return text;
                      }).join(', ');
                    })()}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">※ 배합비(%)는 내부 관리용이며 실제 표기사항에는 기재하지 않습니다.</p>
                  <p className="text-xs text-gray-400">※ 원산지는 법적 의무 대상 원재료만 표기합니다.</p>
                </div>

                {label.ingredients.some(ing => ing.allergen) && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h4 className="text-sm font-bold text-yellow-800 mb-1">알레르기 유발물질</h4>
                    <p className="text-sm text-yellow-700">
                      {label.ingredients
                        .filter(ing => ing.allergen && ing.allergenInfo)
                        .map(ing => ing.allergenInfo)
                        .join(', ')}
                    </p>
                  </div>
                )}

                <h4 className="text-sm font-medium text-gray-600 mb-2">배합비 상세</h4>
                {(() => {
                  const sorted = [...label.ingredients].sort((a, b) => b.ratio - a.ratio);
                  const originAnalysis = analyzeOriginRequirements(
                    sorted.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin || '' })),
                    label.productType || '',
                    label.productName,
                  );
                  return (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left text-xs text-gray-500">원재료</th>
                          <th className="px-2 py-1 text-left text-xs text-gray-500">배합비</th>
                          <th className="px-2 py-1 text-left text-xs text-gray-500">원산지</th>
                          <th className="px-2 py-1 text-left text-xs text-gray-500">표기 의무</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sorted.map(ing => {
                          const req = originAnalysis.find(r => r.ingredientName === ing.name.trim());
                          return (
                            <tr key={ing.id}>
                              <td className="px-2 py-1.5">
                                {ing.name}
                                {ing.allergen && <span className="ml-1 text-xs text-yellow-600">(알레르기)</span>}
                              </td>
                              <td className="px-2 py-1.5">{ing.ratio}%</td>
                              <td className="px-2 py-1.5 text-gray-500">{ing.origin || '-'}</td>
                              <td className="px-2 py-1.5">
                                {req?.required ? (
                                  <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">필수</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">해당없음</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </>
            ) : (
              <p className="text-gray-500 text-sm">등록된 원재료가 없습니다.</p>
            )}
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-4">제품 정보 요약</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500">제품명</dt>
                <dd className="text-sm font-medium">{label.productName}</dd>
              </div>
              {label.productType && (
                <div>
                  <dt className="text-xs text-gray-500">식품유형</dt>
                  <dd className="text-sm font-medium">{label.productType}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-500">판매채널</dt>
                <dd className="text-sm font-medium">{label.salesChannel || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">총 내용량</dt>
                <dd className="text-sm font-medium">
                  {label.totalContent && label.totalUnit ? `${label.totalContent}${label.totalUnit}` : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">1회 제공량</dt>
                <dd className="text-sm font-medium">
                  {label.servingSize && label.servingUnit ? `${label.servingSize}${label.servingUnit}` : '-'}
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
                <dt className="text-xs text-gray-500">작성일</dt>
                <dd className="text-sm font-medium">{new Date(label.createdAt).toLocaleString('ko-KR')}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">수정일</dt>
                <dd className="text-sm font-medium">{new Date(label.updatedAt).toLocaleString('ko-KR')}</dd>
              </div>
              {label.shelfLife && (
                <div>
                  <dt className="text-xs text-gray-500">소비기한</dt>
                  <dd className="text-sm font-medium">{label.shelfLife}</dd>
                </div>
              )}
              {label.storageMethod && (
                <div>
                  <dt className="text-xs text-gray-500">보관방법</dt>
                  <dd className="text-sm font-medium">{label.storageMethod}</dd>
                </div>
              )}
              {label.crossContaminationAllergens && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-gray-500">혼입 가능 알레르기 유발물질</dt>
                  <dd className="text-sm font-medium text-orange-700">{label.crossContaminationAllergens}</dd>
                  <dd className="text-xs text-orange-600 mt-0.5">
                    이 제품은 {label.crossContaminationAllergens}을(를) 사용한 제품과 같은 제조시설에서 제조하고 있습니다.
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {/* 라벨 디자인 */}
      {activeTab === 'label' && (
        <div className="space-y-6">
          <div className="flex gap-3">
            {[
              { id: 'korea' as const, flag: '🇰🇷', name: '한국 표기' },
              { id: 'us' as const, flag: '🇺🇸', name: 'US Label' },
              { id: 'japan' as const, flag: '🇯🇵', name: '日本表示' },
            ].map(f => (
              <button key={f.id} onClick={() => setLabelFormat(f.id)}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  labelFormat === f.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
                }`}>
                {f.flag} {f.name}
              </button>
            ))}
            <button onClick={() => window.print()} className="btn-secondary text-sm ml-auto">
              🖨️ 인쇄
            </button>
          </div>

          <div className="flex justify-center">
            <PrintableLabel
              format={labelFormat}
              productName={label.productName}
              productType={label.productType || ''}
              servingSize={label.servingSize}
              servingUnit={label.servingUnit || 'g'}
              totalContent={label.totalContent}
              totalUnit={label.totalUnit || 'g'}
              nutritionInfo={nutritionForPreview}
              ingredients={ingredientsForPreview}
              aiResult={snapshot}
            />
          </div>
        </div>
      )}

      {/* 디자인 검수 */}
      {activeTab === 'design' && (
        <div className="space-y-6">
          {/* 품목제조보고서 업로드 영역 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">품목제조보고서 (PDF)</h3>
                <p className="text-xs text-gray-500 mt-1">
                  식약처/지자체 제출 공식 품목제조보고서를 첨부하면, 디자인 첨부 시 AI가 자동으로 두 문서를 비교 검토합니다.
                </p>
              </div>
              <div className="flex gap-2 items-center">
                {label.manufacturingReportUrl && (
                  <button onClick={handleReportDelete} className="btn-danger text-xs">삭제</button>
                )}
                <label className="btn-primary text-sm cursor-pointer">
                  {reportUploading ? '업로드 중...' : label.manufacturingReportUrl ? '파일 교체' : 'PDF 업로드'}
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleReportUpload}
                    disabled={reportUploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {label.manufacturingReportUrl && (
              <>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                  <span className="text-2xl">{'\u{1F4C4}'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{label.manufacturingReportName}</p>
                    <p className="text-xs text-gray-500">
                      업로드: {label.manufacturingReportUploadedAt ? new Date(label.manufacturingReportUploadedAt).toLocaleString('ko-KR') : '-'}
                    </p>
                  </div>
                  {label.manufacturingReportMaskedUrl ? (
                    <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium" title="서버에서 배합비율 컬럼이 마스킹된 PDF가 표시됩니다">
                      {'\u{2705}'} 배합비율 마스킹 PDF
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs font-medium" title="텍스트 추출 실패 (스캔 PDF). 마스킹 불가능">
                      {'\u{26A0}️'} 마스킹 미적용 (스캔 PDF)
                    </span>
                  )}
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <iframe
                    src={getFileUrl(label.manufacturingReportMaskedUrl || label.manufacturingReportUrl)}
                    className="w-full"
                    style={{ height: '75vh', minHeight: '600px' }}
                    title="품목제조보고서 PDF"
                  />
                </div>
              </>
            )}
          </div>

          {/* 파일 업로드 영역 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">디자인 파일</h3>
                <p className="text-xs text-gray-500 mt-1">디자이너가 제작한 라벨 시안 PDF/이미지를 업로드하여 비교 검수합니다.</p>
              </div>
              <div className="flex gap-2 items-center">
                {label.designFileUrl && (
                  <>
                    <button
                      onClick={() => setDesignCompareMode(!designCompareMode)}
                      className={`text-sm px-3 py-1.5 rounded-lg border-2 font-medium transition-colors ${
                        designCompareMode
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      비교 모드
                    </button>
                    <button onClick={handleDesignDelete} className="btn-danger text-xs">
                      삭제
                    </button>
                  </>
                )}
                <label className="btn-primary text-sm cursor-pointer">
                  {uploading ? '업로드 중...' : label.designFileUrl ? '파일 교체' : '파일 업로드'}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={handleDesignUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {label.designFileUrl && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-2xl">
                  {label.designFileName?.endsWith('.pdf') ? '\u{1F4C4}' : '\u{1F5BC}'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{label.designFileName}</p>
                  <p className="text-xs text-gray-500">
                    업로드: {label.designUploadedAt ? new Date(label.designUploadedAt).toLocaleString('ko-KR') : '-'}
                  </p>
                </div>
                <a
                  href={getFileUrl(label.designFileUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs"
                >
                  새 탭에서 보기
                </a>
              </div>
            )}
          </div>

          {/* 파일을 불러올 수 없을 때 */}
          {label.designFileUrl && designFileStatus === 'checking' && (
            <div className="card text-center py-8">
              <p className="text-gray-500">디자인 파일 확인 중...</p>
            </div>
          )}
          {label.designFileUrl && designFileStatus === 'unavailable' && (
            <div className="card text-center py-12">
              <div className="text-5xl mb-4">{'\u26A0\uFE0F'}</div>
              <p className="text-red-600 font-medium mb-2">디자인 파일을 불러올 수 없습니다</p>
              <p className="text-sm text-gray-500 mb-4">
                파일이 서버에서 삭제되었거나 접근할 수 없습니다.<br/>
                디자인 파일을 다시 업로드해주세요.
              </p>
              <label className="btn-primary cursor-pointer inline-block">
                파일 다시 업로드
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleDesignUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* 비교 모드 OFF: 디자인 파일만 표시 */}
          {!designCompareMode && label.designFileUrl && designFileStatus === 'available' && (
            <div className="card">
              <h3 className="text-sm font-bold mb-3">디자인 시안</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {label.designFileName?.endsWith('.pdf') ? (
                  <iframe
                    src={getFileUrl(label.designFileUrl)}
                    className="w-full"
                    style={{ height: '80vh', minHeight: '600px' }}
                    title="디자인 PDF"
                  />
                ) : (
                  <img
                    src={getFileUrl(label.designFileUrl)}
                    alt="디자인 시안"
                    className="w-full h-auto max-h-[80vh] object-contain"
                  />
                )}
              </div>
            </div>
          )}

          {/* 비교 모드 ON: 좌우 나란히 */}
          {designCompareMode && label.designFileUrl && designFileStatus === 'available' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 왼쪽: 디자인 시안 */}
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-bold">디자인 시안</span>
                  <span className="text-xs text-gray-500">{label.designFileName}</span>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                  {label.designFileName?.endsWith('.pdf') ? (
                    <iframe
                      src={getFileUrl(label.designFileUrl)}
                      className="w-full"
                      style={{ height: '70vh', minHeight: '500px' }}
                      title="디자인 PDF"
                    />
                  ) : (
                    <img
                      src={getFileUrl(label.designFileUrl)}
                      alt="디자인 시안"
                      className="w-full h-auto max-h-[70vh] object-contain"
                    />
                  )}
                </div>
              </div>

              {/* 오른쪽: AI 생성 라벨 */}
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-bold">AI 생성 라벨</span>
                  <div className="flex gap-1 ml-auto">
                    {[
                      { id: 'korea' as const, name: 'KR' },
                      { id: 'us' as const, name: 'US' },
                      { id: 'japan' as const, name: 'JP' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setLabelFormat(f.id)}
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          labelFormat === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-auto bg-white p-4" style={{ maxHeight: '70vh' }}>
                  <PrintableLabel
                    format={labelFormat}
                    productName={label.productName}
                    productType={label.productType || ''}
                    servingSize={label.servingSize}
                    servingUnit={label.servingUnit || 'g'}
                    totalContent={label.totalContent}
                    totalUnit={label.totalUnit || 'g'}
                    nutritionInfo={nutritionForPreview}
                    ingredients={ingredientsForPreview}
                    aiResult={snapshot}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 검수 체크리스트 */}
          {label.designFileUrl && designFileStatus === 'available' && (
            <div className="card">
              <h3 className="text-sm font-bold mb-3">디자인 검수 체크포인트</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { title: '제품명 일치', desc: '디자인에 표기된 제품명이 등록 정보와 동일한지 확인' },
                  { title: '영양성분표 수치', desc: '영양정보 수치, 단위, %기준치가 정확한지 확인' },
                  { title: '원재료명 순서', desc: '배합비 높은 순서대로 정확히 기재되었는지 확인' },
                  { title: '원산지 표기', desc: '법적 의무 대상 원재료의 원산지가 정확하게 기재되었는지 확인' },
                  { title: '알레르기 표시', desc: '알레르기 유발물질 경고문이 누락 없이 표시되었는지 확인' },
                  { title: '글자 크기/가독성', desc: '법적 최소 글자 크기 기준 충족 여부 확인' },
                  { title: '바코드/QR', desc: '바코드 규격 및 인쇄 적합성 확인' },
                  { title: '색상/레이아웃', desc: '브랜드 가이드라인 및 인쇄 색상 적합성 확인' },
                ].map((item, i) => (
                  <div key={i} className="p-3 border border-gray-200 rounded-lg hover:border-blue-200 transition-colors">
                    <h4 className="text-sm font-medium text-gray-800">{item.title}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 파일 미첨부 안내 */}
          {!label.designFileUrl && (
            <div className="card text-center py-12">
              <div className="text-5xl mb-4">{'\u{1F4E4}'}</div>
              <p className="text-gray-500 mb-2">디자인 파일이 아직 첨부되지 않았습니다.</p>
              <p className="text-sm text-gray-400 mb-4">
                디자이너가 제작한 라벨 시안(PDF, PNG, JPG)을 업로드하면<br />
                AI 생성 라벨과 나란히 비교 검수할 수 있습니다.
              </p>
              <label className="btn-primary cursor-pointer inline-block">
                디자인 파일 업로드
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleDesignUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* AI가 추출한 정보 (멀티 패스 1·2단계 결과) */}
          {label.designFileUrl && label.manufacturingReportUrl && (label.aiReportExtraction || label.aiDesignExtraction) && (
            <div className="card border-l-4 border-cyan-500">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span>{'\u{1F4D1}'}</span> AI 추출 정보 (멀티 패스 1·2단계)
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                AI가 두 PDF에서 각각 추출한 정보입니다. 비교 결과가 이상하면 여기서 추출 오류를 먼저 확인하세요.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {label.aiReportExtraction && (
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <h4 className="text-sm font-bold mb-2 text-cyan-800">{'\u{1F4C4}'} 품목제조보고서 추출</h4>
                    <pre className="text-xs whitespace-pre-wrap break-words text-gray-700 max-h-[400px] overflow-auto bg-white p-2 rounded">
{JSON.stringify(label.aiReportExtraction, null, 2)}
                    </pre>
                  </div>
                )}
                {label.aiDesignExtraction && (
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <h4 className="text-sm font-bold mb-2 text-purple-800">{'\u{1F3A8}'} 디자인 작업물 추출</h4>
                    <pre className="text-xs whitespace-pre-wrap break-words text-gray-700 max-h-[400px] overflow-auto bg-white p-2 rounded">
{JSON.stringify(label.aiDesignExtraction, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI 자동 검토 결과 */}
          {label.designFileUrl && label.manufacturingReportUrl && (
            <div className="card border-l-4 border-indigo-500">
              <div className="flex items-start justify-between mb-4 gap-3">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <span>{'\u{1F916}'}</span> AI 자동 검토 의견 (멀티 패스 3단계)
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    멀티 패스 프로세스: ① 보고서 정보 추출 → ② 디자인 정보 추출 → ③ 두 결과를 텍스트로 비교
                  </p>
                </div>
                <button
                  onClick={handleAiReview}
                  disabled={aiReviewing}
                  className="btn-secondary text-xs"
                >
                  {aiReviewing ? 'AI 분석 중...' : label.aiDesignReview ? '다시 검토' : 'AI 검토 실행'}
                </button>
              </div>

              {aiReviewError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">
                  {aiReviewError}
                </div>
              )}

              {aiReviewing && !label.aiDesignReview && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  AI가 두 문서를 비교 분석하고 있습니다... (보통 10-30초 소요)
                </div>
              )}

              {label.aiDesignReview && (
                <div className="space-y-4">
                  {/* 요약 */}
                  <div className={`p-4 rounded-lg border-2 ${
                    label.aiDesignReview.overallStatus === 'critical' ? 'bg-red-50 border-red-300' :
                    label.aiDesignReview.overallStatus === 'needs_review' ? 'bg-yellow-50 border-yellow-300' :
                    'bg-green-50 border-green-300'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        label.aiDesignReview.overallStatus === 'critical' ? 'bg-red-600 text-white' :
                        label.aiDesignReview.overallStatus === 'needs_review' ? 'bg-yellow-600 text-white' :
                        'bg-green-600 text-white'
                      }`}>
                        {label.aiDesignReview.overallStatus === 'critical' ? '수정 필요' :
                         label.aiDesignReview.overallStatus === 'needs_review' ? '검토 권장' : '양호'}
                      </span>
                      {label.aiDesignReviewedAt && (
                        <span className="text-xs text-gray-500">
                          {new Date(label.aiDesignReviewedAt).toLocaleString('ko-KR')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800">{label.aiDesignReview.summary}</p>
                    {label.aiDesignReview.detectedCompanies && label.aiDesignReview.detectedCompanies.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200/50">
                        <p className="text-xs text-gray-600">
                          <span className="font-bold">디자인에서 발견된 회사:</span>{' '}
                          {label.aiDesignReview.detectedCompanies.map((c, i) => {
                            const name = typeof c === 'string' ? c : c.name;
                            const role = typeof c === 'string' ? '' : (c.role || '');
                            const isJoin = name.includes('조인앤조인') || name.toLowerCase().includes('join');
                            return (
                              <span
                                key={i}
                                className={`inline-block mr-1 px-1.5 py-0.5 rounded text-xs ${
                                  isJoin ? 'bg-indigo-100 text-indigo-800 font-bold' : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {name}{role && <span className="ml-1 opacity-70">({role})</span>}
                              </span>
                            );
                          })}
                        </p>
                        {label.aiDesignReview.detectedCompanies.length > 1 && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            ※ 검수는 (주)조인앤조인(제조원) 기준입니다. 다른 회사 정보는 designValue 컬럼에 참고로 표시됩니다.
                          </p>
                        )}
                        {label.aiDesignReview.reporterInfoExcluded && (
                          <p className="text-xs text-blue-700 mt-1 bg-blue-50 px-2 py-1 rounded">
                            {'\u{2139}️'} {label.aiDesignReview.reporterInfoExcluded}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 주요 데이터 비교 테이블 */}
                  {label.aiDesignReview.items && label.aiDesignReview.items.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border border-gray-200 rounded-lg">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 border-b">항목</th>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 border-b">품목제조보고서</th>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 border-b">디자인 작업물</th>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 border-b">상태</th>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 border-b">의견</th>
                          </tr>
                        </thead>
                        <tbody>
                          {label.aiDesignReview.items.map((item, i) => {
                            const statusStyle: Record<string, string> = {
                              match: 'bg-green-100 text-green-700',
                              minor: 'bg-blue-100 text-blue-700',
                              mismatch: 'bg-red-100 text-red-700',
                              needs_review: 'bg-purple-100 text-purple-700',
                              not_found_in_design: 'bg-orange-100 text-orange-700',
                              not_found_in_report: 'bg-orange-100 text-orange-700',
                            };
                            const statusLabel: Record<string, string> = {
                              match: '일치',
                              minor: '경미한 차이',
                              mismatch: '불일치',
                              needs_review: '재확인 필요',
                              not_found_in_design: '디자인 누락',
                              not_found_in_report: '보고서 누락',
                            };
                            return (
                              <tr key={i} className="border-b last:border-b-0">
                                <td className="px-3 py-2 font-medium text-gray-800 align-top">{item.field}</td>
                                <td className="px-3 py-2 text-gray-600 align-top text-xs">{item.reportValue || '-'}</td>
                                <td className="px-3 py-2 text-gray-600 align-top text-xs">{item.designValue || '-'}</td>
                                <td className="px-3 py-2 align-top">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${statusStyle[item.status] || 'bg-gray-100 text-gray-700'}`}>
                                    {statusLabel[item.status] || item.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-600 align-top text-xs">{item.comment}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 핵심 수정 사항 */}
                  {label.aiDesignReview.criticalIssues && label.aiDesignReview.criticalIssues.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <h4 className="text-sm font-bold text-red-800 mb-2">{'⚠️'} 반드시 수정 필요</h4>
                      <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                        {label.aiDesignReview.criticalIssues.map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 권장 사항 */}
                  {label.aiDesignReview.recommendations && label.aiDesignReview.recommendations.length > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="text-sm font-bold text-blue-800 mb-2">{'\u{1F4A1}'} 권장 개선 사항</h4>
                      <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                        {label.aiDesignReview.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 italic">
                    ※ AI 자동 검토 결과는 참고용입니다. 최종 승인 전 반드시 담당자가 직접 확인해주세요.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 안내: 보고서만 있고 디자인 미첨부 */}
          {!label.designFileUrl && label.manufacturingReportUrl && (
            <div className="card bg-blue-50 border border-blue-200 text-sm text-blue-800">
              {'\u{1F4A1}'} 품목제조보고서가 첨부되었습니다. 디자인 파일을 업로드하면 AI가 자동으로 두 문서를 비교 검토합니다.
            </div>
          )}
        </div>
      )}

      {/* 강조 표기사항 */}
      {activeTab === 'claims' && (
        <div className="space-y-6">
          {healthClaims.length > 0 ? (
            <>
              {eligibleClaims.length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-bold text-green-700 mb-4">표기 가능 ({eligibleClaims.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {eligibleClaims.map(c => (
                      <div key={c.id} className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                            {c.name}
                          </span>
                        </div>
                        <p className="text-xs text-green-800">{c.reason}</p>
                        <p className="text-xs text-green-600 mt-1">{c.standard}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {healthClaims.filter(c => !c.eligible).length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-bold text-gray-500 mb-4">
                    해당 없음 ({healthClaims.filter(c => !c.eligible).length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {healthClaims.filter(c => !c.eligible).map(c => (
                      <div key={c.id} className="p-3 bg-gray-50 rounded-lg">
                        <span className="text-xs font-bold text-gray-500">{c.name}</span>
                        <p className="text-xs text-gray-400 mt-1">{c.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500">저장된 강조 표기사항 분석 데이터가 없습니다.</p>
              <p className="text-sm text-gray-400 mt-1">새 라벨 작성 시 AI 분석을 통해 자동으로 생성됩니다.</p>
            </div>
          )}
        </div>
      )}

      {/* AI 검수 노트 */}
      {activeTab === 'ainotes' && (
        <div className="space-y-6">
          {aiNotes ? (
            <>
              {/* 경고 사항 */}
              {aiNotes.warnings && (aiNotes.warnings as any[]).length > 0 && (
                <div className="card border-l-4 border-yellow-400">
                  <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                    <span className="text-yellow-500">&#9888;</span> 확인 필요 사항
                  </h3>
                  <div className="space-y-2">
                    {(aiNotes.warnings as any[]).map((w: any, i: number) => (
                      <div key={i} className={`p-3 rounded-lg ${
                        w.severity === 'error' ? 'bg-red-50 border border-red-200' :
                        w.severity === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                        'bg-blue-50 border border-blue-200'
                      }`}>
                        <p className="text-sm font-medium text-gray-800">{w.message}</p>
                        {w.suggestion && <p className="text-xs text-gray-600 mt-0.5">{w.suggestion}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 원재료명 표기 문구 */}
              {aiNotes.ingredientLabelText && (
                <div className="card border-l-4 border-green-500">
                  <h3 className="text-lg font-bold mb-3">원재료명 표기 문구 (한국 표시기준 적용)</h3>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {(aiNotes.ingredientLabelText as any).korea}
                    </p>
                  </div>
                </div>
              )}

              {/* 규칙 적용 내역 */}
              {aiNotes.ruleApplicationReport && (aiNotes.ruleApplicationReport as any[]).length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-3">규칙 적용 내역</h3>
                  <div className="space-y-2">
                    {(aiNotes.ruleApplicationReport as any[]).map((r: any, i: number) => (
                      <div key={i} className={`p-3 rounded-lg border ${r.applied ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            r.applied ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                          }`}>{r.ruleId}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{r.ruleName}</p>
                            <p className="text-xs text-gray-600 mt-0.5">{r.details}</p>
                            {r.affectedIngredients && r.affectedIngredients.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {r.affectedIngredients.map((name: string, j: number) => (
                                  <span key={j} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{name}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 원산지 표기 분석 */}
              {aiNotes.originAnalysis && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-2">원산지 표기 분석</h3>
                  <p className="text-xs text-gray-500 mb-4">「농수산물의 원산지 표시 등에 관한 법률」 시행령 기준</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(aiNotes.originAnalysis as OriginRequirement[]).filter(r => r.required).length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-blue-700 mb-2">
                          표기 필수 ({(aiNotes.originAnalysis as OriginRequirement[]).filter(r => r.required).length})
                        </h4>
                        <div className="space-y-1.5">
                          {(aiNotes.originAnalysis as OriginRequirement[]).filter(r => r.required).map((r, i) => (
                            <div key={i} className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                              <span className="text-xs font-bold text-blue-700">{r.ingredientName}</span>
                              <p className="text-xs text-blue-600 mt-0.5">{r.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(aiNotes.originAnalysis as OriginRequirement[]).filter(r => !r.required).length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-gray-500 mb-2">
                          표기 불필요 ({(aiNotes.originAnalysis as OriginRequirement[]).filter(r => !r.required).length})
                        </h4>
                        <div className="space-y-1">
                          {(aiNotes.originAnalysis as OriginRequirement[]).filter(r => !r.required).map((r, i) => (
                            <div key={i} className="p-2 bg-gray-50 rounded-lg">
                              <span className="text-xs font-bold text-gray-500">{r.ingredientName}</span>
                              <p className="text-xs text-gray-400 mt-0.5">{r.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 주의사항 */}
              {aiNotes.precautions && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-4">주의사항</h3>
                  {Object.entries(aiNotes.precautions).map(([market, items]: [string, any]) => {
                    if (!items?.length) return null;
                    const flag = market === 'korea' ? '🇰🇷 한국' : market === 'us' ? '🇺🇸 미국' : '🇯🇵 일본';
                    return (
                      <div key={market} className="mb-4">
                        <h4 className="text-sm font-bold text-gray-700 mb-2">{flag}</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {items.map((p: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-yellow-500">&#9888;</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 보관방법 */}
              {aiNotes.storageInstructions && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-4">보관방법</h3>
                  {Object.entries(aiNotes.storageInstructions).map(([market, text]: [string, any]) => {
                    if (!text) return null;
                    const flag = market === 'korea' ? '🇰🇷' : market === 'us' ? '🇺🇸' : '🇯🇵';
                    return (
                      <div key={market} className="mb-2">
                        <span className="text-xs font-medium text-gray-500">{flag}</span>
                        <p className="text-sm text-gray-700">{text}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 규정 검토 결과 */}
              {aiNotes.compliance && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-4">규정 검토 결과</h3>
                  {Object.entries(aiNotes.compliance).map(([market, result]: [string, any]) => {
                    if (!result) return null;
                    const flag = market === 'korea' ? '🇰🇷 한국 (MFDS)' : market === 'us' ? '🇺🇸 미국 (FDA)' : '🇯🇵 일본 (CAA)';
                    return (
                      <div key={market} className="mb-6 last:mb-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-sm font-bold">{flag}</h4>
                          <span className={`text-xs font-bold ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                            {result.passed ? '통과' : '미통과'} ({result.score}/100)
                          </span>
                        </div>
                        {result.issues?.length > 0 && (
                          <ul className="text-xs text-gray-600 space-y-1 mb-2">
                            {result.issues.map((issue: any, i: number) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className={issue.severity === 'error' ? 'text-red-500' : 'text-yellow-500'}>
                                  {issue.severity === 'error' ? '●' : '▲'}
                                </span>
                                <span>{issue.message}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {result.recommendations?.length > 0 && (
                          <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
                            <strong>권장사항:</strong>
                            <ul className="list-disc list-inside mt-1">
                              {result.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500">저장된 AI 검수 노트가 없습니다.</p>
              <p className="text-sm text-gray-400 mt-1">새 라벨 작성 시 AI 검수를 통해 자동으로 생성됩니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 부서별 검토 */}
      {activeTab === 'review' && (
        <ReviewWorkflow
          labelId={label.id}
          productName={label.productName}
          reviewCategories={label.reviewCategories}
          onUpdate={fetchLabel}
        />
      )}
    </AppLayout>
  );
}
