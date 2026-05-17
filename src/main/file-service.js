const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SAFE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

let imageDataDir = null;
let diaryImageDir = null;

function initFileService(dataDir) {
  imageDataDir = path.join(dataDir, 'images', 'clipboard');
  diaryImageDir = path.join(dataDir, 'images', 'diary');

  if (!fs.existsSync(imageDataDir)) {
    fs.mkdirSync(imageDataDir, { recursive: true });
  }
  if (!fs.existsSync(diaryImageDir)) {
    fs.mkdirSync(diaryImageDir, { recursive: true });
  }
}

function saveImage(category, buffer, ext = 'png') {
  const dir = category === 'clipboard' ? imageDataDir : diaryImageDir;
  if (!dir) throw new Error('File service not initialized');

  const safeExt = SAFE_EXTS.includes(ext) ? ext : 'png';
  const filename = `${crypto.randomUUID()}.${safeExt}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return filename;
}

function deleteImage(category, filename) {
  const dir = category === 'clipboard' ? imageDataDir : diaryImageDir;
  if (!dir) throw new Error('File service not initialized');

  const filePath = path.join(dir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function getImagePath(category, filename) {
  const dir = category === 'clipboard' ? imageDataDir : diaryImageDir;
  return path.join(dir, filename);
}

module.exports = { initFileService, saveImage, deleteImage, getImagePath };
