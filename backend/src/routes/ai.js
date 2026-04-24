const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const storage = require('../lib/storage');

const router = express.Router();
const prisma = new PrismaClient();

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
    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return res.status(500).json({ error: 'AI 응답을 파싱할 수 없습니다.', raw: text });
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

// ─── 디자인 vs 품목제조보고서 AI 자동 비교 검토 ───
const DESIGN_REVIEW_PROMPT = `당신은 한국 식품 라벨 검수 전문가입니다.
첨부된 두 문서를 비교 검토합니다:
  1) 품목제조보고서 (식약처/지자체 제출 공식 문서) — 기준 데이터
  2) 디자인 작업물 (제품 패키지 시안 PDF/이미지) — 검증 대상

두 문서에서 다음 핵심 항목을 추출하고 일치 여부를 판정하세요:
- 제조사(영업소) 명칭/소재지
- 품목제조보고번호
- 제품명 (한글/영문 모두)
- 식품유형 (예: 과자, 빵류, 즉석섭취식품 등)
- 중량/내용량
- 보관방법
- 포장재질 (내포장재/외포장재)
- 소비기한(유통기한) 표시 형식
- 원재료명 (주요 5개 이상)
- 알레르기 유발물질

판정 기준:
- match: 문구가 완전히 일치
- minor: 표기 차이는 있으나 의미상 동일 (예: 대소문자, 띄어쓰기, 단위 표기)
- mismatch: 의미가 다르거나 누락 — 반드시 수정 필요
- not_found_in_design: 디자인에 해당 정보가 없음
- not_found_in_report: 품목제조보고서에 해당 정보가 없음

반드시 아래 JSON 스키마로만 응답하세요. 마크다운/설명 없이 순수 JSON만 출력:

{
  "summary": "전체 검토 한 줄 요약 (예: '7개 항목 중 5개 일치, 2개 불일치 발견 - 즉시 수정 필요')",
  "overallStatus": "ok" | "needs_review" | "critical",
  "items": [
    {
      "field": "제품명",
      "reportValue": "품목제조보고서에서 추출한 값 (없으면 null)",
      "designValue": "디자인에서 추출한 값 (없으면 null)",
      "status": "match" | "minor" | "mismatch" | "not_found_in_design" | "not_found_in_report",
      "comment": "차이점 또는 추천 조치 (한국어 1-2문장)"
    }
  ],
  "criticalIssues": ["반드시 수정해야 할 핵심 사항을 한국어 문장으로 (없으면 빈 배열)"],
  "recommendations": ["권장 개선 사항 (한국어 문장)"]
}`;

router.post('/review-design-vs-report/:labelId', authenticate, async (req, res) => {
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

    const userMessage = `[문서1: 품목제조보고서 - 기준 데이터]
[문서2: 디자인 작업물 - 검증 대상]

위 두 문서를 비교하여 시스템 프롬프트에 정의된 JSON 스키마로 검토 결과를 작성해주세요.
제품명: ${label.productName}`;

    console.log(`[AI Review] Calling Anthropic API...`);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
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
    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      console.error(`[AI Review] JSON parse failed:`, e.message, 'raw text:', text.substring(0, 500));
      return res.status(500).json({ error: 'AI 응답을 파싱할 수 없습니다.', raw: text.substring(0, 1000) });
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
