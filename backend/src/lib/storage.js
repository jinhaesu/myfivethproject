const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const isS3Configured = !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

let s3Client = null;
if (isS3Configured) {
  const config = {
    region: (process.env.S3_REGION || 'auto').toLowerCase(),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  };
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = true;
  }
  s3Client = new S3Client(config);
  console.log('S3 storage configured:', process.env.S3_BUCKET);
} else {
  console.log('S3 not configured, using local filesystem storage');
}

const BUCKET = process.env.S3_BUCKET;
const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  return types[ext] || 'application/octet-stream';
}

async function uploadFile(key, localFilePath, contentType) {
  if (isS3Configured) {
    try {
      const fileContent = fs.readFileSync(localFilePath);
      console.log(`S3 uploading: ${key} (${fileContent.length} bytes) to bucket ${BUCKET}`);
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
      }));
      console.log(`S3 upload success: ${key}`);
      // 로컬 임시 파일 삭제
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (error) {
      console.error('S3 upload error:', error.name, error.message);
      console.error('S3 config - Bucket:', BUCKET, 'Endpoint:', process.env.S3_ENDPOINT, 'Region:', process.env.S3_REGION);
      throw new Error(`S3 업로드 실패: ${error.name} - ${error.message}`);
    }
    return;
  }
  // 로컬 모드: multer가 이미 파일을 저장했으므로 추가 작업 없음
}

async function getFileStream(key) {
  if (isS3Configured) {
    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }));
      return {
        stream: response.Body,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }
  // 로컬 모드
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return {
    stream: fs.createReadStream(filePath),
    contentType: getMimeType(key),
    contentLength: fs.statSync(filePath).size,
  };
}

async function deleteFile(key) {
  if (isS3Configured) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }));
    } catch (error) {
      console.error('S3 delete error:', error);
    }
    return;
  }
  // 로컬 모드
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function fileExists(key) {
  if (isS3Configured) {
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }));
      return true;
    } catch {
      return false;
    }
  }
  // 로컬 모드
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  return fs.existsSync(filePath);
}

module.exports = {
  uploadFile,
  getFileStream,
  deleteFile,
  fileExists,
  isS3Configured,
};
