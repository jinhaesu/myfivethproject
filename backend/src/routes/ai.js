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

const GENERATE_PROMPT = `당신은 한국, 미국, 일본의 식품 표시 규정 전문가입니다.
주어진 제품 정보를 바탕으로 완전한 식품 라벨 정보를 생성해주세요.

중요: 반드시 유효한 JSON만 응답하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요.

응답 JSON 형식:
{
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
    "korea": ["한국 알레르기 유발물질"],
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
      "ingredientsList": "원재료명 표기 (배합비 높은 순, 원산지 표시 의무 대상만 원산지 괄호 표기)",
      "requiredStatements": ["필수 표시사항"],
      "originNote": "원산지 표기 관련 참고사항"
    },
    "us": {
      "foodType": "Food category",
      "ingredientsList": "Ingredients listing (FDA format, descending order by weight)",
      "allergenStatement": "Contains: ...",
      "requiredStatements": ["Required FDA statements"]
    },
    "japan": {
      "foodType": "食品分類",
      "ingredientsList": "原材料名表示（日本食品表示法基準）",
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

영양성분은 1회 제공량 기준으로 계산하세요.
원재료 배합비를 기반으로 합리적인 영양성분을 추정하세요.
각 국가의 최신 식품 표시 규정을 정확히 반영하세요.

원산지(originAnalysis) 분석 시 반드시 다음 한국 규정을 따르세요:
- 「농수산물의 원산지 표시 등에 관한 법률」 시행령 [별표1]
- 육류(쇠고기, 돼지고기, 닭고기, 오리고기, 양고기, 염소고기)는 항상 원산지 표시 필수
- 쌀(현미, 찹쌀 포함)은 항상 원산지 표시 필수
- 김치류 제조 시 배추, 고춧가루, 무는 원산지 표시 필수
- 수산물은 배합비율 상위 또는 제품명에 포함 시 원산지 표시 필수
- 주요 농산물(콩, 감자, 고구마, 마늘, 양파, 고추, 참깨 등)은 배합비 5% 이상 또는 제품명에 포함 시 표시 필수
- 식품첨가물, 정제수, 정제염, 설탕, 물엿, 전분, 유화제 등은 원산지 표시 불필요
- 모든 원재료에 무조건 원산지를 표기하는 것은 규정에 맞지 않음
- 원산지 표기가 필요한 원재료만 "원재료명(원산지)" 형태로 표기하세요`;

const COMPLIANCE_PROMPT = `당신은 한국(식약처/MFDS), 미국(FDA), 일본(소비자청/CAA)의 식품 표시 규정 전문가입니다.
주어진 라벨 정보를 각 국가의 규정에 맞는지 검토해주세요.

중요: 반드시 유효한 JSON만 응답하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요.

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

    const ingredientsList = ingredients
      .map((ing) => `${ing.name} ${ing.ratio}%${ing.origin ? ` (${ing.origin})` : ''}`)
      .join(', ');

    const userMessage = `제품 정보:
- 제품명: ${productName}
- 식품유형: ${productType || '일반가공식품'}
- 원재료 및 배합비: ${ingredientsList}
- 1회 제공량: ${servingSize || '미정'}${servingUnit || 'g'}
- 총 내용량: ${totalContent || '미정'}${totalUnit || 'g'}
- 대상 시장: ${(targetMarkets || ['korea']).join(', ')}

위 정보를 바탕으로 완전한 식품 라벨 정보를 생성해주세요.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
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
