// 데모/샘플 데이터 정리 — '[샘플]' 접두가 붙은 거래처와 그 하위 데이터(일지·명함·계획·할일)를 삭제한다.
// 실행: DATABASE_URL=... node scripts/purge-demo-data.js [--dry]
// 기본은 dry-run이 아니라 실제 삭제. --dry를 주면 대상만 출력한다.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PREFIX = '[샘플]';
const dry = process.argv.includes('--dry');

async function main() {
  const clients = await prisma.salesClient.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true, name: true, _count: { select: { journals: true, plans: true, contacts: true } } },
  });

  // 거래처에 안 묶인 채 제목/내용에만 [샘플]이 붙은 잔여 일지·계획도 함께 정리
  const orphanJournals = await prisma.salesJournal.findMany({
    where: { title: { startsWith: PREFIX }, clientId: { notIn: clients.map((c) => c.id) } },
    select: { id: true, title: true },
  });
  const orphanPlans = await prisma.salesPlan.findMany({
    where: { title: { startsWith: PREFIX }, clientId: { notIn: clients.map((c) => c.id) } },
    select: { id: true, title: true },
  });
  const demoProjects = await prisma.launchProject.findMany({
    where: { productName: { startsWith: PREFIX } },
    select: { id: true, productName: true, kind: true },
  });

  console.log(`대상 거래처 ${clients.length}건`);
  clients.forEach((c) =>
    console.log(`  - ${c.name} (일지 ${c._count.journals} / 계획 ${c._count.plans} / 명함 ${c._count.contacts})`),
  );
  console.log(`잔여 일지 ${orphanJournals.length}건, 잔여 계획 ${orphanPlans.length}건, 출시/단종 ${demoProjects.length}건`);

  if (dry) {
    console.log('--dry 모드: 실제 삭제하지 않음');
    return;
  }

  if (orphanJournals.length) {
    await prisma.salesJournal.deleteMany({ where: { id: { in: orphanJournals.map((j) => j.id) } } });
  }
  if (orphanPlans.length) {
    await prisma.salesPlan.deleteMany({ where: { id: { in: orphanPlans.map((p) => p.id) } } });
  }
  if (demoProjects.length) {
    await prisma.launchProject.deleteMany({ where: { id: { in: demoProjects.map((p) => p.id) } } });
  }
  if (clients.length) {
    const ids = clients.map((c) => c.id);
    // SalesPlan은 onDelete: SetNull이라 cascade로 지워지지 않는다 — 먼저 직접 삭제
    const p = await prisma.salesPlan.deleteMany({ where: { clientId: { in: ids } } });
    console.log(`샘플 거래처 소속 영업계획 ${p.count}건 삭제`);
    // journals/contacts/receivables는 onDelete: Cascade로 함께 제거됨
    await prisma.salesClient.deleteMany({ where: { id: { in: ids } } });
  }

  const left = await prisma.salesClient.count({ where: { name: { startsWith: PREFIX } } });
  console.log(`삭제 완료. 남은 [샘플] 거래처 ${left}건`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
