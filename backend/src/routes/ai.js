const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const storage = require('../lib/storage');
// JSON 문자열 값 안에 escape 안 된 큰따옴표를 자동으로 escape 처리
// 예: "shelfLife": "제품에 "DDM" 표기" → "shelfLife": "제품에 \"DDM\" 표기"
//
// 휴리스틱: state machine으로 "key": "value" 패턴을 추적하면서
// value 내부에 나타나는 따옴표 중 " ,\n" 또는 " }" 또는 " ]" 직전이 아닌 것을 escape
function escapeUnescapedQuotesInValues(text) {
  let result = '';
  let i = 0;
  let inString = false;
  let isKey = true; // colon이 나오기 전이면 key, 아니면 value

  while (i < text.length) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';

    if (!inString) {
      if (ch === '"') {
        inString = true;
        result += ch;
      } else {
        if (ch === ':') isKey = false;
        else if (ch === ',' || ch === '{' || ch === '[') isKey = true;
        result += ch;
      }
    } else {
      // string 안
      if (ch === '\\') {
        // escape sequence: 다음 문자 그대로
        result += ch + (text[i + 1] || '');
        i += 2;
        continue;
      }
      if (ch === '"') {
        // string 종료 후보 - 다음 non-whitespace가 [,}\]:] 이면 진짜 종료
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        const next = text[j];
        const isRealEnd = !next || next === ',' || next === '}' || next === ']' || next === ':';
        if (isRealEnd) {
          inString = false;
          if (next === ':') isKey = false;
          result += ch;
        } else {
          // value 안의 escape 안 된 quote → escape 추가
          if (!isKey) {
            result += '\\"';
          } else {
            // key 안에 따옴표가 있으면 그냥 종료 (이상한 케이스)
            inString = false;
            result += ch;
          }
        }
      } else {
        result += ch;
      }
    }
    i++;
  }
  return result;
}

// AI 응답에서 JSON을 robust하게 파싱 (다중 fallback)
function safeParseJson(text) {
  if (!text) return null;
  // Strategy 1: 직접 파싱
  try { return JSON.parse(text); } catch {}

  // Strategy 2: ```json ... ``` 코드블록 안에서 추출
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]); } catch {}
  }

  // Strategy 3: 첫 { 부터 마지막 } 까지 추출
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(candidate); } catch {}

    // Strategy 4: trailing comma + smart quotes 정리 후 재시도
    const cleaned = candidate
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    try { return JSON.parse(cleaned); } catch {}

    // Strategy 5: value 내부에 escape 안 된 큰따옴표 자동 처리
    try { return JSON.parse(escapeUnescapedQuotesInValues(candidate)); } catch {}
    try { return JSON.parse(escapeUnescapedQuotesInValues(cleaned)); } catch {}
  }

  return null;
}

// 네이티브 모듈은 lazy + try-catch로 로드: 빌드/플랫폼 문제로 누락되어도 서버는 시작
let pdfToImages = null;
let prepareImageTiles = null;
try {
  ({ pdfToImages } = require('../lib/pdfToImages'));
} catch (e) {
  console.error('[AI] pdfToImages 로드 실패 (PDF→PNG 비활성):', e.message);
}
try {
  ({ prepareImageTiles } = require('../lib/imageSplit'));
} catch (e) {
  console.error('[AI] prepareImageTiles 로드 실패 (이미지 분할 비활성):', e.message);
}

const router = express.Router();
const prisma = new PrismaClient();

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// 모델: 검토(추출/비교) 작업은 Opus 4.7 (최고 정확도), 일반 보조는 Sonnet
const REVIEW_MODEL = 'claude-opus-4-7';
const ASSIST_MODEL = 'claude-sonnet-4-5-20250929';

const KOREAN_ALLERGENS = [
  '난류(가금류)', '우유', '메밀', '땅콩', '대두', '밀', '고등어', '게',
  '새우', '돼지고기', '복숭아', '토마토', '아황산류', '호두', '닭고기',
  '쇠고기', '오징어', '조개류(굴,전복,홍합)', '잣', '아몬드',
];

const FDA_ALLERGENS = [
  'Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree nuts', 'Peanuts', 'Wheat', 'Soybeans', 'Sesame',
];

const JAPAN_ALLERGENS_MANDATORY = ['えび', 'かに', '小麦', 'そば', '卵', '乳', '落花生', 'くるみ'];

