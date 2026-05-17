const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return filename;
}

function readImage(category, filename) {
  const dir = category === 'clipboard' ? imageDataDir : diaryImageDir;
  if (!dir) throw new Error('File service not initialized');

  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
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

module.exports = { initFileService, saveImage, readImage, deleteImage, getImagePath };
