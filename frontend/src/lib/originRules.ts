/**
 * 한국 원산지 표시 규정
 * 근거: 「농수산물의 원산지 표시 등에 관한 법률」 시행령 [별표1]
 *       「원산지 표시요령」 (농림축산식품부 고시)
 *
 * 가공식품에서 원산지 표시가 의무인 원재료:
 * 1. 육류: 쇠고기, 돼지고기, 닭고기, 오리고기, 양고기, 염소고기
 * 2. 쌀 (현미, 찹쌀 포함)
 * 3. 배추김치의 원료: 배추, 고춧가루, 무 (김치류 제조 시)
 * 4. 수산물: 주요 수산 원재료
 * 5. 특정 농산물: 배합비율 상위 또는 제품명에 포함된 농수산물
 *
 * 원산지 표시가 불필요한 경우:
 * - 식품첨가물, 가공보조제
 * - 배합비율 매우 낮은 부재료 (향신료 등, 단 고춧가루/마늘 등 특정 품목 제외)
 * - 정제수, 정제염 등 원산지 구분이 무의미한 원재료
 */

export interface OriginRequirement {
  ingredientName: string;
  required: boolean;
  reason: string;
  category: 'meat' | 'rice' | 'seafood' | 'agricultural' | 'kimchi_ingredient' | 'additive' | 'water_salt' | 'general';
  regulation: string;
}

// 항상 원산지 표기가 필요한 육류
const MEAT_KEYWORDS = [
  '쇠고기', '소고기', '한우', '육우', '수입우', '소', '우육',
  '돼지고기', '돈육', '돼지', '삼겹살', '목살', '앞다리살',
  '닭고기', '닭', '계육', '닭가슴살', '닭다리',
  '오리고기', '오리', '오리육',
  '양고기', '양', '램',
  '염소고기', '염소', '흑염소',
];

// 쌀 관련 (항상 원산지 필요)
const RICE_KEYWORDS = [
  '쌀', '현미', '찹쌀', '멥쌀', '흑미', '잡곡', '보리쌀',
  '미분', '쌀가루', '현미가루',
];

// 주요 수산물 (원산지 필요)
const SEAFOOD_KEYWORDS = [
  '새우', '게', '꽃게', '대게', '오징어', '낙지', '문어', '주꾸미',
  '멸치', '고등어', '갈치', '참치', '연어', '광어', '우럭', '도미',
  '조기', '삼치', '꽁치', '명태', '대구', '아귀',
  '김', '미역', '다시마', '해초',
  '굴', '전복', '홍합', '바지락', '조개', '소라', '꼬막',
  '어묵', '맛살', '생선',
];

// 김치류 제조 시 원산지 필요한 원재료
const KIMCHI_INGREDIENT_KEYWORDS = [
  '배추', '고춧가루', '고추가루', '무',
];

// 주요 농산물 (배합비 상위이거나 제품명에 포함 시 원산지 필요)
const AGRICULTURAL_KEYWORDS = [
  '고추', '마늘', '양파', '대파', '파', '생강',
  '참깨', '참기름', '들깨', '들기름',
  '후추', '고추냉이',
  '콩', '대두', '서리태', '검정콩', '흰콩', '팥', '녹두', '강낭콩',
  '감자', '고구마', '옥수수',
  '사과', '배', '딸기', '포도', '감', '귤', '오렌지', '레몬',
  '밀가루', '밀',
  '깻잎', '부추', '시금치', '당근', '셀러리', '브로콜리', '양배추',
  '버섯', '표고버섯', '느타리버섯', '팽이버섯', '새송이버섯',
  '인삼', '홍삼',
  '잣', '호두', '아몬드', '땅콩', '캐슈넛',
];