// ─── 한국 식품 표시기준 전문 규칙이 포함된 AI 프롬프트 ───
const GENERATE_PROMPT = `당신은 한국 「식품등의 표시기준」(식약처 고시) 전문가이며, 미국(FDA), 일본(CAA) 규정도 숙지하고 있습니다.

# 핵심 임무
사용자가 제공하는 배합비와 원재료 정보를 바탕으로:
1. 한국 식품 표시기준에 정확히 맞는 "원재료명" 표기 문구를 생성합니다
2. 각 규칙이 어떻게 적용되었는지 상세히 설명합니다
3. 정보가 부족하거나 규칙 위반 가능성이 있으면 경고합니다

중요: 반드시 유효한 JSON만 응답하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요.

# 한국 식품 표시기준 - 원재료명 표시 규칙 (「식품등의 표시기준」 별지1 제1호 바.)

## 규칙1: 기본 원칙 - 중량 기준 내림차순 나열
- 모든 원재료명을 많이 사용한 순서(중량 기준 내림차순)로 표시
- 중량 비율이 2% 미만인 원재료는 순서에 관계없이 표시 가능 (맨 뒤에 몰아도 됨)
- 최종 제품에 남지 않는 정제수(물)는 표시 제외. 단, 최종제품에 남는 물은 포함

## 규칙2: 복합원재료 표시
"복합원재료": 2종류 이상의 원재료로 제조·가공하여 다른 식품의 원료로 사용되는 것
- 완제품 중량 대비 5% 이상: 복합원재료 명칭 + 괄호 안에 물을 제외하고 많이 사용한 순서로 5가지 이상 원재료명 표시
- 완제품 중량 대비 5% 미만: 복합원재료 명칭(또는 식품유형)만 표시 → 내부 성분 전부 생략 가능
- 5% 이상이어도 상위 5가지 이상만 표시하면 되고, 6순위 이하는 생략 가능

## 규칙3: 중첩 복합원재료
복합원재료 안에 또 복합원재료가 있는 경우:
→ 내부 복합원재료는 명칭만 표시 가능 (성분 전개 불필요)
예: 초콜릿케이크 → 초콜릿크림[설탕, 코코아파우더, 초콜릿, 레시틴] (초콜릿은 명칭만)

## 규칙4: 식품첨가물 표시
- 직접 사용한 첨가물은 공식 명칭 또는 간략명으로 표시
- 용도명 병기 의무 첨가물: 합성보존료, 합성감미료, 합성착색료, 발색제, 산화방지제, 표백제
  → 예: 소르빈산칼륨(합성보존료), 삭카린나트륨(합성감미료)
- 천연향료 → "천연향료", 합성향료 → "합성향료"로 통일 표시 (향 종류 추가 표시는 가능하나 의무 아님)

## 규칙5: 캐리오버(이행) 예외
복합원재료 안 첨가물이 완제품에서 효과를 발휘하지 않는 경우 → 표시 생략 가능
단, 알레르기 유발물질을 포함하는 첨가물은 캐리오버여도 알레르기 표시 의무 유지

## 규칙6: 알레르기 유발물질 (19종 + 아몬드)
대상: 난류(가금류), 우유, 메밀, 땅콩, 대두, 밀, 고등어, 게, 새우, 돼지고기, 복숭아, 토마토, 아황산류, 호두, 닭고기, 쇠고기, 오징어, 조개류(굴·전복·홍합), 잣
- 아황산류: 최종제품에 SO₂로 10mg/kg 이상 함유 시에만 표시
- ★ 핵심: 알레르기 유발물질은 어떤 예외도 뚫고 반드시 표시
  - 복합원재료 5% 미만 → 성분 생략해도 알레르기는 표시
  - 중첩 복합원재료 → 명칭만 표시해도 알레르기는 표시
  - 캐리오버 첨가물 → 생략해도 알레르기는 표시
- 원재료명 표시란 근처에 별도 알레르기 표시란 마련
- 단일 원재료 제품명이 알레르기 물질명과 동일하면 생략 가능 (예: "땅콩" 제품에 "땅콩 함유" 불필요)

## 규칙7: 함량(%) 표시 의무
- 제품명에 원재료명을 사용한 경우 → 해당 원재료 함량 의무 표시
  예: "블루베리 잼 쿠키" → 블루베리 잼 몇% 표시
- 주표시면에 원재료명을 강조 표시한 경우
- 원재료가 추출물 또는 농축액인 경우 → 원재료 함량 + 고형분 함량을 백분율로 병기

## 규칙8: 원산지 표시
- 육류(쇠고기, 돼지고기, 닭고기, 오리고기 등): 항상 필수
- 쌀(현미, 찹쌀 포함): 항상 필수
- 김치류: 배추, 고춧가루, 무 필수
- 수산물: 배합비 상위 또는 제품명에 포함 시 필수
- 주요 농산물(콩, 감자, 마늘, 양파 등): 배합비 5% 이상 또는 제품명에 포함 시 필수
- 식품첨가물, 정제수, 설탕 등: 원산지 표시 불필요
- 원산지 필요한 원재료만 "원재료명(원산지)" 형태로 표기

# 응답 JSON 형식

{
  "ingredientLabelText": {
    "korea": "한국 표시기준에 맞게 완성된 원재료명 표기 문구 (실제 라벨에 인쇄할 텍스트)",
    "us": "US ingredients list (FDA format)",
    "japan": "日本語原材料名表示"
  },
  "ruleApplicationReport": [
    {
      "ruleId": "규칙1~8 중 해당",
      "ruleName": "규칙 이름",
      "applied": true,
      "details": "이 제품에서 해당 규칙이 어떻게 적용되었는지 구체적 설명",
      "affectedIngredients": ["해당 원재료명"]
    }
  ],
  "warnings": [
    {
      "severity": "error | warning | info",
      "message": "경고 메시지",
      "suggestion": "해결 방안"
    }
  ],
  "nutritionInfo": {
    "calories": number,
    "carbohydrates": number,
    "sugars": number,
    "dietaryFiber": number,
    "protein": number,
    "totalFat": number,
    "saturatedFat": number,
    "transFat": number,
    "cholesterol": number,
    "sodium": number,
    "vitaminA": number | null,
    "vitaminC": number | null,
    "calcium": number | null,
    "iron": number | null,
    "addedSugars": number | null,
    "potassium": number | null,
    "vitaminD": number | null
  },
  "allergens": {
    "korea": ["한국 알레르기 유발물질 - 복합원재료/캐리오버 포함 전수 검토"],
    "us": ["US allergens"],
    "japan": ["日本アレルゲン"],
    "crossContamination": ["혼입 가능 알레르기 유발물질 (같은 시설 사용 등)"]
  },
  "crossContaminationStatement": "이 제품은 OO, OO을(를) 사용한 제품과 같은 제조시설에서 제조하고 있습니다.",
  "storageInstructions": {
    "korea": "한국어 보관방법 (사용자 입력 반영 또는 AI 추천)",
    "us": "English storage instructions",
    "japan": "日本語保存方法"
  },
  "shelfLifeRecommendation": "소비기한 관련 AI 추천 또는 안내 (미입력 시)",
  "precautions": {
    "korea": ["주의사항1", "주의사항2"],
    "us": ["Precaution 1"],
    "japan": ["注意事項1"]
  },
  "originAnalysis": [
    {
      "ingredientName": "원재료명",
      "required": true/false,
      "reason": "원산지 표기 필요/불필요 사유",
      "category": "meat|rice|seafood|agricultural|kimchi_ingredient|additive|water_salt|general"
    }
  ],
  "regulatoryText": {
    "korea": {
      "foodType": "식품유형",
      "manufacturer": "제조원 표시 예시",
      "shelfLife": "유통기한/소비기한 권장",
      "ingredientsList": "원재료명 표기 (규칙 적용 완료본)",
      "requiredStatements": ["필수 표시사항"],
      "originNote": "원산지 표기 관련 참고사항"
    },
    "us": {
      "foodType": "Food category",
      "ingredientsList": "Ingredients listing (FDA format)",
      "allergenStatement": "Contains: ...",
      "requiredStatements": ["Required FDA statements"]
    },
    "japan": {
      "foodType": "食品分類",
      "ingredientsList": "原材料名表示",
      "allergenStatement": "アレルゲン表示",
      "requiredStatements": ["必要な表示事項"]
    }
  },
  "servingSizeRecommendation": {
    "korea": { "size": number, "unit": "g 또는 ml" },
    "us": { "size": number, "unit": "g or ml", "householdMeasure": "약 X개" },
    "japan": { "size": number, "unit": "g又はml" }
  }
}

# 중요 지침
- 영양성분은 1회 제공량 기준으로 계산
- ingredientLabelText.korea는 실제 라벨에 인쇄할 수 있는 완성 문구여야 함
- ruleApplicationReport에서 각 규칙이 어떻게 적용됐는지 투명하게 설명
- 복합원재료(ingredientType="compound")는 반드시 규칙2,3을 적용
- 식품첨가물(ingredientType="additive")는 반드시 규칙4를 적용
- 알레르기는 모든 원재료 + 복합원재료 내부 성분까지 전수 검토 (규칙6)
- warnings에 정보 부족, 규칙 위반 가능성, 추가 확인 필요 사항을 반드시 명시
- 제품명에 특정 원재료명이 포함되면 함량% 표시 필요 여부를 warnings에 포함`;

const COMPLIANCE_PROMPT = `당신은 한국(식약처/MFDS), 미국(FDA), 일본(소비자청/CAA)의 식품 표시 규정 전문가입니다.
주어진 라벨 정보를 각 국가의 규정에 맞는지 검토해주세요.

중요: 반드시 유효한 JSON만 응답하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요.

한국 검토 시 특별히 확인할 사항:
1. 원재료명 중량 기준 내림차순 정렬 여부 (2% 미만 제외)
2. 복합원재료 5% 이상이면 상위 5개 이상 성분 전개 여부
3. 복합원재료 5% 미만이면 명칭만 표시 가능
4. 중첩 복합원재료는 명칭만 표시 가능
5. 식품첨가물 공식 명칭 사용 여부
6. 용도명 병기 의무 첨가물 (보존료, 감미료, 착색료 등) 확인
7. 알레르기 19종 전수 검토 - 복합원재료 내부, 캐리오버 포함
8. 함량% 표시 의무 여부 (제품명에 원재료명 사용 시)
9. 원산지 표기 의무 대상 확인
10. 캐리오버 예외 적절성

응답 JSON 형식:
{
  "korea": {
    "passed": boolean,
    "score": number (0-100),
    "issues": [
      { "severity": "error" | "warning", "category": "카테고리", "message": "설명", "regulation": "관련 법규" }
    ],
    "recommendations": ["개선 권장사항"]
  },
  "us": {
    "passed": boolean,
    "score": number (0-100),
    "issues": [
      { "severity": "error" | "warning", "category": "Category", "message": "Description", "regulation": "CFR reference" }
    ],
    "recommendations": ["Recommendations"]
  },
  "japan": {
    "passed": boolean,
    "score": number (0-100),
    "issues": [
      { "severity": "error" | "warning", "category": "カテゴリ", "message": "説明", "regulation": "関連法規" }
    ],
    "recommendations": ["改善推奨事項"]
  }
}

검토 기준:
한국: 식품등의 표시·광고에 관한 법률, 식품등의 표시기준 (식약처 고시)
미국: 21 CFR Part 101 (Nutrition Labeling), FALCPA, FSMA
일본: 食品表示法, 食品表示基準 (내각부령)

주요 검토 항목:
1. 필수 표시사항 누락 여부
2. 영양성분 표시 적정성
3. 알레르기 유발물질 표시
4. 원재료명 표시 순서 및 형식
5. 1회 제공량 기준 적정성
6. 글자 크기 및 표시 위치 규정
7. 건강 관련 표시 규정 준수`;

