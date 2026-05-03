require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { execSync } = require('child_process');
const authRoutes = require('./routes/auth');
const labelRoutes = require('./routes/labels');
const reviewRoutes = require('./routes/reviews');
const aiRoutes = require('./routes/ai');
const uploadRoutes = require('./routes/uploads');

const app = express();
const PORT = process.env.PORT || 8080;

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(u => u.trim().replace(/\/+$/, ''))
  : ['http://localhost:3000'];

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.warn('[CORS] FRONTEND_URL 환경변수가 비어 있습니다. 프로덕션 도메인이 차단될 수 있습니다.');
}

console.log('Allowed CORS origins:', allowedOrigins);
console.log('PORT:', PORT);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// AI 라우트는 Anthropic 호출이 길 수 있으므로 응답 timeout 늘림 (5분)
app.use('/api/ai', (req, res, next) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/uploads', uploadRoutes); // express.static 폴백: 파일 서빙 API 라우트

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/uploads', uploadRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

// 서버를 먼저 시작하고, 그 후 마이그레이션 실행
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);

  // 서버 시작 후 마이그레이션 실행
  try {
    console.log('Running database migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('Migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
  }
});