// 원산지 표기 불필요: 식품첨가물/가공보조제
const ADDITIVE_KEYWORDS = [
  '정제수', '물', '얼음',
  '정제염', '천일염', '소금',
  '설탕', '백설탕', '흑설탕', '원당',
  '물엿', '올리고당', '포도당', '과당', '액상과당', '이성화당',
  '간장', '된장', '고추장', '식초', '맛술', '미림', '료리술',
  '전분', '옥수수전분', '타피오카전분', '감자전분', '변성전분',
  '유화제', '증점제', '산도조절제', '보존료', '착색료', '향료',
  '팽창제', '응고제', '소포제', '피막제', '광택제',
  'L-글루탐산나트륨', '구연산', '주석산', '젖산', '아스코르빈산',
  '카라기난', '잔탄검', '구아검', '젤라틴', '펙틴', '한천',
  '레시틴', '자당지방산에스테르', '글리세린지방산에스테르',
  '탄산수소나트륨', '탄산칼슘', '산화칼슘',
  '식용색소', '카라멜색소', '이산화티타늄',
  '비타민', '비타민C', '비타민E', '비타민A', '비타민D',
  '아질산나트륨', '소르빈산칼륨', '안식향산나트륨',
  '혼합제제', '복합조미식품', '조미료',
];