// AI 라벨 생성
router.post('/generate-label', authenticate, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res.status(400).json({
        error: 'AI 기능을 사용하려면 ANTHROPIC_API_KEY 환경변수를 설정해주세요.',
      });
    }

    const { productName, productType, ingredients, servingSize, servingUnit, totalContent, totalUnit, targetMarkets, shelfLife, storageMethod, crossContaminationAllergens } = req.body;

    if (!productName || !ingredients?.length) {
      return res.status(400).json({ error: '제품명과 원재료 정보를 입력해주세요.' });
    }

    // 원재료 정보를 상세하게 전달 (복합원재료, 첨가물 구분 포함)
    const ingredientsList = ingredients
      .map((ing) => {
        let desc = `${ing.name} ${ing.ratio}%`;
        if (ing.origin) desc += ` (원산지: ${ing.origin})`;
        if (ing.ingredientType === 'compound') {
          desc += ` [복합원재료`;
          if (ing.subIngredients && ing.subIngredients.length > 0) {
            const subs = ing.subIngredients.map(s => s.name).join(', ');
            desc += `: ${subs}`;
          }
          desc += `]`;
        } else if (ing.ingredientType === 'additive') {
          desc += ` [식품첨가물`;
          if (ing.additivePurpose) desc += `: ${ing.additivePurpose}`;
          desc += `]`;
        }
        if (ing.allergen && ing.allergenInfo) {
          desc += ` {알레르기: ${ing.allergenInfo}}`;
        }
        return desc;
      })
      .join('\n  ');

    const userMessage = `제품 정보:
- 제품명: ${productName}
- 식품유형: ${productType || '일반가공식품'}
- 원재료 및 배합비:
  ${ingredientsList}
- 1회 제공량: ${servingSize || '미정'}${servingUnit || 'g'}
- 총 내용량: ${totalContent || '미정'}${totalUnit || 'g'}
- 대상 시장: ${(targetMarkets || ['korea']).join(', ')}
- 소비기한(기준 소비기한): ${shelfLife || '미입력'}
- 보관방법: ${storageMethod || '미입력'}
- 혼입 가능 알레르기 유발물질: ${crossContaminationAllergens || '없음'}

위 정보를 바탕으로 한국 식품 표시기준에 맞는 완전한 식품 라벨 정보를 생성해주세요.
복합원재료와 식품첨가물은 해당 규칙을 반드시 적용하고, ruleApplicationReport에 각 규칙 적용 내역을 상세히 기록해주세요.
보관방법이 미입력이면 원재료와 식품유형을 바탕으로 적절한 보관방법을 추천해주세요 (storageInstructions에 반영).
소비기한이 미입력이면 일반적인 소비기한 권장 범위를 warnings에 info로 안내해주세요.
혼입 가능 알레르기 유발물질이 있으면 allergens 정보에 반영하고, 라벨 표기 문구에 "이 제품은 OO을(를) 사용한 제품과 같은 제조시설에서 제조하고 있습니다" 형태의 혼입 주의문구를 포함해주세요.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: GENERATE_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].text;
    const result = safeParseJson(text);
    if (!result) {
      console.error(`[generate-label] JSON parse failed. Raw (처음 500자):`, text.substring(0, 500));
      return res.status(500).json({ error: 'AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.' });
    }

    res.json({ generated: result });
  } catch (error) {
    console.error('AI generate error:', error);
    res.status(500).json({ error: 'AI 라벨 생성에 실패했습니다.' });
  }
});

// 규정 준수 검토
router.post('/check-compliance', authenticate, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res.status(400).json({
        error: 'AI 기능을 사용하려면 ANTHROPIC_API_KEY 환경변수를 설정해주세요.',
      });
    }

    const { productName, productType, ingredients, nutritionInfo, allergens, servingSize, servingUnit, totalContent, totalUnit, storageInstructions, targetMarkets } = req.body;

    const userMessage = `다음 식품 라벨 정보를 검토해주세요:

제품명: ${productName}
식품유형: ${productType || '일반가공식품'}
원재료: ${JSON.stringify(ingredients)}
영양성분 (1회 제공량 기준): ${JSON.stringify(nutritionInfo)}
알레르기 유발물질: ${JSON.stringify(allergens)}
1회 제공량: ${servingSize}${servingUnit}
총 내용량: ${totalContent}${totalUnit}
보관방법: ${JSON.stringify(storageInstructions)}
대상 시장: ${(targetMarkets || ['korea', 'us', 'japan']).join(', ')}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: COMPLIANCE_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].text;
    const result = safeParseJson(text);
    if (!result) {
      console.error(`[check-compliance] JSON parse failed. Raw (처음 500자):`, text.substring(0, 500));
      return res.status(500).json({ error: 'AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.' });
    }

    res.json({ compliance: result });
  } catch (error) {
    console.error('Compliance check error:', error);
    res.status(500).json({ error: '규정 준수 검토에 실패했습니다.' });
  }
});

// ─── 원재료 링크에서 성분 추출 프롬프트 ───
const EXTRACT_FROM_LINKS_PROMPT = `당신은 한국 「식품등의 표시기준」(식약처 고시) 전문가입니다.

# 핵심 임무
사용자가 원재료 판매처/공급처 웹페이지의 텍스트 내용을 제공합니다.
각 원재료의 사용량(%)과 함께 제공됩니다.

웹페이지 텍스트에서 원재료의 성분 정보를 추출하고,
한국 식품 표시기준에 맞는 원재료 데이터를 구조화하여 반환하세요.

중요: 반드시 유효한 JSON만 응답하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요.

# 추출 규칙

1. 웹페이지에서 제품명, 원재료명 및 함량, 알레르기 정보, 식품유형 등을 찾아 추출
2. 복합원재료(2종 이상 원재료로 구성된 재료)인 경우:
   - ingredientType을 "compound"로 설정
   - subIngredients에 구성성분 목록을 기입
3. 식품첨가물인 경우:
   - ingredientType을 "additive"로 설정
   - additivePurpose에 용도 기입 (합성보존료, 합성감미료, 합성착색료, 발색제, 산화방지제, 표백제, 천연향료, 합성향료, 유화제, 증점제, 산도조절제, 팽창제, 영양강화제 등)
4. 일반 원재료는 ingredientType을 "regular"로 설정
5. 알레르기 유발물질(19종+아몬드)이 포함되어 있으면 allergen: true, allergenInfo에 해당 물질 기입
6. 원산지 정보가 있으면 origin에 기입
7. 사용자가 제공한 사용량(%)을 기반으로 최종 제품에서 각 성분의 실제 비율을 계산
   - 예: 초콜릿(사용량 30%)의 성분이 카카오매스 40%, 설탕 35%, 코코아버터 20%, 레시틴 5%인 경우
   - 최종 제품에서 카카오매스는 30% × 40% = 12%, 설탕은 30% × 35% = 10.5% 등

# 응답 JSON 형식

{
  "extractedIngredients": [
    {
      "sourceUrl": "원본 URL",
      "sourceName": "원재료 제품명 (웹페이지에서 추출)",
      "usagePercent": 30,
      "ingredients": [
        {
          "name": "원재료명",
          "ratio": "최종 제품 대비 비율(%)",
          "origin": "원산지 (있는 경우)",
          "allergen": false,
          "allergenInfo": "",
          "ingredientType": "regular | compound | additive",
          "subIngredients": [{"name": "구성성분명"}],
          "additivePurpose": "첨가물 용도"
        }
      ],
      "sourceAllergens": ["웹페이지에 표시된 알레르기 정보"],
      "notes": "추출 시 참고사항/불확실한 부분"
    }
  ],
  "mergedIngredients": [
    {
      "name": "원재료명",
      "ratio": "전체 제품 기준 비율(%)",
      "origin": "원산지",
      "allergen": false,
      "allergenInfo": "",
      "ingredientType": "regular | compound | additive",
      "subIngredients": [{"name": "구성성분명"}],
      "additivePurpose": ""
    }
  ],
  "totalAllergens": ["전체 알레르기 유발물질 목록"],
  "warnings": [
    {
      "severity": "error | warning | info",
      "message": "경고/안내 메시지",
      "suggestion": "해결 방안"
    }
  ],
  "summary": "전체 추출 결과 요약 (한국어)"
}

# 중요 지침
- mergedIngredients: 모든 링크에서 추출한 원재료를 최종 제품 기준 비율로 환산하여 통합
- 동일 원재료가 여러 링크에서 나오면 비율을 합산
- mergedIngredients는 비율 내림차순 정렬
- 비율 합계가 100%가 되지 않으면 warnings에 안내
- 웹페이지에서 성분 정보를 찾을 수 없으면 warnings에 error로 기록
- 불확실한 정보에는 warnings에 warning으로 기록`;

