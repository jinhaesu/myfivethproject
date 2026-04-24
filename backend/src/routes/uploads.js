const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const storage = require('../lib/storage');
// pdfMask 모듈은 lazy + try-catch (native 모듈 누락 시 마스킹 비활성, 서버는 시작)
let createMaskedReportPdf = null;
let applyManualMask = null;
let pdfToImages = null;
try {
  ({ createMaskedReportPdf, applyManualMask } = require('../lib/pdfMask'));
} catch (e) {
  console.error('[Upload] pdfMask 로드 실패 (마스킹 비활성):', e.message);
}
try {
  ({ pdfToImages } = require('../lib/pdfToImages'));
} catch (e) {
  console.error('[Upload] pdfToImages 로드 실패:', e.message);
}

const router = express.Router();
const prisma = new PrismaClient();

// 로컬 임시 uploads 디렉토리 생성 (multer 임시 저장용)
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'designs');
const reportDir = path.join(__dirname, '..', '..', 'uploads', 'manufacturing-reports');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

// multer 설정 - PDF/이미지 파일만 허용
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `design-${uniqueSuffix}${ext}`);
  },
});

const reportMulterStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, reportDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `report-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('PDF 또는 이미지 파일(PNG, JPG, WebP)만 업로드 가능합니다.'), false);
  }
};

const reportFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('품목제조보고서는 PDF 파일만 업로드 가능합니다.'), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const reportUpload = multer({
  storage: reportMulterStorage,
  fileFilter: reportFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// 디자인 파일 업로드
router.post('/:labelId/design', authenticate, upload.single('designFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일을 선택해주세요.' });
    }

    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    // 기존 파일 삭제 (S3 또는 로컬)
    if (label.designFileUrl) {
      const oldKey = label.designFileUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(oldKey); } catch (e) { console.error('Failed to delete old file:', e); }
    }

    const s3Key = `designs/${req.file.filename}`;
    const fileUrl = `/uploads/designs/${req.file.filename}`;

    // S3에 업로드 (S3 미설정 시 로컬 유지)
    await storage.uploadFile(s3Key, req.file.path, req.file.mimetype);

    const updated = await prisma.label.update({
      where: { id: req.params.labelId },
      data: {
        designFileUrl: fileUrl,
        designFileName: req.file.originalname,
        designUploadedAt: new Date(),
      },
    });

    res.json({
      designFileUrl: updated.designFileUrl,
      designFileName: updated.designFileName,
      designUploadedAt: updated.designUploadedAt,
    });
  } catch (error) {
    console.error('Design file upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message || '파일 업로드에 실패했습니다.' });
  }
});

// 품목제조보고서 PDF 업로드
router.post('/:labelId/manufacturing-report', authenticate, reportUpload.single('reportFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF 파일을 선택해주세요.' });
    }

    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    if (label.manufacturingReportUrl) {
      const oldKey = label.manufacturingReportUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(oldKey); } catch (e) { console.error('Failed to delete old report:', e); }
    }
    if (label.manufacturingReportMaskedUrl) {
      const oldKey = label.manufacturingReportMaskedUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(oldKey); } catch (e) { console.error('Failed to delete old masked:', e); }
    }

    const s3Key = `manufacturing-reports/${req.file.filename}`;
    const fileUrl = `/uploads/manufacturing-reports/${req.file.filename}`;

    // 원본 업로드
    await storage.uploadFile(s3Key, req.file.path, req.file.mimetype);

    // 마스킹된 버전 생성 시도
    let maskedFileUrl = null;
    try {
      if (!createMaskedReportPdf) throw new Error('createMaskedReportPdf 모듈 로드 안 됨');
      console.log(`[Mask] Processing ${req.file.originalname}...`);
      const inputBuffer = fs.readFileSync(req.file.path);
      const result = await createMaskedReportPdf(inputBuffer);
      console.log(`[Mask] Stats:`, result.stats);

      if (result.stats.totalMasked > 0) {
        const maskedFilename = req.file.filename.replace(/\.pdf$/i, '-masked.pdf');
        const maskedPath = path.join(reportDir, maskedFilename);
        fs.writeFileSync(maskedPath, result.maskedBuffer);
        const maskedKey = `manufacturing-reports/${maskedFilename}`;
        maskedFileUrl = `/uploads/manufacturing-reports/${maskedFilename}`;
        await storage.uploadFile(maskedKey, maskedPath, 'application/pdf');
        console.log(`[Mask] Saved masked PDF: ${maskedFilename} (${result.stats.totalMasked} cells)`);
      } else if (result.stats.totalTextItems === 0) {
        console.log(`[Mask] PDF has no extractable text layer (likely scanned image)`);
      } else if (result.stats.pagesWithKeyword === 0) {
        console.log(`[Mask] PDF has no "배합비율" keyword on any page`);
      }
    } catch (maskErr) {
      console.error(`[Mask] Failed:`, maskErr.message);
    }

    const updated = await prisma.label.update({
      where: { id: req.params.labelId },
      data: {
        manufacturingReportUrl: fileUrl,
        manufacturingReportMaskedUrl: maskedFileUrl,
        manufacturingReportMaskingLocked: false, // 새 업로드 시 마스킹 잠금 해제
        manufacturingReportName: req.file.originalname,
        manufacturingReportUploadedAt: new Date(),
        // 새 보고서 업로드 시 기존 추출/검토 결과 초기화
        aiReportExtraction: null,
        aiDesignReview: null,
        aiDesignReviewedAt: null,
      },
    });

    res.json({
      manufacturingReportUrl: updated.manufacturingReportUrl,
      manufacturingReportMaskedUrl: updated.manufacturingReportMaskedUrl,
      manufacturingReportName: updated.manufacturingReportName,
      manufacturingReportUploadedAt: updated.manufacturingReportUploadedAt,
    });
  } catch (error) {
    console.error('Manufacturing report upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message || '품목제조보고서 업로드에 실패했습니다.' });
  }
});

// 품목제조보고서 페이지 이미지 (수동 마스킹 UI용)
// 응답: 페이지별 PNG base64 + 이미지/PDF dimensions
router.get('/:labelId/manufacturing-report/page-images', authenticate, async (req, res) => {
  try {
    if (!pdfToImages) return res.status(500).json({ error: 'PDF 변환 모듈을 사용할 수 없습니다.' });

    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label?.manufacturingReportUrl) {
      return res.status(404).json({ error: '품목제조보고서가 없습니다.' });
    }

    const key = label.manufacturingReportUrl.replace(/^\/uploads\//, '');
    const file = await storage.getFileBuffer(key);
    if (!file) return res.status(404).json({ error: 'PDF 파일을 불러올 수 없습니다.' });

    const images = await pdfToImages(file.buffer, { scale: 2.0, maxPages: 8, maxLongEdgePx: 1800 });

    res.json({
      pages: images.map((img) => ({
        pageNum: img.pageNum,
        imageBase64: `data:image/png;base64,${img.buffer.toString('base64')}`,
        renderedWidth: img.width,
        renderedHeight: img.height,
      })),
    });
  } catch (error) {
    console.error('Page images error:', error);
    res.status(500).json({ error: error.message || '페이지 이미지 생성에 실패했습니다.' });
  }
});

// 품목제조보고서 수동 마스킹 적용 (영구, 잠금)
// Body: { pageRects: [{ page, x, y, width, height, renderedWidth, renderedHeight }] }
router.post('/:labelId/manufacturing-report/apply-mask', authenticate, async (req, res) => {
  try {
    if (!applyManualMask) return res.status(500).json({ error: '마스킹 모듈을 사용할 수 없습니다.' });

    const { pageRects } = req.body;
    if (!Array.isArray(pageRects) || pageRects.length === 0) {
      return res.status(400).json({ error: '마스킹 영역이 1개 이상 필요합니다.' });
    }

    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label?.manufacturingReportUrl) {
      return res.status(404).json({ error: '품목제조보고서가 없습니다.' });
    }
    if (label.manufacturingReportMaskingLocked) {
      return res.status(409).json({ error: '이미 마스킹이 영구 적용되어 변경할 수 없습니다.' });
    }

    const key = label.manufacturingReportUrl.replace(/^\/uploads\//, '');
    const file = await storage.getFileBuffer(key);
    if (!file) return res.status(404).json({ error: '원본 PDF를 불러올 수 없습니다.' });

    console.log(`[Manual Mask] Applying ${pageRects.length} rects on ${label.manufacturingReportName}`);
    const maskedBuffer = await applyManualMask(file.buffer, pageRects);

    // 기존 마스킹 파일 삭제
    if (label.manufacturingReportMaskedUrl) {
      const oldKey = label.manufacturingReportMaskedUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(oldKey); } catch (e) { console.error('old masked delete failed:', e.message); }
    }

    // 새 마스킹 파일 저장
    const baseName = path.basename(key, path.extname(key));
    const maskedFilename = `${baseName}-masked.pdf`;
    const maskedPath = path.join(reportDir, maskedFilename);
    fs.writeFileSync(maskedPath, maskedBuffer);
    const maskedKey = `manufacturing-reports/${maskedFilename}`;
    const maskedUrl = `/uploads/manufacturing-reports/${maskedFilename}`;
    await storage.uploadFile(maskedKey, maskedPath, 'application/pdf');

    const updated = await prisma.label.update({
      where: { id: req.params.labelId },
      data: {
        manufacturingReportMaskedUrl: maskedUrl,
        manufacturingReportMaskingLocked: true,
      },
    });

    res.json({
      manufacturingReportMaskedUrl: updated.manufacturingReportMaskedUrl,
      manufacturingReportMaskingLocked: updated.manufacturingReportMaskingLocked,
      maskedRectCount: pageRects.length,
    });
  } catch (error) {
    console.error('Apply mask error:', error);
    res.status(500).json({ error: error.message || '마스킹 적용에 실패했습니다.' });
  }
});

// 품목제조보고서 PDF 삭제
router.delete('/:labelId/manufacturing-report', authenticate, async (req, res) => {
  try {
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) {
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    if (label.manufacturingReportUrl) {
      const key = label.manufacturingReportUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(key); } catch (e) { console.error('Failed to delete report:', e); }
    }

    await prisma.label.update({
      where: { id: req.params.labelId },
      data: {
        manufacturingReportUrl: null,
        manufacturingReportName: null,
        manufacturingReportUploadedAt: null,
      },
    });

    res.json({ message: '품목제조보고서가 삭제되었습니다.' });
  } catch (error) {
    console.error('Manufacturing report delete error:', error);
    res.status(500).json({ error: '품목제조보고서 삭제에 실패했습니다.' });
  }
});

// 품목제조보고서 PDF 조회
router.get('/manufacturing-reports/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const key = `manufacturing-reports/${filename}`;

  try {
    const result = await storage.getFileStream(key);
    if (!result) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    res.setHeader('Content-Type', result.contentType);
    if (result.contentLength) {
      res.setHeader('Content-Length', result.contentLength);
    }
    result.stream.pipe(res);
  } catch (error) {
    console.error('Report serving error:', error);
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
});

router.head('/manufacturing-reports/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const key = `manufacturing-reports/${filename}`;
  try {
    const exists = await storage.fileExists(key);
    if (!exists) return res.status(404).end();
    res.status(200).end();
  } catch {
    return res.status(404).end();
  }
});

// 디자인 파일 조회 (S3 또는 로컬 스트리밍)
router.get('/designs/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename); // path traversal 방지
  const key = `designs/${filename}`;

  try {
    const result = await storage.getFileStream(key);
    if (!result) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    res.setHeader('Content-Type', result.contentType);
    if (result.contentLength) {
      res.setHeader('Content-Length', result.contentLength);
    }
    result.stream.pipe(res);
  } catch (error) {
    console.error('File serving error:', error);
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
});

// HEAD 요청 지원 (프론트엔드 파일 존재 확인용)
router.head('/designs/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const key = `designs/${filename}`;

  try {
    const exists = await storage.fileExists(key);
    if (!exists) {
      return res.status(404).end();
    }
    res.status(200).end();
  } catch {
    return res.status(404).end();
  }
});

// 디자인 파일 삭제
router.delete('/:labelId/design', authenticate, async (req, res) => {
  try {
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) {
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    if (label.designFileUrl) {
      const key = label.designFileUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(key); } catch (e) { console.error('Failed to delete file:', e); }
    }

    await prisma.label.update({
      where: { id: req.params.labelId },
      data: {
        designFileUrl: null,
        designFileName: null,
        designUploadedAt: null,
      },
    });

    res.json({ message: '디자인 파일이 삭제되었습니다.' });
  } catch (error) {
    console.error('Design file delete error:', error);
    res.status(500).json({ error: '파일 삭제에 실패했습니다.' });
  }
});

module.exports = router;
