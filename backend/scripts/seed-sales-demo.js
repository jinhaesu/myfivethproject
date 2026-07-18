// 영업 관리 데모 시드 — 파이프라인 UI 확인용 샘플 거래처/일지/계획
// 실행: railway run --service myfivethproject node scripts/seed-sales-demo.js
// (Railway 환경변수 DATABASE_URL 주입 필요. '[샘플]' 접두 거래처는 재실행 시 정리 후 재생성)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SUPER_EMAIL = 'lion9080@joinandjoin.com';

// 오늘 기준 offset일(오전 9시)
function d(offsetDays) {
  const x = new Date();
  x.setDate(x.getDate() + offsetDays);
  x.setHours(9, 0, 0, 0);
  return x;
}

async function main() {
  let user = await prisma.user.findUnique({ where: { email: SUPER_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: SUPER_EMAIL, name: '진해수', department: '대표', role: 'admin' },
    });
    console.log('super admin 사용자 생성:', user.email);
  }
  const uid = user.id;

  // 기존 샘플 정리 (cascade로 하위 일지/명함/계획 함께 삭제)
  const olds = await prisma.salesClient.findMany({
    where: { name: { startsWith: '[샘플]' } },
    select: { id: true },
  });
  if (olds.length) {
    await prisma.salesClient.deleteMany({ where: { id: { in: olds.map((o) => o.id) } } });
    console.log(`기존 샘플 거래처 ${olds.length}건 정리`);
  }

  // ── 거래처 A: 그린마트 (제안·미팅 단계) ──
  const a = await prisma.salesClient.create({
    data: {
      name: '[샘플] 그린마트 유통', bizNumber: '123-45-67890', stage: 'proposal',
      ownerOrg: '상품본부 베이커리팀', buyerComposition: 'MD 2인, 카테고리매니저 1인',
      annualRevenue: '연 1,200억 / 베이커리 300억', existingVendors: 'A제과, B베이커리',
      managedItems: '냉장 디저트, 생지', storageCondition: '냉장(0~10℃)',
      logisticsCondition: '주 3회 냉장 직납, 물류센터 경유', note: '시즈널 기획전 관심 높음',
      createdById: uid,
      contacts: {
        create: [
          { name: '김바이어', position: '차장', title: '베이커리 MD', phone: '010-1234-5678', email: 'buyer.kim@greenmart.example', sortOrder: 0 },
          { name: '이담당', position: '대리', title: '카테고리 매니저', phone: '010-2222-3333', email: 'lee@greenmart.example', sortOrder: 1 },
        ],
      },
    },
  });
  await prisma.salesJournal.create({
    data: {
      clientId: a.id, authorId: uid, title: '그린마트 1차 미팅 — 신제품 입점 제안',
      isFirstMeeting: true, stage: 'proposal', meetingDate: d(-7),
      meetingPurpose: '신제품(고단백 브라우니) 입점 제안', meetingLocation: '그린마트 본사 3층 회의실',
      attendees: '(당사) 홍길동 / (거래처) MD 김바이어, 카테고리매니저 이담당',
      meetingSummary: '고단백 디저트 카테고리 확대 니즈 확인. 시즈널 패키지 구성과 초도 물량을 협의했고, 마진율·정산조건은 추가 협의가 필요함.',
      keyRequests: '- 개당 원가 인하 여지 확인\n- 냉장 유통기한 30일 이상\n- 전용 매대 프로모션 지원',
      productRequests: '고단백(단백질 10g↑) 브라우니, 개당 60g, 4입 트레이. 크리스마스 시즌 한정 패키지 제안.',
      referrers: { create: [{ email: SUPER_EMAIL }] },
      todos: {
        create: [
          { dueDate: d(3), content: '견적·마진 시뮬레이션 제공', plan: '원가표 기반 3개 시나리오 작성' },
          { dueDate: d(7), content: '샘플 품평회 진행', plan: 'MD 2인 대상 시식' },
        ],
      },
    },
  });
  await prisma.salesJournal.create({
    data: {
      clientId: a.id, authorId: uid, title: '그린마트 2차 — 품평 피드백', stage: 'proposal', meetingDate: d(-2),
      meetingPurpose: '샘플 품평 피드백 반영', meetingLocation: '그린마트 본사',
      meetingSummary: '단맛 소폭 하향, 식감 개선 요청. 가격대 합의에 근접.',
      keyRequests: '단맛 하향, 최종 견적 재제출', productRequests: '당 함량 20% 저감 버전 재샘플',
      todos: { create: [{ dueDate: d(5), content: '입점 조건(정산·물류·수수료) 협의', plan: '' }] },
    },
  });
  await prisma.salesPlan.create({
    data: { clientId: a.id, authorId: uid, title: '그린마트 최종 제안 미팅', planDate: d(10), stage: 'proposal', content: '저감당 재샘플 + 최종 견적 제출' },
  });

  // ── 거래처 B: 하나편의점 (매출 기여 단계) ──
  const b = await prisma.salesClient.create({
    data: {
      name: '[샘플] 하나편의점', bizNumber: '222-33-44444', stage: 'revenue',
      ownerOrg: '상품기획팀', managedItems: '냉장 디저트', storageCondition: '냉장', logisticsCondition: '전국 물류센터 3곳',
      createdById: uid,
      contacts: { create: [{ name: '박상품', position: '과장', title: '디저트 MD', phone: '010-9876-5432', email: 'park@hanacvs.example', sortOrder: 0 }] },
    },
  });
  await prisma.salesJournal.create({
    data: {
      clientId: b.id, authorId: uid, title: '하나편의점 초도 발주 확정', stage: 'revenue', meetingDate: d(-4),
      meetingPurpose: '초도 발주 및 납품 일정 확정', meetingLocation: '하나편의점 본사',
      meetingSummary: '3종 5,000개 초도 발주 확정. 냉장 물류 3개 센터 분납.',
      keyRequests: '납품 리드타임 3일, 결품률 1% 이하', productRequests: '개당 45g, 낱개 진열',
      todos: {
        create: [
          { dueDate: d(2), content: '발주(PO) 확인 및 초도 물량 생산 협의', plan: '생산 스케줄 확정' },
          { dueDate: d(6), content: '납품 일정·물류(온도·리드타임) 확정', plan: '3개 센터 분납 일정' },
        ],
      },
    },
  });
  await prisma.salesPlan.create({
    data: { clientId: b.id, authorId: uid, title: '하나편의점 초도 납품', planDate: d(6), stage: 'revenue' },
  });

  // ── 거래처 C: 델리카 베이커리 (영업 시작 / 관계 형성) ──
  const c = await prisma.salesClient.create({
    data: {
      name: '[샘플] 델리카 베이커리', bizNumber: '333-11-22222', stage: 'lead', createdById: uid,
      contacts: { create: [{ name: '최오너', position: '대표', title: '', phone: '010-5555-6666', email: 'ceo@delica.example', sortOrder: 0 }] },
    },
  });
  await prisma.salesJournal.create({
    data: {
      clientId: c.id, authorId: uid, title: '델리카 베이커리 신규 컨택', stage: 'lead', meetingDate: d(-1),
      meetingPurpose: '신규 거래 가능성 탐색',
      meetingSummary: '프리미엄 생지 수요 확인. 소개서 발송 예정.',
      todos: { create: [{ dueDate: d(4), content: '회사·제품 소개서 준비 및 발송', plan: '' }] },
    },
  });
  await prisma.salesJournal.create({
    data: {
      clientId: c.id, authorId: uid, title: '델리카 — 샘플 발송 후속', stage: 'contact', meetingDate: d(1),
      meetingPurpose: '샘플 발송 및 반응 확인',
      todos: { create: [{ dueDate: d(8), content: '샘플 제안 및 발송', plan: '' }] },
    },
  });

  const clientCount = await prisma.salesClient.count({ where: { name: { startsWith: '[샘플]' } } });
  const journalCount = await prisma.salesJournal.count();
  console.log(`샘플 시드 완료 — 거래처 ${clientCount}건, 전체 영업일지 ${journalCount}건`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('시드 실패:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