// HTML에서 텍스트 추출 (간단 구현)
function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// 원재료 링크에서 성분 추출
router.post('/extract-from-links', authenticate, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res.status(400).json({
        error: 'AI 기능을 사용하려면 ANTHROPIC_API_KEY 환경변수를 설정해주세요.',
      });
    }

    const { links, productName, productType } = req.body;

    if (!links || !Array.isArray(links) || links.length === 0) {
      return res.status(400).json({ error: '원재료 링크를 1개 이상 입력해주세요.' });
    }

    // 각 URL에서 페이지 내용 가져오기
    const fetchResults = await Promise.allSettled(
      links.map(async (link) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const response = await fetch(link.url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; FoodLabelBot/1.0)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            },
          });
          clearTimeout(timeout);

          if (!response.ok) {
            return { url: link.url, usagePercent: link.usagePercent, error: `HTTP ${response.status}`, text: null };
          }

          const html = await response.text();
          const text = stripHtml(html);
          // 텍스트가 너무 길면 앞부분만 사용 (토큰 절약)
          const truncated = text.length > 8000 ? text.substring(0, 8000) + '... (이하 생략)' : text;
          return { url: link.url, usagePercent: link.usagePercent, text: truncated, error: null };
        } catch (err) {
          return { url: link.url, usagePercent: link.usagePercent, error: err.message, text: null };
        }
      })
    );

    const pageContents = fetchResults.map((r) => {
      if (r.status === 'fulfilled') return r.value;
      return { url: '', usagePercent: 0, error: r.reason?.message || '알 수 없는 오류', text: null };
    });

    // AI에게 보낼 메시지 구성
    const linkDescriptions = pageContents
      .map((p, i) => {
        if (p.error && !p.text) {
          return `\n--- 원재료 ${i + 1} ---\nURL: ${p.url}\n사용량: ${p.usagePercent}%\n[오류: 페이지를 가져올 수 없음 - ${p.error}]`;
        }
        return `\n--- 원재료 ${i + 1} ---\nURL: ${p.url}\n사용량: ${p.usagePercent}%\n페이지 내용:\n${p.text}`;
      })
      .join('\n');

    const userMessage = `제품 정보:
- 제품명: ${productName || '미정'}
- 식품유형: ${productType || '일반가공식품'}

아래는 각 원재료의 판매처/공급처 웹페이지에서 추출한 텍스트입니다.
각 원재료의 성분 정보를 추출하고, 한국 식품 표시기준에 맞게 구조화해주세요.
${linkDescriptions}

위 원재료들을 분석하여:
1. 각 링크별 원재료 성분을 추출하세요 (extractedIngredients)
2. 최종 제품 기준으로 모든 원재료를 통합 정리하세요 (mergedIngredients)
3. 알레르기 유발물질을 전수 검토하세요
4. 정보 부족이나 불확실한 부분은 warnings에 기록하세요`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: EXTRACT_FROM_LINKS_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].text;
    const result = safeParseJson(text);
    if (!result) {
      console.error(`[extract-from-links] JSON parse failed. Raw (처음 500자):`, text.substring(0, 500));
      return res.status(500).json({ error: 'AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.' });
    }

    // 페이지 가져오기 실패한 링크가 있으면 warnings에 추가
    const fetchErrors = pageContents.filter((p) => p.error && !p.text);
    if (fetchErrors.length > 0) {
      if (!result.warnings) result.warnings = [];
      fetchErrors.forEach((e) => {
        result.warnings.unshift({
          severity: 'error',
          message: `"${e.url}" 페이지를 가져올 수 없습니다: ${e.error}`,
          suggestion: 'URL이 올바른지 확인하고, 접근 가능한 페이지인지 확인해주세요.',
        });
      });
    }

    res.json({ extracted: result });
  } catch (error) {
    console.error('Extract from links error:', error);
    res.status(500).json({ error: '원재료 정보 추출에 실패했습니다.' });
  }
});

// ─── 멀티 패스 AI 비교 검토 ───
// Step 1: 품목제조보고서에서 정보 추출 (보고인/영업소 명확히 분리)
// Step 2: 디자인에서 회사별 정보 추출 (제조원/판매원 역할 분리)
// Step 3: 두 추출 결과를 텍스트로 비교 (PDF 없음)

const REPORT_EXTRACT_PROMPT = `당신은 한국 「식품·식품첨가물 품목제조보고서」 전문 분석가입니다.
첨부된 품목제조보고서 PDF를 정독하고, 두 가지 인적/소재지 정보를 명확히 분리하여 추출하세요.

[★중요: 보고인 vs 영업소 분리★]
품목제조보고서에는 두 종류의 정보가 있습니다:
  1) "보고인" 섹션 — 사업자 대표 개인 (성명, 주민등록 주소, 전화번호) — 이건 별도로 추출
  2) "영업소" 섹션 — 식품 제조 시설 (상호, 공장 소재지, 영업등록번호) — 이게 디자인 라벨의 "제조원"과 매칭될 정보

이 둘을 절대 섞지 마세요.

각 항목은 PDF에 보이는 텍스트를 한 글자도 빼지 말고 그대로 옮기세요.
숫자는 한 자리씩 정확히 (자리수까지). 자신 없으면 값 끝에 " [저신뢰도]" 표시.
정보가 명확히 보이지 않으면 null로.

순수 JSON으로만 응답:
{
  "reporter": {
    "name": "보고인 성명 (개인) - 라벨 비교 대상 아님",
    "address": "보고인 개인 주소",
    "phone": "보고인 전화번호 또는 휴대전화"
  },
  "businessEstablishment": {
    "companyName": "영업소(상호) - 예: (주)조인앤조인",
    "address": "영업소(공장) 소재지 - 디자인의 제조원 주소와 매칭될 정보",
    "businessRegistrationNumber": "영업등록번호 (자릿수 정확히)"
  },
  "product": {
    "productName": "제품명 (표지에 적힌 그대로)",
    "productType": "식품유형 (예: 과자, 빵류 등)",
    "manufacturingReportNumber": "품목제조보고번호 (자릿수 정확히)",
    "shelfLife": "소비기한 또는 품질유지기한 표기",
    "storageMethod": "보관방법",
    "packagingMaterial": "포장재질 (예: PE/PP/PET)",
    "packagingUnit": "포장단위/방법 (예: 1~2000g, 일봉)",
    "characteristics": "성상",
    "ingredients": ["주요 원재료명 5개 이상 (배합비율 수치는 절대 포함하지 말 것 - 영업비밀)"],
    "allergens": "알레르기 유발물질 또는 혼입 알레르기 정보",
    "isOutsourced": true 또는 false,
    "outsourcedTo": "위탁생산인 경우 위탁업체명 (없으면 null)"
  },
  "extractionConfidence": "high | medium | low",
  "extractionNotes": "추출 시 어려웠던 부분이나 주의사항 (한국어 1-2문장)"
}`;

