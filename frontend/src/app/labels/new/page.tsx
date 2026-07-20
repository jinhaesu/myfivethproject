'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import NutritionLabel from '@/components/NutritionLabel';
import ComplianceCheck from '@/components/ComplianceCheck';
import PrintableLabel from '@/components/PrintableLabel';
import { api } from '@/lib/api';
import { SAMPLE_TEMPLATES, SampleTemplate } from '@/data/sampleLabels';
import { analyzeHealthClaims, HealthClaim, getEligibleClaims, getClaimBadgeColor } from '@/lib/healthClaims';
import { analyzeOriginRequirements, OriginRequirement, getRequiredOriginIngredients, getExemptOriginIngredients } from '@/lib/originRules';

interface SubIngredient {
  name: string;
}

interface Ingredient {
  name: string;
  ratio: string;
  origin: string;
  allergen: boolean;
  allergenInfo: string;
  ingredientType: 'regular' | 'compound' | 'additive';
  subIngredients: SubIngredient[];
  additivePurpose: string;
}

const EMPTY_INGREDIENT: Ingredient = {
  name: '', ratio: '', origin: '', allergen: false, allergenInfo: '',
  ingredientType: 'regular', subIngredients: [], additivePurpose: '',
};

const ADDITIVE_PURPOSES = [
  '합성보존료', '합성감미료', '합성착색료', '천연착색료',
  '발색제', '산화방지제', '표백제', '천연향료', '합성향료',
  '유화제', '증점제', '산도조절제', '팽창제', '영양강화제', '기타',
];

interface IngredientLink {
  url: string;
  usagePercent: string;
  memo: string;
}

const STEPS = ['템플릿 선택', '기본 정보', 'AI 생성', '규정 검토', '최종 결과'];