function normalizeIngredient(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

function matchesKeywords(name: string, keywords: string[]): boolean {
  const normalized = normalizeIngredient(name);
  return keywords.some(kw => {
    const nkw = normalizeIngredient(kw);
    return normalized.includes(nkw) || nkw.includes(normalized);
  });
}

/**
 * 개별 원재료의 원산지 표기 필요 여부 판단
 * @param ingredientName 원재료명
 * @param ratio 배합비율 (%)
 * @param productType 제품 식품유형 (김치류 등 판별용)
 * @param productName 제품명 (제품명에 포함된 원재료는 원산지 필수)
 */
export function checkOriginRequired(
  ingredientName: string,
  ratio: number = 0,
  productType: string = '',
  productName: string = '',
): OriginRequirement {
  const name = ingredientName.trim();

  // 1. 식품첨가물/가공보조제 → 불필요
  if (matchesKeywords(name, ADDITIVE_KEYWORDS)) {
    return {
      ingredientName: name,
      required: false,
      reason: '식품첨가물/가공보조제는 원산지 표시 대상이 아닙니다.',
      category: 'additive',
      regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1',
    };
  }

  // 2. 육류 → 항상 필요
  if (matchesKeywords(name, MEAT_KEYWORDS)) {
    return {
      ingredientName: name,
      required: true,
      reason: '육류(쇠고기, 돼지고기, 닭고기, 오리고기 등)는 원산지 표시 의무 대상입니다.',
      category: 'meat',
      regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1 제2호',
    };
  }

  // 3. 쌀 → 항상 필요
  if (matchesKeywords(name, RICE_KEYWORDS)) {
    return {
      ingredientName: name,
      required: true,
      reason: '쌀 및 쌀 가공품의 원료인 쌀은 원산지 표시 의무 대상입니다.',
      category: 'rice',
      regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1 제3호',
    };
  }

  // 4. 수산물 → 배합비 상위 또는 제품명 포함 시 필요
  if (matchesKeywords(name, SEAFOOD_KEYWORDS)) {
    const inProductName = normalizeIngredient(productName).includes(normalizeIngredient(name));
    if (ratio >= 5 || inProductName) {
      return {
        ingredientName: name,
        required: true,
        reason: inProductName
          ? `제품명에 포함된 수산물(${name})은 원산지 표시 의무 대상입니다.`
          : `배합비율 ${ratio}%의 수산물(${name})은 원산지 표시 의무 대상입니다.`,
        category: 'seafood',
        regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1',
      };
    }
    return {
      ingredientName: name,
      required: false,
      reason: `배합비율이 낮은 수산물 부재료(${ratio}%)로 원산지 표시 의무 대상이 아닙니다.`,
      category: 'seafood',
      regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1',
    };
  }

  // 5. 김치류 원재료 (제품이 김치류인 경우)
  const isKimchi = normalizeIngredient(productType).includes('김치') || normalizeIngredient(productName).includes('김치');
  if (isKimchi && matchesKeywords(name, KIMCHI_INGREDIENT_KEYWORDS)) {
    return {
      ingredientName: name,
      required: true,
      reason: `김치류 제품의 주요 원재료(${name})는 원산지 표시 의무 대상입니다.`,
      category: 'kimchi_ingredient',
      regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1 제1호',
    };
  }

  // 6. 주요 농산물 → 배합비 상위 또는 제품명 포함 시 필요
  if (matchesKeywords(name, AGRICULTURAL_KEYWORDS)) {
    const inProductName = normalizeIngredient(productName).includes(normalizeIngredient(name));
    if (ratio >= 5 || inProductName) {
      return {
        ingredientName: name,
        required: true,
        reason: inProductName
          ? `제품명에 포함된 농산물(${name})은 원산지 표시 의무 대상입니다.`
          : `배합비율 ${ratio}%의 주요 농산물(${name})은 원산지 표시 의무 대상입니다.`,
        category: 'agricultural',
        regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1',
      };
    }
    return {
      ingredientName: name,
      required: false,
      reason: `배합비율이 낮은 농산물 부재료(${ratio}%)로 원산지 표시 의무 대상이 아닙니다.`,
      category: 'agricultural',
      regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1',
    };
  }

  // 7. 기타 - 배합비 상위 2개 농수산물은 원산지 필요할 수 있음
  // 일반적으로 식품첨가물이 아닌 미분류 원재료는 배합비 기준으로 판단
  if (ratio >= 50) {
    return {
      ingredientName: name,
      required: true,
      reason: `배합비율 ${ratio}%로 주원료에 해당하여 원산지 표시가 권장됩니다.`,
      category: 'general',
      regulation: '농수산물의 원산지 표시 등에 관한 법률 시행령 별표1',
    };
  }

  return {
    ingredientName: name,
    required: false,
    reason: '원산지 표시 의무 대상에 해당하지 않습니다.',
    category: 'general',
    regulation: '농수산물의 원산지 표시 등에 관한 법률',
  };
}

/**
 * 전체 원재료 목록에 대한 원산지 표기 분석
 */
export function analyzeOriginRequirements(
  ingredients: Array<{ name: string; ratio: string | number; origin?: string }>,
  productType: string = '',
  productName: string = '',
): OriginRequirement[] {
  return ingredients.map(ing =>
    checkOriginRequired(
      ing.name,
      typeof ing.ratio === 'string' ? parseFloat(ing.ratio) || 0 : ing.ratio,
      productType,
      productName,
    )
  );
}

/**
 * 원산지 표기가 필요한 원재료만 필터
 */
export function getRequiredOriginIngredients(results: OriginRequirement[]): OriginRequirement[] {
  return results.filter(r => r.required);
}

/**
 * 원산지 표기가 불필요한 원재료 필터
 */
export function getExemptOriginIngredients(results: OriginRequirement[]): OriginRequirement[] {
  return results.filter(r => !r.required);
}

/**
 * 원재료명 + 원산지 텍스트 생성 (규정에 맞는 것만 원산지 표기)
 */
export function buildIngredientTextWithOrigin(
  ingredients: Array<{ name: string; ratio: string | number; origin?: string }>,
  productType: string = '',
  productName: string = '',
): string {
  const analysis = analyzeOriginRequirements(ingredients, productType, productName);
  const sorted = [...ingredients].sort(
    (a, b) => (parseFloat(String(b.ratio)) || 0) - (parseFloat(String(a.ratio)) || 0)
  );

  return sorted.map(ing => {
    const req = analysis.find(r => r.ingredientName === ing.name.trim());
    let text = ing.name;
    if (req?.required && ing.origin) {
      text += `(${ing.origin})`;
    }
    return text;
  }).join(', ');
}