const DESIGN_EXTRACT_PROMPT = `당신은 한국 식품 라벨 디자인 시안 분석가입니다.
첨부된 디자인 작업물(제품 패키지 시안 PDF/이미지)을 정독하고, 라벨에 표기된 모든 정보를 추출하세요.

[★ 다중 이미지 입력 처리 ★]
이미지 입력은 다음과 같이 여러 장으로 제공될 수 있습니다:
  - "[전체 (overview)]": 디자인 전체 레이아웃 파악용 (어디에 무엇이 있는지)
  - "[좌상/우상/좌하/우하 영역 확대]": 같은 디자인을 4분할한 확대 영역 (작은 글자 정밀 판독용)
  - "[페이지 N]" (PDF인 경우): 페이지별 이미지

판독 절차:
  1. overview 또는 첫 이미지로 전체 레이아웃과 어떤 정보가 어디에 있는지 파악
  2. 분할/확대 이미지로 작은 글자(8pt 이하 법정 의무 표기)까지 한 글자씩 정밀 판독
  3. 같은 정보가 여러 이미지에 걸쳐 있으면 가장 선명한 이미지의 값을 사용
  4. 작은 글자라도 절대 추측하지 말고 보이는 그대로 옮길 것 (헷갈리면 " [저신뢰도]" 표시)

[★중요: 회사별 분리★]
디자인 라벨에는 여러 회사가 다른 역할로 표시될 수 있습니다:
  - 제조원 / 제조사 / 제조처 / 제조시설 / 식품제조가공업 → 실제 제조 회사 (★검수의 핵심 비교 대상)
  - 판매원 / 판매사 / 유통원 → 판매 회사
  - 위탁자 / 주문자 / 브랜드 → OEM/PB 의뢰 회사
  - 콜라보 / 공동 제작

각 회사별로 명칭/주소/번호 등을 분리하여 추출하세요.

각 항목은 디자인에 보이는 텍스트를 한 글자도 빼지 말고 그대로 옮기세요.
숫자는 한 자리씩 정확히. 자신 없거나 작은 글자라 흐릿하면 값 끝에 " [저신뢰도]" 표시.
정보가 명확히 보이지 않으면 null로.

순수 JSON으로만 응답:
{
  "companies": [
    {
      "role": "제조원" | "판매원" | "유통원" | "위탁자" | "콜라보" | "기타",
      "companyName": "회사명",
      "address": "회사 주소 (있으면)",
      "businessRegistrationNumber": "사업자등록번호 또는 영업등록번호 (있으면)",
      "manufacturingReportNumber": "품목제조보고번호 (있으면, 자릿수 정확히)"
    }
  ],
  "product": {
    "productName": "제품명 (디자인에 적힌 그대로 - 한글)",
    "productNameEn": "영문 제품명 (있으면)",
    "productType": "식품유형 (있으면)",
    "netWeight": "내용량/중량 (예: 50g, 200ml)",
    "shelfLife": "소비기한 표기 형식",
    "storageMethod": "보관방법",
    "packagingMaterial": "포장재질",
    "ingredients": ["원재료명 표기 (디자인에 적힌 순서대로)"],
    "allergens": "알레르기 유발물질 표기",
    "nutritionFacts": "영양성분표 요약 (있으면)",
    "barcode": "바코드 번호 (읽을 수 있으면)"
  },
  "extractionConfidence": "high | medium | low",
  "extractionNotes": "추출 시 어려웠던 부분이나 주의사항 (한국어 1-2문장)"
}`;

const COMPARE_PROMPT = `당신은 한국 식품 라벨 검수 전문가입니다.
이미 추출된 두 JSON 데이터를 받아서 비교 검토합니다 (PDF 분석 없음, 텍스트 비교만).

[비교 규칙]
- 검수 대상 회사: "(주)조인앤조인" (= 디자인의 "제조원" 역할 회사)
- 디자인의 companies[] 중 role="제조원"이면서 회사명이 "(주)조인앤조인" 또는 "조인앤조인"인 항목을 찾아 사용
- 보고서의 reporter 섹션은 비교에서 제외 (보고인 개인 정보)
- 보고서의 businessEstablishment 섹션을 디자인의 제조원 회사와 매칭

[항목별 매칭]
- 제조사 명칭: report.businessEstablishment.companyName  vs  design.companies[role=제조원].companyName
- 제조사 소재지: report.businessEstablishment.address  vs  design.companies[role=제조원].address
- 영업등록번호: report.businessEstablishment.businessRegistrationNumber  vs  design.companies[role=제조원].businessRegistrationNumber
- 품목제조보고번호: report.product.manufacturingReportNumber  vs  design.companies[role=제조원].manufacturingReportNumber
- 제품명: report.product.productName  vs  design.product.productName
- 식품유형: report.product.productType  vs  design.product.productType
- 중량/내용량: report.product.packagingUnit  vs  design.product.netWeight
- 보관방법: report.product.storageMethod  vs  design.product.storageMethod
- 포장재질: report.product.packagingMaterial  vs  design.product.packagingMaterial
- 소비기한: report.product.shelfLife  vs  design.product.shelfLife
- 원재료명: report.product.ingredients  vs  design.product.ingredients (순서까지)
- 알레르기: report.product.allergens  vs  design.product.allergens

[판정]
- match: 한 글자/숫자도 다르지 않음
- minor: 띄어쓰기/괄호/단위/대소문자 차이 (의미 동일)
- mismatch: 한 글자라도 다름 (반드시 수정 필요)
- needs_review: 어느 한쪽 값이 [저신뢰도]거나 null이라 비교 불가
- not_found_in_design: 디자인의 제조원 정보 자체가 없음
- not_found_in_report: 보고서에 해당 항목 없음

특히 숫자/번호는 자릿수까지 한 자리씩 비교. 예: '2024047901224'(13자리) vs '20240470901224'(14자리) = mismatch

순수 JSON으로만 응답:
{
  "summary": "전체 검토 한 줄 요약",
  "overallStatus": "ok" | "needs_review" | "critical",
  "detectedCompanies": [{"name": "...", "role": "..."}],
  "reporterInfoExcluded": "보고인 개인 정보 제외 사실 한 문장",
  "items": [
    {
      "field": "제조사 소재지 (영업소)",
      "reportValue": "보고서 값",
      "designValue": "디자인 제조원 값. 다른 회사 정보 함께 표기 가능: '[제조원 ○○: A] (참고: 판매원 ○○: B)'",
      "status": "match" | "minor" | "mismatch" | "needs_review" | "not_found_in_design" | "not_found_in_report",
      "comment": "한국어 1-2문장. mismatch면 정확히 어디가 다른지"
    }
  ],
  "criticalIssues": ["반드시 수정 필요"],
  "recommendations": ["권장 개선"]
}`;