function HealthClaimsPanel({ claims }: { claims: HealthClaim[] }) {
  const eligible = getEligibleClaims(claims);
  const ineligible = claims.filter(c => !c.eligible);

  return (
    <div className="card">
      <h3 className="text-lg font-bold mb-4">강조 표기사항 분석</h3>
      <p className="text-xs text-gray-500 mb-4">
        식약처 「식품등의 표시·광고에 관한 법률」 기준
      </p>

      {eligible.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-bold text-green-700 mb-2">표기 가능 ({eligible.length})</h4>
          <div className="space-y-2">
            {eligible.map(c => (
              <div key={c.id} className="flex items-start gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                  {c.name}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-green-800">{c.reason}</p>
                  <p className="text-xs text-green-600 mt-0.5">{c.standard}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ineligible.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-500 mb-2">해당 없음 ({ineligible.length})</h4>
          <div className="space-y-1">
            {ineligible.map(c => (
              <div key={c.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                  {c.name}
                </span>
                <p className="text-xs text-gray-500 flex-1">{c.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewLabelPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 기본 정보
  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState('');
  const [salesChannel, setSalesChannel] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [servingUnit, setServingUnit] = useState('g');
  const [totalContent, setTotalContent] = useState('');
  const [totalUnit, setTotalUnit] = useState('g');
  const [targetMarkets, setTargetMarkets] = useState<string[]>(['korea']);

  // 소비기한, 보관방법, 혼입 알레르기
  const [shelfLife, setShelfLife] = useState('');
  const [storageMethod, setStorageMethod] = useState('');
  const [crossContaminationAllergens, setCrossContaminationAllergens] = useState('');

  // 영양성분
  const [nutrition, setNutrition] = useState<Record<string, string>>({
    calories: '', carbohydrates: '', sugars: '', dietaryFiber: '',
    protein: '', totalFat: '', saturatedFat: '', transFat: '',
    cholesterol: '', sodium: '', vitaminA: '', vitaminC: '', calcium: '', iron: '',
  });

  // 원재료 입력 모드
  const [ingredientInputMode, setIngredientInputMode] = useState<'manual' | 'link'>('manual');

  // 링크 입력 모드
  const [ingredientLinks, setIngredientLinks] = useState<IngredientLink[]>([{ url: '', usagePercent: '', memo: '' }]);
  const [linkExtracting, setLinkExtracting] = useState(false);
  const [linkExtractResult, setLinkExtractResult] = useState<any>(null);

  // 원재료
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ...EMPTY_INGREDIENT }]);

  // AI 생성 결과
  const [aiResult, setAiResult] = useState<any>(null);
  const [complianceResult, setComplianceResult] = useState<any>(null);

  // 인쇄용 라벨 포맷
  const [labelFormat, setLabelFormat] = useState<'korea' | 'us' | 'japan'>('korea');

  const applyTemplate = (template: SampleTemplate) => {
    setProductName(template.name);
    setProductType(template.productType);
    setServingSize(template.servingSize);
    setServingUnit(template.servingUnit);
    setTotalContent(template.totalContent);
    setTotalUnit(template.totalUnit);
    setIngredients(template.ingredients.map(i => ({
      ...EMPTY_INGREDIENT,
      ...i,
      ingredientType: (i as any).ingredientType || 'regular',
      subIngredients: (i as any).subIngredients || [],
      additivePurpose: (i as any).additivePurpose || '',
    })));
    setNutrition({ ...template.nutrition });
    setStep(1);
  };

  const handleNutritionChange = (key: string, value: string) => {
    setNutrition(prev => ({ ...prev, [key]: value }));
  };

  const addIngredient = () => setIngredients([...ingredients, { ...EMPTY_INGREDIENT }]);
  const removeIngredient = (idx: number) => setIngredients(ingredients.filter((_, i) => i !== idx));
  const updateIngredient = (idx: number, field: keyof Ingredient, value: any) => {
    const updated = [...ingredients];
    updated[idx] = { ...updated[idx], [field]: value };
    setIngredients(updated);
  };

  const toggleMarket = (market: string) => {
    setTargetMarkets(prev =>
      prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market]
    );
  };

  const addLink = () => setIngredientLinks([...ingredientLinks, { url: '', usagePercent: '', memo: '' }]);
  const removeLink = (idx: number) => setIngredientLinks(ingredientLinks.filter((_, i) => i !== idx));
  const updateLink = (idx: number, field: keyof IngredientLink, value: string) => {
    const updated = [...ingredientLinks];
    updated[idx] = { ...updated[idx], [field]: value };
    setIngredientLinks(updated);
  };

  const handleExtractFromLinks = async () => {
    const validLinks = ingredientLinks.filter(l => l.url.trim());
    if (validLinks.length === 0) {
      setError('원재료 링크를 1개 이상 입력해주세요.');
      return;
    }

    const totalUsage = validLinks.reduce((sum, l) => sum + (parseFloat(l.usagePercent) || 0), 0);
    if (totalUsage > 100) {
      setError('사용량 합계가 100%를 초과합니다.');
      return;
    }

    setError('');
    setLinkExtracting(true);
    try {
      const data = await api.ai.extractFromLinks({
        links: validLinks.map(l => ({
          url: l.url.trim(),
          usagePercent: parseFloat(l.usagePercent) || 0,
        })),
        productName,
        productType,
      });
      setLinkExtractResult(data.extracted);

      // 추출된 원재료를 ingredients 상태에 반영
      if (data.extracted?.mergedIngredients?.length > 0) {
        const merged: Ingredient[] = data.extracted.mergedIngredients.map((m: any) => ({
          name: m.name || '',
          ratio: String(m.ratio ?? ''),
          origin: m.origin || '',
          allergen: m.allergen || false,
          allergenInfo: m.allergenInfo || '',
          ingredientType: m.ingredientType || 'regular',
          subIngredients: (m.subIngredients || []).map((s: any) => ({ name: s.name || '' })),
          additivePurpose: m.additivePurpose || '',
        }));
        setIngredients(merged);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLinkExtracting(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!productName.trim()) {
      setError('제품명을 입력해주세요.');
      return;
    }
    const validIngredients = ingredients.filter(i => i.name.trim());
    if (validIngredients.length === 0) {
      setError('원재료를 최소 1개 입력해주세요.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await api.ai.generateLabel({
        productName,
        productType,
        ingredients: validIngredients.map(i => ({
          name: i.name,
          ratio: i.ratio || '0',
          origin: i.origin,
          ingredientType: i.ingredientType || 'regular',
          subIngredients: i.ingredientType === 'compound' ? i.subIngredients.filter(s => s.name.trim()) : [],
          additivePurpose: i.ingredientType === 'additive' ? i.additivePurpose : '',
          allergen: i.allergen,
          allergenInfo: i.allergenInfo,
        })),
        servingSize,
        servingUnit,
        totalContent,
        totalUnit,
        targetMarkets,
        shelfLife,
        storageMethod,
        crossContaminationAllergens,
      });
      setAiResult(data.generated);

      // AI가 보관방법을 추천한 경우 자동 반영 (사용자가 미입력 시)
      if (!storageMethod && data.generated?.storageInstructions?.korea) {
        setStorageMethod(data.generated.storageInstructions.korea);
      }

      // AI 결과로 영양성분 자동 채우기
      if (data.generated?.nutritionInfo) {
        const ni = data.generated.nutritionInfo;
        setNutrition({
          calories: String(ni.calories ?? ''),
          carbohydrates: String(ni.carbohydrates ?? ''),
          sugars: String(ni.sugars ?? ''),
          dietaryFiber: String(ni.dietaryFiber ?? ''),
          protein: String(ni.protein ?? ''),
          totalFat: String(ni.totalFat ?? ''),
          saturatedFat: String(ni.saturatedFat ?? ''),
          transFat: String(ni.transFat ?? ''),
          cholesterol: String(ni.cholesterol ?? ''),
          sodium: String(ni.sodium ?? ''),
          vitaminA: String(ni.vitaminA ?? ''),
          vitaminC: String(ni.vitaminC ?? ''),
          calcium: String(ni.calcium ?? ''),
          iron: String(ni.iron ?? ''),
        });
      }

      // 알레르기 정보 자동 업데이트
      if (data.generated?.allergens?.korea) {
        const allergenList = data.generated.allergens.korea;
        setIngredients(prev =>
          prev.map(ing => {
            const hasAllergen = allergenList.some((a: string) =>
              ing.name.includes(a) || a.includes(ing.name)
            );
            return hasAllergen ? { ...ing, allergen: true, allergenInfo: ing.allergenInfo || allergenList.join(', ') } : ing;
          })
        );
      }

      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplianceCheck = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.ai.checkCompliance({
        productName,
        productType,
        ingredients: ingredients.filter(i => i.name.trim()),
        nutritionInfo: Object.fromEntries(
          Object.entries(nutrition).map(([k, v]) => [k, v ? parseFloat(v) : null])
        ),
        allergens: aiResult?.allergens,
        servingSize,
        servingUnit,
        totalContent,
        totalUnit,
        storageInstructions: aiResult?.storageInstructions,
        targetMarkets,
      });
      setComplianceResult(data.compliance);
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const nutritionForPreview = Object.fromEntries(
    Object.entries(nutrition).map(([k, v]) => [k, v ? parseFloat(v) : null])
  );

  const currentHealthClaims = analyzeHealthClaims(
    nutritionForPreview,
    servingSize ? parseFloat(servingSize) : null,
  );

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      // AI 주의사항 정리
      const aiNotes: any = {};
      if (aiResult?.precautions) aiNotes.precautions = aiResult.precautions;
      if (aiResult?.storageInstructions) aiNotes.storageInstructions = aiResult.storageInstructions;
      if (aiResult?.regulatoryText) aiNotes.regulatoryText = aiResult.regulatoryText;
      if (aiResult?.ingredientLabelText) aiNotes.ingredientLabelText = aiResult.ingredientLabelText;
      if (aiResult?.ruleApplicationReport) aiNotes.ruleApplicationReport = aiResult.ruleApplicationReport;
      if (aiResult?.warnings) aiNotes.warnings = aiResult.warnings;
      if (complianceResult) aiNotes.compliance = complianceResult;

      // 원산지 분석 결과 저장
      const validIngredients = ingredients.filter(i => i.name.trim());
      const originAnalysisResult = analyzeOriginRequirements(
        validIngredients.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin })),
        productType,
        productName,
      );
      aiNotes.originAnalysis = originAnalysisResult;

      const data = await api.labels.create({
        productName,
        productType: productType || null,
        salesChannel: salesChannel || null,
        servingSize: servingSize || null,
        servingUnit,
        totalContent: totalContent || null,
        totalUnit,
        shelfLife: shelfLife || null,
        storageMethod: storageMethod || null,
        crossContaminationAllergens: crossContaminationAllergens || null,
        nutritionInfo: nutrition,
        ingredients: ingredients
          .filter(ing => ing.name.trim())
          .map(ing => ({
            ...ing,
            ratio: ing.ratio || '0',
            subIngredients: ing.ingredientType === 'compound' ? ing.subIngredients.filter(s => s.name.trim()) : [],
            additivePurpose: ing.ingredientType === 'additive' ? ing.additivePurpose : '',
          })),
        healthClaims: currentHealthClaims,
        aiNotes: Object.keys(aiNotes).length > 0 ? aiNotes : null,
        labelSnapshot: aiResult || null,
      });
      router.push(`/labels/${data.label.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      {/* 스텝 인디케이터 */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => i <= step ? setStep(i) : null}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${
                  i === step
                    ? 'bg-blue-600 text-white'
                    : i < step
                    ? 'bg-green-500 text-white cursor-pointer'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </button>
              <span className={`ml-2 text-xs hidden sm:inline ${i === step ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-8 sm:w-16 h-0.5 mx-2 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        {/* 모바일: 스텝 이름이 숨겨지므로 현재 단계를 따로 표시 */}
        <p className="sm:hidden mt-2 text-center text-xs text-blue-600 font-bold">
          {step + 1}. {STEPS[step]}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 0: 템플릿 선택 */}
      {step === 0 && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">새 표기사항 작성</h1>
          <p className="text-gray-500 mb-6">샘플 템플릿으로 시작하거나 직접 입력하세요.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {SAMPLE_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="card text-left hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="text-3xl mb-2">{t.emoji}</div>
                <h3 className="font-bold text-gray-900">{t.name}</h3>
                <p className="text-sm text-gray-500">{t.productType}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {t.ingredients.length}개 원재료 | {t.servingSize}{t.servingUnit} 기준
                </p>
              </button>
            ))}
          </div>

          <div className="text-center">
            <button onClick={() => setStep(1)} className="btn-secondary">
              직접 입력하기
            </button>
          </div>
        </div>
      )}

      {/* Step 1: 기본 정보 입력 */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* 제품 기본 정보 */}
            <div className="card">
              <h2 className="text-lg font-bold mb-4">제품 기본 정보</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제품명 *</label>
                  <input type="text" value={productName} onChange={e => setProductName(e.target.value)}
                    className="input-field" placeholder="제품명을 입력하세요" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">식품유형</label>
                  <input type="text" value={productType} onChange={e => setProductType(e.target.value)}
                    className="input-field" placeholder="과자, 음료, 유제품 등" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">판매채널</label>
                  <input type="text" value={salesChannel} onChange={e => setSalesChannel(e.target.value)}
                    className="input-field" placeholder="온라인, 오프라인, 수출 등" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">총 내용량</label>
                  <div className="flex gap-2">
                    <input type="number" value={totalContent} onChange={e => setTotalContent(e.target.value)}
                      className="input-field flex-1" placeholder="0" step="any" />
                    <select value={totalUnit} onChange={e => setTotalUnit(e.target.value)} className="input-field w-20">
                      <option value="g">g</option><option value="ml">ml</option>
                      <option value="kg">kg</option><option value="L">L</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">1회 제공량</label>
                  <div className="flex gap-2">
                    <input type="number" value={servingSize} onChange={e => setServingSize(e.target.value)}
                      className="input-field flex-1" placeholder="0" step="any" />
                    <select value={servingUnit} onChange={e => setServingUnit(e.target.value)} className="input-field w-20">
                      <option value="g">g</option><option value="ml">ml</option>
                      <option value="개">개</option><option value="포">포</option><option value="정">정</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 대상 시장 */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">대상 시장 (복수 선택)</label>
                <div className="flex gap-3">
                  {[
                    { id: 'korea', flag: '🇰🇷', name: '한국' },
                    { id: 'us', flag: '🇺🇸', name: '미국' },
                    { id: 'japan', flag: '🇯🇵', name: '일본' },
                  ].map(m => (
                    <button key={m.id} type="button" onClick={() => toggleMarket(m.id)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        targetMarkets.includes(m.id)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {m.flag} {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 원재료 입력 모드 탭 */}
            <div className="card">
              <div className="flex items-center gap-1 mb-4 border-b">
                <button
                  type="button"
                  onClick={() => setIngredientInputMode('manual')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    ingredientInputMode === 'manual'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  직접 입력
                </button>
                <button
                  type="button"
                  onClick={() => setIngredientInputMode('link')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    ingredientInputMode === 'link'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  링크로 자동 추출
                </button>
              </div>

              {/* 링크 입력 모드 */}
              {ingredientInputMode === 'link' && (
                <div>
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                    <h2 className="text-lg font-bold">원재료 링크 입력</h2>
                    <button type="button" onClick={addLink} className="btn-secondary text-sm">+ 링크 추가</button>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    사용하는 원재료의 판매처/공급처 링크를 넣고 사용량(%)을 입력하세요. AI가 웹페이지에서 성분 정보를 추출하여 자동으로 원재료를 구성합니다.
                  </p>

                  <div className="space-y-3 mb-4">
                    {ingredientLinks.map((link, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3">
                        <div className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-6">
                            <label className="block text-xs text-gray-500 mb-0.5">판매처/공급처 URL</label>
                            <input
                              type="url"
                              value={link.url}
                              onChange={e => updateLink(idx, 'url', e.target.value)}
                              className="input-field text-sm"
                              placeholder="https://example.com/product/..."
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-0.5">사용량 (%)</label>
                            <input
                              type="number"
                              value={link.usagePercent}
                              onChange={e => updateLink(idx, 'usagePercent', e.target.value)}
                              className="input-field text-sm"
                              placeholder="30"
                              step="any"
                              min="0"
                              max="100"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs text-gray-500 mb-0.5">메모 (선택)</label>
                            <input
                              type="text"
                              value={link.memo}
                              onChange={e => updateLink(idx, 'memo', e.target.value)}
                              className="input-field text-sm"
                              placeholder="예: 초콜릿칩"
                            />
                          </div>
                          <div className="col-span-1 flex items-end pb-1">
                            {ingredientLinks.length > 1 && (
                              <button type="button" onClick={() => removeLink(idx)}
                                className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 사용량 합계 */}
                  <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">사용량 합계</span>
                    <span className={`text-sm font-bold ${
                      (() => {
                        const total = ingredientLinks.reduce((sum, l) => sum + (parseFloat(l.usagePercent) || 0), 0);
                        return total > 100 ? 'text-red-600' : total === 100 ? 'text-green-600' : 'text-yellow-600';
                      })()
                    }`}>
                      {ingredientLinks.reduce((sum, l) => sum + (parseFloat(l.usagePercent) || 0), 0).toFixed(1)}%
                      {(() => {
                        const total = ingredientLinks.reduce((sum, l) => sum + (parseFloat(l.usagePercent) || 0), 0);
                        if (total > 100) return ' (초과)';
                        if (total < 100) return ' (나머지는 정제수 등)';
                        return '';
                      })()}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleExtractFromLinks}
                    disabled={linkExtracting}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {linkExtracting ? (
                      <><span className="animate-spin">&#8987;</span> AI가 원재료 정보를 추출하는 중...</>
                    ) : (
                      <><span>&#129302;</span> AI로 원재료 추출</>
                    )}
                  </button>

                  {/* 추출 결과 */}
                  {linkExtractResult && (
                    <div className="mt-4 space-y-3">
                      {/* 경고 */}
                      {linkExtractResult.warnings && linkExtractResult.warnings.length > 0 && (
                        <div className="border-l-4 border-yellow-400 bg-yellow-50 p-3 rounded-r-lg">
                          <h4 className="text-sm font-bold text-yellow-800 mb-2">확인 필요 사항</h4>
                          <div className="space-y-1">
                            {linkExtractResult.warnings.map((w: any, i: number) => (
                              <div key={i} className={`text-xs p-2 rounded ${
                                w.severity === 'error' ? 'bg-red-50 text-red-700' :
                                w.severity === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                                'bg-blue-50 text-blue-700'
                              }`}>
                                <p className="font-medium">{w.message}</p>
                                {w.suggestion && <p className="text-xs mt-0.5 opacity-80">{w.suggestion}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 추출된 원재료 요약 */}
                      {linkExtractResult.summary && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <h4 className="text-sm font-bold text-green-800 mb-1">추출 결과</h4>
                          <p className="text-xs text-green-700">{linkExtractResult.summary}</p>
                        </div>
                      )}

                      {/* 링크별 상세 */}
                      {linkExtractResult.extractedIngredients && linkExtractResult.extractedIngredients.length > 0 && (
                        <div className="border border-gray-200 rounded-lg p-3">
                          <h4 className="text-sm font-bold text-gray-700 mb-2">링크별 추출 내역</h4>
                          <div className="space-y-2">
                            {linkExtractResult.extractedIngredients.map((ext: any, i: number) => (
                              <div key={i} className="p-2 bg-gray-50 rounded text-xs">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-gray-700">{ext.sourceName || `원재료 ${i + 1}`}</span>
                                  <span className="text-gray-400">({ext.usagePercent}%)</span>
                                </div>
                                <p className="text-gray-500 truncate">{ext.sourceUrl}</p>
                                {ext.ingredients && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {ext.ingredients.slice(0, 8).map((ing: any, j: number) => (
                                      <span key={j} className={`px-1.5 py-0.5 rounded text-xs ${
                                        ing.ingredientType === 'compound' ? 'bg-purple-100 text-purple-700' :
                                        ing.ingredientType === 'additive' ? 'bg-orange-100 text-orange-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>{ing.name}</span>
                                    ))}
                                    {ext.ingredients.length > 8 && (
                                      <span className="text-gray-400 text-xs">+{ext.ingredients.length - 8}개</span>
                                    )}
                                  </div>
                                )}
                                {ext.notes && <p className="text-yellow-600 mt-1">{ext.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 전체 알레르기 */}
                      {linkExtractResult.totalAllergens && linkExtractResult.totalAllergens.length > 0 && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <h4 className="text-sm font-bold text-red-700 mb-1">알레르기 유발물질 감지</h4>
                          <div className="flex flex-wrap gap-1">
                            {linkExtractResult.totalAllergens.map((a: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{a}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-700">
                          추출된 원재료가 아래 &quot;직접 입력&quot; 탭에 자동으로 반영되었습니다.
                          필요시 &quot;직접 입력&quot; 탭에서 수정하거나, 바로 AI 라벨 생성을 진행하세요.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 직접 입력 모드 */}
              {ingredientInputMode === 'manual' && (
                <div>
              <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                <h2 className="text-lg font-bold">배합비 (원재료)</h2>
                <button type="button" onClick={addIngredient} className="btn-secondary text-sm">+ 원재료 추가</button>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                각 원재료의 유형을 지정하세요. 복합원재료는 구성성분을, 식품첨가물은 용도를 입력하면 AI가 한국 표시기준에 맞는 표기를 생성합니다.
              </p>
              <div className="space-y-3">
                {ingredients.map((ing, idx) => (
                  <div key={idx} className={`border rounded-lg p-3 ${
                    ing.ingredientType === 'compound' ? 'border-purple-300 bg-purple-50/30' :
                    ing.ingredientType === 'additive' ? 'border-orange-300 bg-orange-50/30' :
                    'border-gray-200'
                  }`}>
                    {/* 메인 입력 행 */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-500 mb-0.5">원재료명</label>
                        <input type="text" value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)}
                          className="input-field text-sm" placeholder="원재료명" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-xs text-gray-500 mb-0.5">배합비</label>
                        <input type="number" value={ing.ratio} onChange={e => updateIngredient(idx, 'ratio', e.target.value)}
                          className="input-field text-sm" placeholder="%" step="any" min="0" max="100" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">유형</label>
                        <select value={ing.ingredientType} onChange={e => updateIngredient(idx, 'ingredientType', e.target.value)}
                          className="input-field text-sm">
                          <option value="regular">일반 원료</option>
                          <option value="compound">복합원재료</option>
                          <option value="additive">식품첨가물</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">원산지</label>
                        <input type="text" value={ing.origin} onChange={e => updateIngredient(idx, 'origin', e.target.value)}
                          className="input-field text-sm" placeholder="국산" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">알레르기</label>
                        <div className="flex items-center gap-1">
                          <input type="checkbox" checked={ing.allergen}
                            onChange={e => updateIngredient(idx, 'allergen', e.target.checked)} className="w-4 h-4" />
                          <input type="text" value={ing.allergenInfo}
                            onChange={e => updateIngredient(idx, 'allergenInfo', e.target.value)}
                            className="input-field text-xs flex-1" placeholder="대두, 밀" disabled={!ing.allergen} />
                        </div>
                      </div>
                      <div className="col-span-2 flex items-end gap-1 pb-0.5">
                        {idx > 0 && (
                          <button type="button" onClick={() => {
                            const updated = [...ingredients];
                            [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
                            setIngredients(updated);
                          }} className="text-gray-400 hover:text-gray-600 text-xs px-1">&#9650;</button>
                        )}
                        {idx < ingredients.length - 1 && (
                          <button type="button" onClick={() => {
                            const updated = [...ingredients];
                            [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
                            setIngredients(updated);
                          }} className="text-gray-400 hover:text-gray-600 text-xs px-1">&#9660;</button>
                        )}
                        {ingredients.length > 1 && (
                          <button type="button" onClick={() => removeIngredient(idx)}
                            className="text-red-400 hover:text-red-600 text-xs ml-auto">삭제</button>
                        )}
                      </div>
                    </div>

                    {/* 복합원재료: 구성성분 입력 */}
                    {ing.ingredientType === 'compound' && (
                      <div className="mt-2 ml-4 p-2 bg-purple-50 rounded border border-purple-200">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                          <span className="text-xs font-bold text-purple-700">구성성분 (5% 이상 시 상위 5개 이상 필요)</span>
                          <button type="button" onClick={() => {
                            const updated = [...ingredients];
                            updated[idx] = { ...updated[idx], subIngredients: [...updated[idx].subIngredients, { name: '' }] };
                            setIngredients(updated);
                          }} className="text-xs text-purple-600 hover:underline">+ 추가</button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {ing.subIngredients.map((sub, subIdx) => (
                            <div key={subIdx} className="flex items-center gap-1">
                              <input type="text" value={sub.name}
                                onChange={e => {
                                  const updated = [...ingredients];
                                  const subs = [...updated[idx].subIngredients];
                                  subs[subIdx] = { ...subs[subIdx], name: e.target.value };
                                  updated[idx] = { ...updated[idx], subIngredients: subs };
                                  setIngredients(updated);
                                }}
                                className="input-field text-xs w-24 py-1" placeholder={`성분 ${subIdx + 1}`} />
                              <button type="button" onClick={() => {
                                const updated = [...ingredients];
                                const subs = updated[idx].subIngredients.filter((_, i) => i !== subIdx);
                                updated[idx] = { ...updated[idx], subIngredients: subs };
                                setIngredients(updated);
                              }} className="text-red-400 hover:text-red-600 text-xs">x</button>
                            </div>
                          ))}
                        </div>
                        {parseFloat(ing.ratio || '0') >= 5 && ing.subIngredients.filter(s => s.name.trim()).length < 5 && (
                          <p className="text-xs text-red-500 mt-1">
                            배합비 5% 이상 복합원재료는 구성성분을 5가지 이상 입력해야 합니다.
                          </p>
                        )}
                      </div>
                    )}

                    {/* 식품첨가물: 용도 선택 */}
                    {ing.ingredientType === 'additive' && (
                      <div className="mt-2 ml-4 p-2 bg-orange-50 rounded border border-orange-200">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-orange-700">첨가물 용도:</span>
                          <select value={ing.additivePurpose}
                            onChange={e => updateIngredient(idx, 'additivePurpose', e.target.value)}
                            className="input-field text-xs py-1 w-40">
                            <option value="">용도 선택</option>
                            {ADDITIVE_PURPOSES.map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          {['합성보존료', '합성감미료', '합성착색료', '발색제', '산화방지제', '표백제'].includes(ing.additivePurpose) && (
                            <span className="text-xs text-orange-600 font-medium">* 용도명 병기 의무</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
                </div>
              )}
            </div>

            {/* 영양성분 (수동 입력 가능) */}
            <div className="card">
              <h2 className="text-lg font-bold mb-2">영양성분 정보</h2>
              <p className="text-xs text-gray-500 mb-4">직접 입력하거나, AI가 자동으로 추정합니다.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {[
                  { key: 'calories', label: '열량 (kcal)' },
                  { key: 'carbohydrates', label: '탄수화물 (g)' },
                  { key: 'sugars', label: '당류 (g)' },
                  { key: 'dietaryFiber', label: '식이섬유 (g)' },
                  { key: 'protein', label: '단백질 (g)' },
                  { key: 'totalFat', label: '지방 (g)' },
                  { key: 'saturatedFat', label: '포화지방 (g)' },
                  { key: 'transFat', label: '트랜스지방 (g)' },
                  { key: 'cholesterol', label: '콜레스테롤 (mg)' },
                  { key: 'sodium', label: '나트륨 (mg)' },
                  { key: 'vitaminA', label: '비타민A (μg RE)' },
                  { key: 'vitaminC', label: '비타민C (mg)' },
                  { key: 'calcium', label: '칼슘 (mg)' },
                  { key: 'iron', label: '철 (mg)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input type="number" value={nutrition[key] || ''}
                      onChange={e => handleNutritionChange(key, e.target.value)}
                      className="input-field text-sm" placeholder="0" step="any" min="0" />
                  </div>
                ))}
              </div>
            </div>

            {/* 소비기한 / 보관방법 / 혼입 알레르기 */}
            <div className="card">
              <h2 className="text-lg font-bold mb-4">소비기한 / 보관방법 / 혼입 알레르기</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">소비기한 (기준 소비기한)</label>
                    <input
                      type="text"
                      value={shelfLife}
                      onChange={e => setShelfLife(e.target.value)}
                      className="input-field"
                      placeholder="예: 제조일로부터 12개월, 2025.12.31"
                    />
                    <p className="text-xs text-gray-400 mt-1">미입력 시 AI가 일반적인 권장 범위를 안내합니다.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">보관방법</label>
                    <input
                      type="text"
                      value={storageMethod}
                      onChange={e => setStorageMethod(e.target.value)}
                      className="input-field"
                      placeholder="예: 직사광선을 피해 서늘한 곳에 보관"
                    />
                    <p className="text-xs text-gray-400 mt-1">미입력 시 AI가 원재료 기반으로 추천합니다.</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    혼입 가능 알레르기 유발물질
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    같은 제조시설에서 다른 제품에 사용하는 알레르기 유발물질을 입력하세요. 라벨에 &quot;이 제품은 OO을(를) 사용한 제품과 같은 제조시설에서 제조하고 있습니다&quot; 문구가 추가됩니다.
                  </p>
                  <input
                    type="text"
                    value={crossContaminationAllergens}
                    onChange={e => setCrossContaminationAllergens(e.target.value)}
                    className="input-field"
                    placeholder="예: 우유, 밀, 메밀, 땅콩, 게, 새우"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="btn-secondary">이전</button>
              <button onClick={handleAIGenerate} disabled={loading}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {loading ? (
                  <><span className="animate-spin">⏳</span> AI 분석 중...</>
                ) : (
                  <><span>🤖</span> AI로 라벨 생성</>
                )}
              </button>
              <button onClick={() => { setStep(4); }} className="btn-secondary">AI 없이 저장</button>
            </div>
          </div>

          {/* 오른쪽: 미리보기 */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              <div className="card">
                <h3 className="text-lg font-bold mb-4">미리보기</h3>
                <NutritionLabel
                  productName={productName || '제품명'}
                  servingSize={servingSize ? parseFloat(servingSize) : null}
                  servingUnit={servingUnit}
                  totalContent={totalContent ? parseFloat(totalContent) : null}
                  totalUnit={totalUnit}
                  nutritionInfo={nutritionForPreview}
                />
              </div>
              <div className="card">
                <h3 className="text-sm font-bold mb-2">원재료명 표기 (실제 라벨)</h3>
                <p className="text-xs text-gray-500 mb-1">※ 배합비(%)는 내부용이며, 실제 표기사항에는 미기재</p>
                <p className="text-xs text-gray-500 mb-1">※ 원산지는 법적 의무 대상 원재료만 표기</p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {(() => {
                    const valid = ingredients.filter(i => i.name.trim());
                    if (valid.length === 0) return '원재료를 입력해주세요.';
                    const sorted = [...valid].sort((a, b) => parseFloat(b.ratio || '0') - parseFloat(a.ratio || '0'));
                    const analysis = analyzeOriginRequirements(
                      sorted.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin })),
                      productType,
                      productName,
                    );
                    return sorted.map(i => {
                      let t = i.name;
                      const req = analysis.find(r => r.ingredientName === i.name.trim());
                      if (req?.required && i.origin) t += `(${i.origin})`;
                      return t;
                    }).join(', ');
                  })()}
                </p>
                {(() => {
                  const valid = ingredients.filter(i => i.name.trim());
                  if (valid.length === 0) return null;
                  const analysis = analyzeOriginRequirements(
                    valid.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin })),
                    productType,
                    productName,
                  );
                  const required = analysis.filter(r => r.required);
                  const noOrigin = required.filter(r => {
                    const ing = valid.find(i => i.name.trim() === r.ingredientName);
                    return !ing?.origin;
                  });
                  if (noOrigin.length > 0) {
                    return (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        <strong>원산지 미입력 (필수):</strong>{' '}
                        {noOrigin.map(r => r.ingredientName).join(', ')}
                      </div>
                    );
                  }
                  return null;
                })()}
                {ingredients.some(i => i.allergen && i.allergenInfo) && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded text-xs">
                    <strong>알레르기 유발물질:</strong>{' '}
                    {ingredients.filter(i => i.allergen && i.allergenInfo).map(i => i.allergenInfo).join(', ')}
                  </div>
                )}
                {crossContaminationAllergens && (
                  <div className="mt-2 p-2 bg-orange-50 rounded text-xs">
                    <strong>혼입 가능:</strong> {crossContaminationAllergens}
                  </div>
                )}
                {storageMethod && (
                  <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                    <strong>보관방법:</strong> {storageMethod}
                  </div>
                )}
                {shelfLife && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                    <strong>소비기한:</strong> {shelfLife}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: AI 생성 결과 */}
      {step === 2 && aiResult && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">AI 생성 결과</h1>
          <p className="text-gray-500">한국 식품 표시기준에 따라 생성된 결과를 확인하세요.</p>

          {/* 경고 사항 (최상단) */}
          {aiResult.warnings && aiResult.warnings.length > 0 && (
            <div className="card border-l-4 border-yellow-400">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="text-yellow-500">&#9888;</span> 확인 필요 사항
              </h3>
              <div className="space-y-2">
                {aiResult.warnings.map((w: any, i: number) => (
                  <div key={i} className={`p-3 rounded-lg ${
                    w.severity === 'error' ? 'bg-red-50 border border-red-200' :
                    w.severity === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                    'bg-blue-50 border border-blue-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      <span className={`text-sm mt-0.5 ${
                        w.severity === 'error' ? 'text-red-500' :
                        w.severity === 'warning' ? 'text-yellow-600' : 'text-blue-500'
                      }`}>
                        {w.severity === 'error' ? '●' : w.severity === 'warning' ? '▲' : 'i'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{w.message}</p>
                        {w.suggestion && <p className="text-xs text-gray-600 mt-0.5">{w.suggestion}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 원재료명 표기 문구 (핵심 결과물) */}
          {aiResult.ingredientLabelText && (
            <div className="card border-l-4 border-green-500">
              <h3 className="text-lg font-bold mb-3">원재료명 표기 문구 (한국 표시기준 적용)</h3>
              <p className="text-xs text-gray-500 mb-3">
                아래 문구는 「식품등의 표시기준」 별지1 제1호에 따라 AI가 생성한 것입니다. 최종 확인 후 라벨에 사용하세요.
              </p>
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {aiResult.ingredientLabelText.korea}
                </p>
              </div>
              {aiResult.ingredientLabelText.us && targetMarkets.includes('us') && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs font-bold text-gray-500 block mb-1">US (FDA)</span>
                  <p className="text-xs text-gray-700">{aiResult.ingredientLabelText.us}</p>
                </div>
              )}
              {aiResult.ingredientLabelText.japan && targetMarkets.includes('japan') && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs font-bold text-gray-500 block mb-1">Japan (CAA)</span>
                  <p className="text-xs text-gray-700">{aiResult.ingredientLabelText.japan}</p>
                </div>
              )}
            </div>
          )}

          {/* 규칙 적용 내역 */}
          {aiResult.ruleApplicationReport && aiResult.ruleApplicationReport.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-bold mb-3">규칙 적용 내역</h3>
              <p className="text-xs text-gray-500 mb-3">각 표시 규칙이 이 제품에 어떻게 적용되었는지 확인하세요.</p>
              <div className="space-y-2">
                {aiResult.ruleApplicationReport.map((r: any, i: number) => (
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 영양성분 */}
            <div className="card">
              <h3 className="text-lg font-bold mb-4">영양성분 (AI 추정)</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-xs text-yellow-700">
                AI가 추정한 값입니다. 실제 영양분석 결과로 수정해주세요.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'calories', label: '열량', unit: 'kcal' },
                  { key: 'carbohydrates', label: '탄수화물', unit: 'g' },
                  { key: 'sugars', label: '당류', unit: 'g' },
                  { key: 'dietaryFiber', label: '식이섬유', unit: 'g' },
                  { key: 'protein', label: '단백질', unit: 'g' },
                  { key: 'totalFat', label: '지방', unit: 'g' },
                  { key: 'saturatedFat', label: '포화지방', unit: 'g' },
                  { key: 'transFat', label: '트랜스지방', unit: 'g' },
                  { key: 'cholesterol', label: '콜레스테롤', unit: 'mg' },
                  { key: 'sodium', label: '나트륨', unit: 'mg' },
                ].map(({ key, label, unit }) => (
                  <div key={key} className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">{label}</span>
                    <div className="flex items-center gap-1">
                      <input type="number" value={nutrition[key] || ''}
                        onChange={e => handleNutritionChange(key, e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm" step="any" />
                      <span className="text-gray-400 text-xs w-8">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 알레르기 & 보관 */}
            <div className="space-y-4">
              {aiResult.allergens && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-3">알레르기 유발물질</h3>
                  {targetMarkets.includes('korea') && aiResult.allergens.korea && (
                    <div className="mb-3">
                      <span className="text-xs font-medium text-gray-500">🇰🇷 한국</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aiResult.allergens.korea.map((a: string) => (
                          <span key={a} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {targetMarkets.includes('us') && aiResult.allergens.us && (
                    <div className="mb-3">
                      <span className="text-xs font-medium text-gray-500">🇺🇸 미국</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aiResult.allergens.us.map((a: string) => (
                          <span key={a} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {targetMarkets.includes('japan') && aiResult.allergens.japan && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">🇯🇵 일본</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aiResult.allergens.japan.map((a: string) => (
                          <span key={a} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 혼입 가능 알레르기 */}
                  {(crossContaminationAllergens || aiResult.allergens?.crossContamination?.length > 0 || aiResult.crossContaminationStatement) && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <span className="text-xs font-medium text-orange-600">혼입 가능 알레르기 (같은 제조시설)</span>
                      {crossContaminationAllergens && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {crossContaminationAllergens.split(',').map((a: string) => a.trim()).filter(Boolean).map((a: string) => (
                            <span key={a} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">{a}</span>
                          ))}
                        </div>
                      )}
                      {aiResult.crossContaminationStatement && (
                        <p className="text-xs text-orange-700 mt-2 p-2 bg-orange-50 rounded">
                          {aiResult.crossContaminationStatement}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {aiResult.storageInstructions && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-3">보관방법 {!storageMethod ? <span className="text-xs font-normal text-blue-500 ml-2">(AI 추천)</span> : ''}</h3>
                  {targetMarkets.includes('korea') && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-500">🇰🇷</span>
                      <p className="text-sm">{aiResult.storageInstructions.korea}</p>
                    </div>
                  )}
                  {targetMarkets.includes('us') && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-500">🇺🇸</span>
                      <p className="text-sm">{aiResult.storageInstructions.us}</p>
                    </div>
                  )}
                  {targetMarkets.includes('japan') && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">🇯🇵</span>
                      <p className="text-sm">{aiResult.storageInstructions.japan}</p>
                    </div>
                  )}
                </div>
              )}

              {/* 소비기한 정보 */}
              {(shelfLife || aiResult.shelfLifeRecommendation) && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-3">소비기한</h3>
                  {shelfLife && (
                    <div className="mb-2 p-2 bg-gray-50 rounded">
                      <span className="text-xs text-gray-500">입력값</span>
                      <p className="text-sm font-medium text-gray-800">{shelfLife}</p>
                    </div>
                  )}
                  {aiResult.shelfLifeRecommendation && (
                    <div className="p-2 bg-blue-50 rounded">
                      <span className="text-xs text-blue-500">AI 참고 안내</span>
                      <p className="text-sm text-blue-700">{aiResult.shelfLifeRecommendation}</p>
                    </div>
                  )}
                </div>
              )}

              {aiResult.precautions && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-3">주의사항</h3>
                  {targetMarkets.map(market => {
                    const flag = market === 'korea' ? '🇰🇷' : market === 'us' ? '🇺🇸' : '🇯🇵';
                    const items = aiResult.precautions?.[market];
                    if (!items?.length) return null;
                    return (
                      <div key={market} className="mb-2">
                        <span className="text-xs font-medium text-gray-500">{flag}</span>
                        <ul className="text-sm text-gray-700 list-disc list-inside">
                          {items.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 강조 표기사항 분석 */}
          <HealthClaimsPanel claims={currentHealthClaims} />

          {/* 원산지 표기 분석 */}
          {(() => {
            const valid = ingredients.filter(i => i.name.trim());
            const analysis = analyzeOriginRequirements(
              valid.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin })),
              productType,
              productName,
            );
            const required = analysis.filter(r => r.required);
            const exempt = analysis.filter(r => !r.required);
            return (
              <div className="card">
                <h3 className="text-lg font-bold mb-2">원산지 표기 분석</h3>
                <p className="text-xs text-gray-500 mb-4">
                  「농수산물의 원산지 표시 등에 관한 법률」 시행령 기준
                </p>

                {required.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-bold text-blue-700 mb-2">원산지 표기 필수 ({required.length})</h4>
                    <div className="space-y-2">
                      {required.map((r, i) => {
                        const ing = valid.find(v => v.name.trim() === r.ingredientName);
                        return (
                          <div key={i} className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                              {r.ingredientName}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-blue-800">{r.reason}</p>
                              <p className="text-xs text-blue-600 mt-0.5">
                                {ing?.origin ? `원산지: ${ing.origin}` : '⚠️ 원산지 미입력'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {exempt.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 mb-2">원산지 표기 불필요 ({exempt.length})</h4>
                    <div className="space-y-1">
                      {exempt.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                            {r.ingredientName}
                          </span>
                          <p className="text-xs text-gray-500 flex-1">{r.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 규정별 원재료 표기 */}
          {aiResult.regulatoryText && (
            <div className="card">
              <h3 className="text-lg font-bold mb-4">국가별 원재료 표기</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {targetMarkets.map(market => {
                  const flag = market === 'korea' ? '🇰🇷 한국 (MFDS)' : market === 'us' ? '🇺🇸 미국 (FDA)' : '🇯🇵 일본 (CAA)';
                  const rt = aiResult.regulatoryText?.[market];
                  if (!rt) return null;
                  return (
                    <div key={market} className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-bold text-sm mb-2">{flag}</h4>
                      <p className="text-xs text-gray-500 mb-1">식품유형: {rt.foodType}</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{rt.ingredientsList}</p>
                      {rt.allergenStatement && (
                        <p className="text-xs text-red-600 mt-2 font-medium">{rt.allergenStatement}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-secondary">이전 (수정)</button>
            <button onClick={handleComplianceCheck} disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? (
                <><span className="animate-spin">⏳</span> 규정 검토 중...</>
              ) : (
                <><span>📋</span> 규정 준수 검토</>
              )}
            </button>
            <button onClick={() => setStep(4)} className="btn-secondary">검토 건너뛰기</button>
          </div>
        </div>
      )}

      {/* Step 3: 규정 준수 검토 */}
      {step === 3 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">규정 준수 검토 결과</h1>
          {complianceResult && <ComplianceCheck result={complianceResult} targetMarkets={targetMarkets} />}
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary">이전 (수정)</button>
            <button onClick={() => setStep(4)} className="btn-primary flex-1">
              최종 결과 확인
            </button>
          </div>
        </div>
      )}

      {/* Step 4: 최종 결과 - 라벨 디자인 + 강조표기 + 저장 */}
      {step === 4 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">최종 라벨 결과</h1>

          {/* 포맷 선택 */}
          <div className="flex gap-3">
            {[
              { id: 'korea' as const, flag: '🇰🇷', name: '한국 표기' },
              { id: 'us' as const, flag: '🇺🇸', name: 'US Label' },
              { id: 'japan' as const, flag: '🇯🇵', name: '日本表示' },
            ].map(f => (
              <button key={f.id} onClick={() => setLabelFormat(f.id)}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  labelFormat === f.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500'
                }`}>
                {f.flag} {f.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 인쇄용 라벨 */}
            <div className="lg:col-span-2 flex justify-center">
              <PrintableLabel
                format={labelFormat}
                productName={productName}
                productType={productType}
                servingSize={servingSize ? parseFloat(servingSize) : null}
                servingUnit={servingUnit}
                totalContent={totalContent ? parseFloat(totalContent) : null}
                totalUnit={totalUnit}
                nutritionInfo={nutritionForPreview}
                ingredients={ingredients.filter(i => i.name.trim())}
                aiResult={aiResult}
              />
            </div>

            {/* 사이드: 강조 표기 + AI 주의사항 요약 */}
            <div className="space-y-4">
              {/* 강조 표기 요약 */}
              <div className="card">
                <h3 className="text-sm font-bold mb-3">강조 표기 가능 항목</h3>
                {getEligibleClaims(currentHealthClaims).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {getEligibleClaims(currentHealthClaims).map(c => (
                      <span key={c.id} className={`px-2 py-1 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                        {c.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">해당하는 강조 표기사항이 없습니다.</p>
                )}
              </div>

              {/* 원산지 표기 요약 */}
              {(() => {
                const valid = ingredients.filter(i => i.name.trim());
                if (valid.length === 0) return null;
                const analysis = analyzeOriginRequirements(
                  valid.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin })),
                  productType,
                  productName,
                );
                const required = analysis.filter(r => r.required);
                if (required.length === 0) return null;
                return (
                  <div className="card">
                    <h3 className="text-sm font-bold mb-3">원산지 표기 대상</h3>
                    <div className="space-y-1.5">
                      {required.map((r, i) => {
                        const ing = valid.find(v => v.name.trim() === r.ingredientName);
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">{r.ingredientName}</span>
                            <span className={ing?.origin ? 'text-green-600' : 'text-red-500 font-bold'}>
                              {ing?.origin || '미입력'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">법적 의무 대상만 라벨에 원산지 표기</p>
                  </div>
                );
              })()}

              {/* AI 주의사항 */}
              {aiResult?.precautions?.korea && aiResult.precautions.korea.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-bold mb-3">AI 검수 주의사항</h3>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {aiResult.precautions.korea.map((p: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-yellow-500 mt-0.5">&#9888;</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 규정 검토 요약 */}
              {complianceResult?.korea && (
                <div className="card">
                  <h3 className="text-sm font-bold mb-3">규정 검토 결과</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-bold ${complianceResult.korea.passed ? 'text-green-600' : 'text-red-600'}`}>
                      {complianceResult.korea.passed ? '통과' : '미통과'}
                    </span>
                    <span className="text-xs text-gray-500">
                      점수: {complianceResult.korea.score}/100
                    </span>
                  </div>
                  {complianceResult.korea.issues?.length > 0 && (
                    <ul className="text-xs text-gray-600 space-y-1">
                      {complianceResult.korea.issues.slice(0, 3).map((issue: any, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className={issue.severity === 'error' ? 'text-red-500' : 'text-yellow-500'}>
                            {issue.severity === 'error' ? '●' : '▲'}
                          </span>
                          <span>{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button onClick={() => step > 0 ? setStep(step - 1) : null} className="btn-secondary">
              이전
            </button>
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2">
              🖨️ 인쇄하기
            </button>
            <button onClick={handleSave} disabled={loading}
              className="btn-primary flex items-center gap-2">
              {loading ? '저장 중...' : '💾 저장하기'}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
