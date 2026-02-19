const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

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
    "japan": ["日本アレルゲン"]
  },
  "storageInstructions": {
    "korea": "한국어 보관방법",
    "us": "English storage instructions",
    "japan": "日本語保存方法"
  },
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

    const { productName, productType, ingredients, servingSize, servingUnit, totalContent, totalUnit, targetMarkets } = req.body;

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

위 정보를 바탕으로 한국 식품 표시기준에 맞는 완전한 식품 라벨 정보를 생성해주세요.
복합원재료와 식품첨가물은 해당 규칙을 반드시 적용하고, ruleApplicationReport에 각 규칙 적용 내역을 상세히 기록해주세요.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: GENERATE_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].text;
    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return res.status(500).json({ error: 'AI 응답을 파싱할 수 없습니다.', raw: text });
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
    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return res.status(500).json({ error: 'AI 응답을 파싱할 수 없습니다.' });
    }

    res.json({ compliance: result });
  } catch (error) {
    console.error('Compliance check error:', error);
    res.status(500).json({ error: '규정 준수 검토에 실패했습니다.' });
  }
});

module.exports = router;