// ─── (Legacy 호환용) 단일 호출 비교 검토 ───
const DESIGN_REVIEW_PROMPT = `당신은 한국 식품 라벨 검수 전문가입니다. 식품 라벨링은 법적 문서이며, 한 글자/숫자라도 틀리면 식약처 행정처분 대상입니다. 절대 추측하지 말고, 보이는 그대로 한 글자씩 정확히 추출하세요.

[입력 문서]
  1) 품목제조보고서 (식약처/지자체 제출 공식 문서) — "(주)조인앤조인" 명의
  2) 디자인 작업물 (제품 패키지 시안)

═══════════════════════════════════════
★규칙 A: 품목제조보고서 섹션 구분 ★ (가장 흔한 실수 방지)
═══════════════════════════════════════
품목제조보고서에는 두 종류의 인적/소재지 정보가 있습니다. 절대 혼동하지 마세요:

【보고인】 = 사업자 대표 개인의 신상정보
  - 성명: 진해수 등 개인 이름
  - 주소: 대표자 거주지 (개인 주민등록 주소)
  → 이 정보는 디자인 라벨에 절대 표기되지 않으며, 비교 대상이 아닙니다.

【영업소】 = 식품을 실제 제조하는 시설/공장
  - 명칭(상호): "(주)조인앤조인" — 디자인의 "제조원"/"제조처"/"제조시설"과 매칭
  - 소재지: 공장 주소 — 디자인의 "제조원 주소"와 매칭
  - 영업등록번호 / 품목제조보고번호도 영업소 정보

★ 디자인 라벨에서 "제조원"이라고 표시된 회사명/주소는 반드시 품목제조보고서의 【영업소】와 비교하세요.
★ 보고인의 개인 주소를 디자인의 제조원 주소와 비교하면 절대 안 됩니다 (가장 흔한 오류).

═══════════════════════════════════════
★규칙 B: 회사 분리 — 다중 회사 표기 처리 ★
═══════════════════════════════════════
검수 대상 회사: "(주)조인앤조인" (식별자: "조인앤조인", "주식회사 조인앤조인", "JOIN&JOIN", "Join&Join", "JOINANDJOIN", 영업등록번호, 품목제조보고번호)

디자인에는 여러 회사가 함께 표시될 수 있습니다:
  - 제조원: (주)조인앤조인 (= 비교 대상 ★)
  - 판매원/유통원/총판: 다른 회사 (= 비교 대상 아님)
  - 콜라보 파트너 (= 비교 대상 아님)
  - 위탁자/주문자: 다른 회사 (= 비교 대상 아님)

처리:
  1. 디자인에서 "제조원/제조처/제조시설" 항목으로 명시된 (주)조인앤조인 정보만 reportValue와 비교
  2. designValue에 "[조인앤조인-제조원: <값>]" 형식. 다른 회사가 함께 보이면 "(참고: 판매원=○○: <값>)" 추가
  3. 디자인에 "(주)조인앤조인" 표기가 없으면 status="not_found_in_design", comment에 "발견된 다른 회사: ..." 명시

═══════════════════════════════════════
★규칙 C: 단계별 작업 절차 (반드시 순서대로) ★
═══════════════════════════════════════
1단계 — 품목제조보고서 정독:
  a. "보고인" 섹션의 성명/주소 식별 (이건 비교에서 제외)
  b. "영업소" 섹션의 명칭/소재지/품목제조보고번호 추출
  c. "제품명/식품유형/소비기한/원재료명/보관방법/포장재질/포장단위" 추출

2단계 — 디자인 정독:
  a. 발견된 모든 회사명을 detectedCompanies에 나열 (제조원/판매원/유통원 구분 포함)
  b. "(주)조인앤조인"이 어떤 역할(제조원/판매원/...)로 표기되었는지 확인
  c. "(주)조인앤조인"과 같은 항목으로 묶인 정보(주소/번호 등)만 추출

3단계 — 한 글자씩 대조:
  a. 모든 숫자/번호는 자릿수까지 검사 (예: 13자리 vs 14자리는 mismatch)
  b. 주소는 시/도/시군구/도로명/번지/건물번호/동/호수까지
  c. 한자 vs 한글, 띄어쓰기, 괄호 유무 차이는 minor

═══════════════════════════════════════
[검토 항목]
═══════════════════════════════════════
- 제조사 명칭 (영업소 vs 디자인 제조원)
- 제조사 소재지 (영업소 소재지 vs 디자인 제조원 주소)
- 품목제조보고번호 (자릿수까지 정확히)
- 영업등록번호
- 제품명 (한글/영문)
- 식품유형
- 중량/내용량 (숫자+단위)
- 보관방법
- 포장재질
- 소비기한 표시 형식
- 원재료명 (주요 5개 이상, 표기 순서 포함)
- 알레르기 유발물질

═══════════════════════════════════════
[★텍스트 추출 규칙 - 절대 준수★]
═══════════════════════════════════════
1. 숫자/번호는 한 자리씩 정확히. 헷갈리면 reportValue/designValue 끝에 " [저신뢰도]" 추가 + status="needs_review"
2. 주소: 줄바꿈/괄호/쉼표 그대로. 예: "경기도 안산시 단원구 번영로10번길 22(나동 1, 2층 성곡동)"
3. 추출 후 한 글자씩 다시 대조 (mismatch 판정 전 반드시 두 번 검증)
4. 디자인이 흐릿하거나 작아서 정확한 판독이 어려우면 comment에 명시 + status="needs_review" (mismatch로 단정 금지)
5. 두 글자가 다른지 같은지 0.001%라도 의심되면 needs_review 처리

[판정 기준]
- match: 한 글자/숫자 차이도 없음
- minor: 띄어쓰기/괄호/단위 표기 차이만 있음 (의미 동일)
- mismatch: 한 글자/숫자라도 다름 → 반드시 수정 필요
- needs_review: 판독이 불확실하여 사람이 직접 봐야 함
- not_found_in_design: 디자인에 (주)조인앤조인 관련 정보 없음
- not_found_in_report: 품목제조보고서에 해당 정보 없음

[배합비율 관련 주의]
품목제조보고서의 배합비율(%)은 영업비밀입니다. 화면에서는 가려지지만 당신이 받는 원본에는 포함됩니다. 원재료명만 비교하고 비율 수치는 절대 응답에 포함하지 마세요.

═══════════════════════════════════════
[출력 - 순수 JSON만, 마크다운/설명 금지]
═══════════════════════════════════════
{
  "summary": "전체 검토 한 줄 요약. 회사 분리/매칭 결과 포함",
  "overallStatus": "ok" | "needs_review" | "critical",
  "detectedCompanies": [
    {"name": "(주)조인앤조인", "role": "제조원"},
    {"name": "OO컴퍼니", "role": "판매원"}
  ],
  "reporterInfoExcluded": "품목제조보고서의 보고인(개인) 정보는 비교 대상이 아니므로 제외했음을 한 문장으로 확인",
  "items": [
    {
      "field": "제조사 소재지 (영업소)",
      "reportValue": "영업소 섹션의 소재지 그대로",
      "designValue": "[조인앤조인-제조원: 경기도 안산시 ...] (참고: 판매원=○○: ...)",
      "status": "match" | "minor" | "mismatch" | "needs_review" | "not_found_in_design" | "not_found_in_report",
      "comment": "한국어 1-2문장. 한 글자 다르면 정확히 어디인지 명시 (예: '디자인은 22번지, 보고서는 22-1번지')"
    }
  ],
  "criticalIssues": ["반드시 수정 필요 사항"],
  "recommendations": ["권장 개선 사항"]
}`;

// ─── 헬퍼: 파일을 Claude content block 배열로 변환 ───
// PDF는 페이지별 고해상도 PNG 배열로 렌더링 (Vision 파이프라인 직접 사용 → 작은 글자 정확도 ↑)
// 이미지는 그대로 단일 이미지 블록
// kind: 'design' | 'report' — 디자인은 더 높은 해상도, 빈 PNG 감지 시 document fallback
async function fileToContentBlocks(fileBuffer, contentType, fileName, kind = 'report') {
  const isPdf = (contentType || '').includes('pdf') || /\.pdf$/i.test(fileName || '');

  if (isPdf) {
    // 모듈 로드 실패 시 즉시 document 타입 fallback
    if (!pdfToImages) {
      console.warn(`[AI] pdfToImages 미사용 - document 타입으로 전송`);
      return [{
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') },
      }];
    }
    // 디자인은 보통 1-2페이지에 작은 글자 많음 → 더 높은 해상도
    const renderOpts = kind === 'design'
      ? { scale: 3.5, maxPages: 4, maxLongEdgePx: 3000 }
      : { scale: 2.5, maxPages: 8, maxLongEdgePx: 2200 };

    try {
      const images = await pdfToImages(fileBuffer, renderOpts);
      console.log(`[AI] PDF→PNG (${kind}): ${images.length} pages, sizes=${images.map(i => `${i.width}x${i.height}(${(i.buffer.length / 1024).toFixed(0)}KB)`).join(', ')}`);

      // 빈 페이지 감지: PNG가 비정상적으로 작으면 (< 30KB for 큰 페이지) 렌더링 실패 의심
      const totalBytes = images.reduce((sum, i) => sum + i.buffer.length, 0);
      const avgKB = (totalBytes / images.length / 1024);
      const looksBlank = images.length > 0 && avgKB < 30 && images[0].width > 800;
      if (looksBlank) {
        console.warn(`[AI] PDF→PNG (${kind}) 결과가 의심됨 (avg ${avgKB.toFixed(0)}KB) — document 타입 fallback`);
        return [{
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') },
        }];
      }

      const blocks = [];
      for (const img of images) {
        blocks.push({ type: 'text', text: `[페이지 ${img.pageNum}]` });
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: img.buffer.toString('base64'),
          },
        });
      }
      return blocks;
    } catch (err) {
      console.error(`[AI] PDF→PNG (${kind}) 실패, document 타입으로 fallback:`, err.message);
      return [{
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') },
      }];
    }
  }

  // 이미지 파일 (PNG/JPG)
  // 디자인 라벨은 작은 글자가 많아서 Claude 1568px 다운샘플링에 정보 손실 → 4분할 + sharpen
  // 보고서 이미지는 분할 안 함 (보통 단순 스캔)
  try {
    if (kind === 'design' && prepareImageTiles) {
      const tiles = await prepareImageTiles(fileBuffer, { divisionsThresholdPx: 1800, divisions: 2 });
      console.log(`[AI] Design image → ${tiles.length} tiles: ${tiles.map(t => `${t.label}(${t.width}x${t.height},${(t.buffer.length / 1024).toFixed(0)}KB)`).join(', ')}`);

      const blocks = [];
      blocks.push({ type: 'text', text: `디자인 이미지를 다음과 같이 분할하여 제공합니다 (총 ${tiles.length}장). 첫 번째는 전체 레이아웃 파악용이고, 나머지는 작은 글자까지 정밀 판독하기 위한 확대 영역입니다. 모든 이미지를 종합해서 정보를 추출하세요.` });
      for (const tile of tiles) {
        blocks.push({ type: 'text', text: `[${tile.label}]` });
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: tile.buffer.toString('base64'),
          },
        });
      }
      return blocks;
    }
  } catch (e) {
    console.error(`[AI] Image split failed, sending original:`, e.message);
  }

  // 분할 미적용: 원본 그대로
  return [{
    type: 'image',
    source: {
      type: 'base64',
      media_type: contentType || 'image/png',
      data: fileBuffer.toString('base64'),
    },
  }];
}

