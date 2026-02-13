export interface HealthClaim {
  id: string;
  name: string;
  eligible: boolean;
  reason: string;
  standard: string;
  category: 'positive' | 'negative';
}

interface NutritionInput {
  calories?: number | null;
  carbohydrates?: number | null;
  sugars?: number | null;
  dietaryFiber?: number | null;
  protein?: number | null;
  totalFat?: number | null;
  saturatedFat?: number | null;
  transFat?: number | null;
  cholesterol?: number | null;
  sodium?: number | null;
}

/**
 * 한국 식약처 기준 강조 표기사항 분석
 * 기준: 식품등의 표시·광고에 관한 법률 시행규칙 [별표 5]
 * 고형식품 100g당 기준 적용
 */
export function analyzeHealthClaims(
  nutrition: NutritionInput,
  servingSize: number | null,
): HealthClaim[] {
  const ss = servingSize || 100;
  const factor = 100 / ss;

  const per100 = {
    calories: (nutrition.calories || 0) * factor,
    protein: (nutrition.protein || 0) * factor,
    sugars: (nutrition.sugars || 0) * factor,
    totalFat: (nutrition.totalFat || 0) * factor,
    saturatedFat: (nutrition.saturatedFat || 0) * factor,
    transFat: (nutrition.transFat || 0) * factor,
    cholesterol: (nutrition.cholesterol || 0) * factor,
    sodium: (nutrition.sodium || 0) * factor,
    dietaryFiber: (nutrition.dietaryFiber || 0) * factor,
  };

  // 1일 기준치 대비 %
  const proteinDVPct = ((nutrition.protein || 0) / 55) * 100;
  const fiberDVPct = ((nutrition.dietaryFiber || 0) / 25) * 100;

  const claims: HealthClaim[] = [];

  // 고단백
  claims.push({
    id: 'high-protein',
    name: '고단백',
    eligible: per100.protein >= 10 || proteinDVPct >= 20,
    reason: per100.protein >= 10
      ? `100g당 단백질 ${per100.protein.toFixed(1)}g (기준: 10g 이상)`
      : proteinDVPct >= 20
        ? `1회 제공량당 1일 기준치의 ${proteinDVPct.toFixed(0)}% (기준: 20% 이상)`
        : `100g당 단백질 ${per100.protein.toFixed(1)}g (기준: 10g 이상 미달)`,
    standard: '100g당 단백질 10g 이상 또는 1일 기준치의 20% 이상',
    category: 'positive',
  });

  // 단백질 급원
  claims.push({
    id: 'protein-source',
    name: '단백질 급원',
    eligible: per100.protein >= 5 || proteinDVPct >= 10,
    reason: per100.protein >= 5
      ? `100g당 단백질 ${per100.protein.toFixed(1)}g (기준: 5g 이상)`
      : proteinDVPct >= 10
        ? `1회 제공량당 1일 기준치의 ${proteinDVPct.toFixed(0)}% (기준: 10% 이상)`
        : `100g당 단백질 ${per100.protein.toFixed(1)}g (기준: 5g 이상 미달)`,
    standard: '100g당 단백질 5g 이상 또는 1일 기준치의 10% 이상',
    category: 'positive',
  });

  // 저당
  claims.push({
    id: 'low-sugar',
    name: '저당',
    eligible: per100.sugars <= 5,
    reason: `100g당 당류 ${per100.sugars.toFixed(1)}g (기준: 5g 이하)`,
    standard: '100g당 당류 5g 이하',
    category: 'negative',
  });

  // 무당류
  claims.push({
    id: 'sugar-free',
    name: '무당류',
    eligible: per100.sugars < 0.5,
    reason: `100g당 당류 ${per100.sugars.toFixed(1)}g (기준: 0.5g 미만)`,
    standard: '100g당 당류 0.5g 미만',
    category: 'negative',
  });

  // 저지방
  claims.push({
    id: 'low-fat',
    name: '저지방',
    eligible: per100.totalFat <= 3,
    reason: `100g당 지방 ${per100.totalFat.toFixed(1)}g (기준: 3g 이하)`,
    standard: '100g당 지방 3g 이하',
    category: 'negative',
  });

  // 저포화지방
  const satFatCalPct = per100.calories > 0 ? ((per100.saturatedFat * 9) / per100.calories) * 100 : 0;
  claims.push({
    id: 'low-saturated-fat',
    name: '저포화지방',
    eligible: per100.saturatedFat <= 1.5 && satFatCalPct <= 10,
    reason: `100g당 포화지방 ${per100.saturatedFat.toFixed(1)}g, 열량 대비 ${satFatCalPct.toFixed(1)}% (기준: 1.5g 이하 & 열량의 10% 이하)`,
    standard: '100g당 포화지방 1.5g 이하 & 열량의 10% 이하',
    category: 'negative',
  });

  // 트랜스지방 무함유
  claims.push({
    id: 'trans-fat-free',
    name: '트랜스지방 무함유',
    eligible: per100.transFat < 0.2,
    reason: `100g당 트랜스지방 ${per100.transFat.toFixed(1)}g (기준: 0.2g 미만)`,
    standard: '100g당 트랜스지방 0.2g 미만',
    category: 'negative',
  });

  // 저콜레스테롤
  claims.push({
    id: 'low-cholesterol',
    name: '저콜레스테롤',
    eligible: per100.cholesterol <= 20 && per100.saturatedFat <= 1.5,
    reason: `100g당 콜레스테롤 ${per100.cholesterol.toFixed(1)}mg, 포화지방 ${per100.saturatedFat.toFixed(1)}g (기준: 20mg 이하 & 포화지방 1.5g 이하)`,
    standard: '100g당 콜레스테롤 20mg 이하 & 포화지방 1.5g 이하',
    category: 'negative',
  });

  // 콜레스테롤 무함유
  claims.push({
    id: 'cholesterol-free',
    name: '콜레스테롤 무함유',
    eligible: per100.cholesterol < 5 && per100.saturatedFat <= 1.5,
    reason: `100g당 콜레스테롤 ${per100.cholesterol.toFixed(1)}mg (기준: 5mg 미만)`,
    standard: '100g당 콜레스테롤 5mg 미만 & 포화지방 1.5g 이하',
    category: 'negative',
  });

  // 저나트륨
  claims.push({
    id: 'low-sodium',
    name: '저나트륨',
    eligible: per100.sodium <= 120,
    reason: `100g당 나트륨 ${per100.sodium.toFixed(0)}mg (기준: 120mg 이하)`,
    standard: '100g당 나트륨 120mg 이하',
    category: 'negative',
  });

  // 저칼로리
  claims.push({
    id: 'low-calorie',
    name: '저칼로리',
    eligible: per100.calories <= 40,
    reason: `100g당 열량 ${per100.calories.toFixed(0)}kcal (기준: 40kcal 이하)`,
    standard: '100g당 열량 40kcal 이하',
    category: 'negative',
  });

  // 고식이섬유
  claims.push({
    id: 'high-fiber',
    name: '고식이섬유',
    eligible: per100.dietaryFiber >= 6 || fiberDVPct >= 20,
    reason: per100.dietaryFiber >= 6
      ? `100g당 식이섬유 ${per100.dietaryFiber.toFixed(1)}g (기준: 6g 이상)`
      : fiberDVPct >= 20
        ? `1회 제공량당 1일 기준치의 ${fiberDVPct.toFixed(0)}% (기준: 20% 이상)`
        : `100g당 식이섬유 ${per100.dietaryFiber.toFixed(1)}g (기준: 6g 이상 미달)`,
    standard: '100g당 식이섬유 6g 이상 또는 1일 기준치의 20% 이상',
    category: 'positive',
  });

  // 식이섬유 급원
  claims.push({
    id: 'fiber-source',
    name: '식이섬유 급원',
    eligible: per100.dietaryFiber >= 3 || fiberDVPct >= 10,
    reason: per100.dietaryFiber >= 3
      ? `100g당 식이섬유 ${per100.dietaryFiber.toFixed(1)}g (기준: 3g 이상)`
      : fiberDVPct >= 10
        ? `1회 제공량당 1일 기준치의 ${fiberDVPct.toFixed(0)}% (기준: 10% 이상)`
        : `100g당 식이섬유 ${per100.dietaryFiber.toFixed(1)}g (기준: 3g 이상 미달)`,
    standard: '100g당 식이섬유 3g 이상 또는 1일 기준치의 10% 이상',
    category: 'positive',
  });

  return claims;
}

export function getEligibleClaims(claims: HealthClaim[]): HealthClaim[] {
  return claims.filter(c => c.eligible);
}

export function getClaimBadgeColor(claim: HealthClaim): string {
  if (!claim.eligible) return 'bg-gray-100 text-gray-500';
  if (claim.category === 'positive') return 'bg-green-100 text-green-700';
  return 'bg-blue-100 text-blue-700';
}