async function callExtraction(client, systemPrompt, contentBlocks, label, instructionText) {
  const blocks = Array.isArray(contentBlocks) ? contentBlocks : [contentBlocks];
  const userText = instructionText || `위 PDF 페이지(이미지)를 한 페이지씩 꼼꼼히 정독하여 시스템 프롬프트의 JSON 스키마로 정보를 추출하세요. 작은 글자도 빠뜨리지 말고 한 글자씩 정확히 읽으세요. 제품명 참고: ${label.productName}

★ 응답 형식 강제 (JSON syntax 위반 시 시스템 오류 발생):
1. 첫 글자부터 마지막 글자까지 순수 JSON만. 마크다운 코드블록(\`\`\`), 설명 텍스트 금지.
2. JSON 문자열 값 안에 큰따옴표(") 절대 사용 금지!
   원본에 큰따옴표가 있으면 다음 중 하나로 대체:
   - 단일 따옴표 (')
   - 한국식 인용 부호 (「」 또는 『』)
   - 또는 따옴표 자체 생략
   예: 원본 '제품에 "DDM"으로 표기' → JSON에는 "제품에 'DDM'으로 표기" 또는 "제품에 「DDM」으로 표기"
3. JSON 문자열 안의 줄바꿈은 반드시 \\n으로 escape (raw 줄바꿈 금지)`;

  const response = await client.messages.create({
    model: REVIEW_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          ...blocks,
          { type: 'text', text: userText },
        ],
      },
    ],
  });
  const text = response.content[0].text;
  const result = safeParseJson(text);
  if (!result) {
    console.error(`[AI] JSON 파싱 실패. Raw response (처음 1000자):`, text.substring(0, 1000));
    throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다. 다시 시도해주세요.');
  }
  return result;
}

// Step 1만 단독 호출
router.post('/extract-report/:labelId', authenticate, async (req, res) => {
  try {
    const client = getClient();
    if (!client) return res.status(400).json({ error: 'ANTHROPIC_API_KEY 환경변수가 필요합니다.' });
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label?.manufacturingReportUrl) return res.status(400).json({ error: '품목제조보고서가 없습니다.' });

    const reportFile = await storage.getFileBuffer(label.manufacturingReportUrl.replace(/^\/uploads\//, ''));
    if (!reportFile) return res.status(404).json({ error: '보고서 파일을 불러올 수 없습니다.' });

    const content = await fileToContentBlocks(reportFile.buffer, reportFile.contentType, label.manufacturingReportName, 'report');
    const extraction = await callExtraction(client, REPORT_EXTRACT_PROMPT, content, label);

    await prisma.label.update({
      where: { id: req.params.labelId },
      data: { aiReportExtraction: extraction },
    });
    res.json({ extraction });
  } catch (e) {
    console.error('[Extract Report]', e?.message);
    res.status(500).json({ error: e?.message || '보고서 추출 실패' });
  }
});

// Step 2만 단독 호출
router.post('/extract-design/:labelId', authenticate, async (req, res) => {
  try {
    const client = getClient();
    if (!client) return res.status(400).json({ error: 'ANTHROPIC_API_KEY 환경변수가 필요합니다.' });
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label?.designFileUrl) return res.status(400).json({ error: '디자인 파일이 없습니다.' });

    const designFile = await storage.getFileBuffer(label.designFileUrl.replace(/^\/uploads\//, ''));
    if (!designFile) return res.status(404).json({ error: '디자인 파일을 불러올 수 없습니다.' });

    const content = await fileToContentBlocks(designFile.buffer, designFile.contentType, label.designFileName, 'design');
    const extraction = await callExtraction(client, DESIGN_EXTRACT_PROMPT, content, label);

    await prisma.label.update({
      where: { id: req.params.labelId },
      data: { aiDesignExtraction: extraction },
    });
    res.json({ extraction });
  } catch (e) {
    console.error('[Extract Design]', e?.message);
    res.status(500).json({ error: e?.message || '디자인 추출 실패' });
  }
});

// 멀티 패스 통합 호출: 추출 → 추출 → 비교
router.post('/review-design-vs-report/:labelId', authenticate, async (req, res) => {
  const t0 = Date.now();
  const labelId = req.params.labelId;
  console.log(`[AI Review Multi-pass] Start labelId=${labelId}`);
  try {
    const client = getClient();
    if (!client) return res.status(400).json({ error: 'AI 기능을 사용하려면 ANTHROPIC_API_KEY 환경변수를 설정해주세요.' });

    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label) return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    if (!label.designFileUrl) return res.status(400).json({ error: '디자인 파일이 첨부되지 않았습니다.' });
    if (!label.manufacturingReportUrl) return res.status(400).json({ error: '품목제조보고서가 첨부되지 않았습니다.' });

    const designKey = label.designFileUrl.replace(/^\/uploads\//, '');
    const reportKey = label.manufacturingReportUrl.replace(/^\/uploads\//, '');

    const [designFile, reportFile] = await Promise.all([
      storage.getFileBuffer(designKey),
      storage.getFileBuffer(reportKey),
    ]);
    if (!designFile) return res.status(404).json({ error: '디자인 파일을 불러올 수 없습니다.' });
    if (!reportFile) return res.status(404).json({ error: '품목제조보고서를 불러올 수 없습니다.' });

    const designSizeMB = designFile.buffer.length / (1024 * 1024);
    const reportSizeMB = reportFile.buffer.length / (1024 * 1024);
    console.log(`[AI Review Multi-pass] sizes: design=${designSizeMB.toFixed(2)}MB, report=${reportSizeMB.toFixed(2)}MB`);
    if (designSizeMB > 28 || reportSizeMB > 28) {
      return res.status(413).json({ error: `각 파일 크기는 28MB 이하여야 합니다. (design=${designSizeMB.toFixed(1)}MB, report=${reportSizeMB.toFixed(1)}MB)` });
    }

    // Step 1: 보고서 추출
    console.log(`[AI Review Multi-pass] Step 1: Extracting from report...`);
    const reportContent = await fileToContentBlocks(reportFile.buffer, reportFile.contentType, label.manufacturingReportName, 'report');
    const reportExtraction = await callExtraction(client, REPORT_EXTRACT_PROMPT, reportContent, label);
    console.log(`[AI Review Multi-pass] Step 1 done in ${Date.now() - t0}ms`);

    // Step 2: 디자인 추출
    console.log(`[AI Review Multi-pass] Step 2: Extracting from design...`);
    const designContent = await fileToContentBlocks(designFile.buffer, designFile.contentType, label.designFileName, 'design');
    const designExtraction = await callExtraction(client, DESIGN_EXTRACT_PROMPT, designContent, label);
    console.log(`[AI Review Multi-pass] Step 2 done in ${Date.now() - t0}ms`);

    // 추출 결과 저장 (3단계 실패 시에도 보존)
    await prisma.label.update({
      where: { id: labelId },
      data: {
        aiReportExtraction: reportExtraction,
        aiDesignExtraction: designExtraction,
      },
    });

    // Step 3: 비교 (PDF 없이 텍스트만)
    console.log(`[AI Review Multi-pass] Step 3: Comparing...`);
    const compareUserMessage = `[추출된 보고서 정보]
${JSON.stringify(reportExtraction, null, 2)}

[추출된 디자인 정보]
${JSON.stringify(designExtraction, null, 2)}

위 두 JSON을 비교 규칙에 따라 검토하고 시스템 프롬프트의 JSON 스키마로 응답하세요.`;

    const compareResponse = await client.messages.create({
      model: REVIEW_MODEL,
      max_tokens: 8192,
      system: COMPARE_PROMPT,
      messages: [
        { role: 'user', content: compareUserMessage + '\n\n★ 응답 형식: 순수 JSON만 ({ 로 시작 } 로 끝). 마크다운 코드블록(```) 금지. 설명 텍스트 금지. JSON 문자열 안의 큰따옴표(")는 단일 따옴표(\') 또는 「」로 대체.' },
      ],
    });
    const compareText = compareResponse.content[0].text;
    const compareResult = safeParseJson(compareText);
    if (!compareResult) {
      console.error(`[AI Review Multi-pass] Compare JSON parse failed. Raw (처음 1000자):`, compareText.substring(0, 1000));
      throw new Error('AI 비교 응답을 JSON으로 파싱할 수 없습니다. 다시 시도해주세요.');
    }
    console.log(`[AI Review Multi-pass] Step 3 done in ${Date.now() - t0}ms (total)`);

    const updated = await prisma.label.update({
      where: { id: labelId },
      data: {
        aiDesignReview: compareResult,
        aiDesignReviewedAt: new Date(),
      },
    });

    res.json({
      review: compareResult,
      reportExtraction,
      designExtraction,
      reviewedAt: updated.aiDesignReviewedAt,
      timing: { totalMs: Date.now() - t0 },
    });
  } catch (error) {
    console.error(`[AI Review Multi-pass] Failed after ${Date.now() - t0}ms:`, error?.name, error?.message);
    let userMsg = error?.message || 'AI 자동 검토에 실패했습니다.';
    if (error?.status === 413 || /size/i.test(userMsg)) userMsg = '파일이 너무 큽니다.';
    if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') userMsg = 'AI 서버 응답 시간 초과. 잠시 후 다시 시도해주세요.';
    res.status(500).json({ error: userMsg });
  }
});

// ─── (Legacy) 단일 콜 비교 검토 ─── (현재 미사용, 호환성 보존)
router.post('/_legacy/review-design-vs-report/:labelId', authenticate, async (req, res) => {
  const t0 = Date.now();
  console.log(`[AI Review] Start labelId=${req.params.labelId}`);
  try {
    const client = getClient();
    if (!client) {
      return res.status(400).json({ error: 'AI 기능을 사용하려면 ANTHROPIC_API_KEY 환경변수를 설정해주세요.' });
    }

    const labelId = req.params.labelId;
    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label) {
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }
    if (!label.designFileUrl) {
      return res.status(400).json({ error: '디자인 파일이 첨부되지 않았습니다.' });
    }
    if (!label.manufacturingReportUrl) {
      return res.status(400).json({ error: '품목제조보고서가 첨부되지 않았습니다.' });
    }

    const designKey = label.designFileUrl.replace(/^\/uploads\//, '');
    const reportKey = label.manufacturingReportUrl.replace(/^\/uploads\//, '');
    console.log(`[AI Review] Loading files: designKey=${designKey}, reportKey=${reportKey}`);

    const [designFile, reportFile] = await Promise.all([
      storage.getFileBuffer(designKey),
      storage.getFileBuffer(reportKey),
    ]);

    if (!designFile) return res.status(404).json({ error: '디자인 파일을 불러올 수 없습니다.' });
    if (!reportFile) return res.status(404).json({ error: '품목제조보고서 파일을 불러올 수 없습니다.' });

    const designSizeMB = designFile.buffer.length / (1024 * 1024);
    const reportSizeMB = reportFile.buffer.length / (1024 * 1024);
    console.log(`[AI Review] File sizes: design=${designSizeMB.toFixed(2)}MB, report=${reportSizeMB.toFixed(2)}MB`);

    if (designSizeMB + reportSizeMB > 30) {
      return res.status(413).json({
        error: `파일 크기 합이 너무 큽니다 (${(designSizeMB + reportSizeMB).toFixed(1)}MB). Anthropic API 한도(32MB) 초과. PDF를 압축해주세요.`,
      });
    }

    const reportContent = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: reportFile.buffer.toString('base64'),
      },
    };

    const designIsPdf = (designFile.contentType || '').includes('pdf') || /\.pdf$/i.test(label.designFileName || '');
    const designContent = designIsPdf
      ? {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: designFile.buffer.toString('base64'),
          },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: designFile.contentType || 'image/png',
            data: designFile.buffer.toString('base64'),
          },
        };

    const userMessage = `[문서1: 품목제조보고서 - 기준 데이터, "(주)조인앤조인" 영업소 명의]
[문서2: 디자인 작업물 - 검증 대상]

검수 대상 회사: (주)조인앤조인
제품명: ${label.productName}

위 두 문서를 비교하여 시스템 프롬프트의 JSON 스키마로 작성하세요.
디자인에 다른 회사가 함께 표기되어 있다면 반드시 (주)조인앤조인 데이터만 추출해서 비교하고,
detectedCompanies 필드에 발견된 모든 회사명을 나열하세요.`;

    console.log(`[AI Review] Calling Anthropic API...`);
    const response = await client.messages.create({
      model: REVIEW_MODEL,
      max_tokens: 8192,
      system: DESIGN_REVIEW_PROMPT,
      messages: [{
        role: 'user',
        content: [
          reportContent,
          designContent,
          { type: 'text', text: userMessage },
        ],
      }],
    });
    console.log(`[AI Review] Anthropic responded in ${Date.now() - t0}ms`);

    const text = response.content[0].text;
    const result = safeParseJson(text);
    if (!result) {
      console.error(`[AI Review legacy] JSON parse failed. Raw (처음 1000자):`, text.substring(0, 1000));
      return res.status(500).json({ error: 'AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.' });
    }

    const updated = await prisma.label.update({
      where: { id: labelId },
      data: {
        aiDesignReview: result,
        aiDesignReviewedAt: new Date(),
      },
    });

    console.log(`[AI Review] Success, total ${Date.now() - t0}ms`);
    res.json({
      review: result,
      reviewedAt: updated.aiDesignReviewedAt,
    });
  } catch (error) {
    console.error(`[AI Review] Failed after ${Date.now() - t0}ms:`, error?.name, error?.message);
    if (error?.status) console.error(`[AI Review] HTTP status: ${error.status}, response:`, error?.error || error?.response);

    let userMessage = error?.message || 'AI 자동 검토에 실패했습니다.';
    if (error?.status === 400 && error?.message?.includes('document')) {
      userMessage = 'AI가 PDF를 읽을 수 없습니다. PDF가 손상되지 않았는지, 페이지 수가 100페이지 이하인지 확인해주세요.';
    } else if (error?.status === 413 || error?.message?.includes('size')) {
      userMessage = '파일이 너무 큽니다. PDF를 압축하거나 페이지 수를 줄여주세요.';
    } else if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') {
      userMessage = 'AI 서버 응답 시간 초과. 잠시 후 다시 시도해주세요.';
    }
    res.status(500).json({ error: userMessage, errorCode: error?.code, errorStatus: error?.status });
  }
});

module.exports = router;
