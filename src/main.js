import { createWorker, PSM } from 'tesseract.js';
import './style.css';
import { DEFAULT_CROP, cropToPixels, moveCrop, resizeCrop } from './crop.js';
import { extractVinCandidate, isValidVin, normalizeVinInput } from './vin.js';

const SSC_URL = 'https://ssc.toyota.astra.co.id/';
const MAX_IMAGE_EDGE = 2400;
const OCR_TARGET_HEIGHT = 220;
const OCR_PADDING = 24;

const elements = {
  cameraFrame: document.querySelector('#cameraFrame'),
  camera: document.querySelector('#camera'),
  preview: document.querySelector('#preview'),
  cropWorkspace: document.querySelector('#cropWorkspace'),
  cropSelection: document.querySelector('#cropSelection'),
  cropPanel: document.querySelector('#cropPanel'),
  confirmCrop: document.querySelector('#confirmCrop'),
  resetCrop: document.querySelector('#resetCrop'),
  cropStatus: document.querySelector('#cropStatus'),
  emptyPreview: document.querySelector('#emptyPreview'),
  startCamera: document.querySelector('#startCamera'),
  capturePhoto: document.querySelector('#capturePhoto'),
  imageFile: document.querySelector('#imageFile'),
  cameraStatus: document.querySelector('#cameraStatus'),
  readVin: document.querySelector('#readVin'),
  ocrProgress: document.querySelector('#ocrProgress'),
  ocrProgressBar: document.querySelector('#ocrProgressBar'),
  ocrStatus: document.querySelector('#ocrStatus'),
  vin: document.querySelector('#vin'),
  validation: document.querySelector('#vinValidation'),
  validIcon: document.querySelector('#validIcon'),
  copyVin: document.querySelector('#copyVin'),
  openSsc: document.querySelector('#openSsc'),
  toast: document.querySelector('#toast'),
};

const previewContext = elements.preview.getContext('2d', { willReadFrequently: true });
const sourceCanvas = document.createElement('canvas');
const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
let cameraStream = null;
let hasImage = false;
let cropCommitted = false;
let ocrCanvas = null;
let crop = { ...DEFAULT_CROP };
let activeCropAction = null;
let toastTimeout = null;

function setCameraStatus(message) {
  elements.cameraStatus.textContent = message;
}

function setCropStatus(message) {
  elements.cropStatus.textContent = message;
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimeout = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3600);
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  elements.camera.srcObject = null;
  elements.camera.hidden = true;
  elements.capturePhoto.disabled = true;
}

function updateProgressStep(step) {
  document.querySelectorAll('.progress-steps__item').forEach((item, index) => {
    item.classList.toggle('is-active', index === step - 1);
    item.classList.toggle('is-complete', index < step - 1);
  });
}

function refreshVinState() {
  const normalized = normalizeVinInput(elements.vin.value);
  elements.vin.value = normalized;

  const valid = isValidVin(normalized);
  elements.copyVin.disabled = !valid;
  elements.openSsc.disabled = !valid;
  elements.validIcon.hidden = !valid;
  elements.vin.setAttribute('aria-invalid', String(!valid && normalized.length > 0));
  elements.validation.classList.toggle('validation-message--valid', valid);
  elements.validation.classList.toggle('validation-message--error', !valid && normalized.length > 0);

  if (valid) {
    elements.validation.textContent = 'Format VIN valid. Tetap cocokkan setiap karakter dengan dokumen asli.';
    updateProgressStep(3);
  } else if (normalized.length === 0) {
    elements.validation.textContent = 'Masukkan 17 karakter VIN untuk melanjutkan.';
  } else if (/[IOQ]/.test(normalized)) {
    elements.validation.textContent = 'VIN tidak boleh mengandung huruf I, O, atau Q.';
  } else {
    elements.validation.textContent = `VIN harus terdiri dari 17 karakter. Saat ini ${normalized.length} karakter.`;
  }

  return valid;
}

function renderCropSelection() {
  elements.cropSelection.style.left = `${crop.x * 100}%`;
  elements.cropSelection.style.top = `${crop.y * 100}%`;
  elements.cropSelection.style.width = `${crop.width * 100}%`;
  elements.cropSelection.style.height = `${crop.height * 100}%`;
}

function invalidateCrop(message = 'Area berubah. Tekan “Gunakan area ini” untuk menyiapkan OCR.') {
  cropCommitted = false;
  ocrCanvas = null;
  elements.readVin.disabled = true;
  elements.cropSelection.classList.remove('is-confirmed');
  setCropStatus(message);
}

function resetCropSelection() {
  crop = { ...DEFAULT_CROP };
  renderCropSelection();
  invalidateCrop('Kotak dipulihkan. Sesuaikan kembali agar hanya mencakup nomor rangka.');
}

function resetCaptureState() {
  hasImage = false;
  cropCommitted = false;
  ocrCanvas = null;
  elements.readVin.disabled = true;
  elements.cropPanel.hidden = true;
  elements.cropWorkspace.hidden = true;
  elements.cameraFrame.classList.remove('is-cropping');
  elements.cropSelection.classList.remove('is-confirmed');
}

function openCropEditor() {
  elements.emptyPreview.hidden = true;
  elements.camera.hidden = true;
  elements.cropWorkspace.hidden = false;
  elements.cropPanel.hidden = false;
  elements.cameraFrame.classList.add('is-cropping');
  hasImage = true;
  crop = { ...DEFAULT_CROP };
  renderCropSelection();
  invalidateCrop('Geser kotak merah hingga hanya mencakup baris nomor rangka.');
  updateProgressStep(1);
}

function drawImageToEditor(image) {
  const sourceWidth = image.videoWidth || image.naturalWidth || image.width;
  const sourceHeight = image.videoHeight || image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
  sourceCanvas.width = Math.round(sourceWidth * scale);
  sourceCanvas.height = Math.round(sourceHeight * scale);
  sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);

  elements.preview.width = sourceCanvas.width;
  elements.preview.height = sourceCanvas.height;
  previewContext.clearRect(0, 0, elements.preview.width, elements.preview.height);
  previewContext.drawImage(sourceCanvas, 0, 0);
  openCropEditor();
}

function buildOcrCanvas() {
  const source = cropToPixels(crop, sourceCanvas.width, sourceCanvas.height);
  const scale = Math.min(4, Math.max(1, OCR_TARGET_HEIGHT / source.height));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  canvas.width = width + OCR_PADDING * 2;
  canvas.height = height + OCR_PADDING * 2;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    sourceCanvas,
    source.x,
    source.y,
    source.width,
    source.height,
    OCR_PADDING,
    OCR_PADDING,
    width,
    height,
  );

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance = (
      imageData.data[index] * 0.2126
      + imageData.data[index + 1] * 0.7152
      + imageData.data[index + 2] * 0.0722
    );
    const enhanced = Math.max(0, Math.min(255, (luminance - 128) * 1.42 + 128));
    imageData.data[index] = enhanced;
    imageData.data[index + 1] = enhanced;
    imageData.data[index + 2] = enhanced;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function confirmCrop() {
  if (!hasImage) return;

  ocrCanvas = buildOcrCanvas();
  cropCommitted = true;
  elements.cropSelection.classList.add('is-confirmed');
  elements.readVin.disabled = false;
  setCropStatus('Area VIN siap. Lanjutkan ke langkah 2 untuk membaca nomor rangka.');
  updateProgressStep(2);
}

function getCropPoint(event) {
  const bounds = elements.cropWorkspace.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  };
}

function startCropInteraction(event) {
  if (!hasImage) return;
  event.preventDefault();
  const handle = event.target.closest('[data-handle]')?.dataset.handle;
  activeCropAction = {
    mode: handle ? 'resize' : 'move',
    handle,
    startCrop: { ...crop },
    startPoint: getCropPoint(event),
  };
  elements.cropSelection.setPointerCapture(event.pointerId);
  elements.cropSelection.focus({ preventScroll: true });
}

function moveCropInteraction(event) {
  if (!activeCropAction) return;
  const point = getCropPoint(event);
  if (activeCropAction.mode === 'move') {
    crop = moveCrop(
      activeCropAction.startCrop,
      point.x - activeCropAction.startPoint.x,
      point.y - activeCropAction.startPoint.y,
    );
  } else {
    crop = resizeCrop(activeCropAction.startCrop, activeCropAction.handle, point);
  }
  renderCropSelection();
  invalidateCrop();
}

function endCropInteraction(event) {
  if (activeCropAction && elements.cropSelection.hasPointerCapture(event.pointerId)) {
    elements.cropSelection.releasePointerCapture(event.pointerId);
  }
  activeCropAction = null;
}

function nudgeCrop(event) {
  const moves = {
    ArrowLeft: [-0.01, 0],
    ArrowRight: [0.01, 0],
    ArrowUp: [0, -0.01],
    ArrowDown: [0, 0.01],
  };
  const delta = moves[event.key];
  if (!delta || !hasImage) return;
  event.preventDefault();
  crop = moveCrop(crop, ...delta);
  renderCropSelection();
  invalidateCrop();
}

async function startCamera() {
  stopCamera();
  resetCaptureState();

  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraStatus('Browser ini belum mendukung kamera. Silakan unggah foto dokumen.');
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    elements.emptyPreview.hidden = true;
    elements.camera.hidden = false;
    elements.camera.srcObject = cameraStream;
    await elements.camera.play();
    elements.capturePhoto.disabled = false;
    setCameraStatus('Kamera aktif. Foto dokumen dari arah lurus, lalu potong khusus nomor rangka.');
  } catch (error) {
    const message = error.name === 'NotAllowedError'
      ? 'Izin kamera ditolak. Izinkan kamera di browser atau gunakan unggah foto.'
      : `Kamera tidak dapat dibuka. ${error.message}`;
    setCameraStatus(message);
  }
}

function capturePhoto() {
  if (!elements.camera.videoWidth || !elements.camera.videoHeight) {
    setCameraStatus('Kamera belum siap. Coba tunggu sebentar lalu ambil foto lagi.');
    return;
  }

  drawImageToEditor(elements.camera);
  stopCamera();
  setCameraStatus('Foto siap. Potong area nomor rangka sebelum menjalankan OCR.');
}

function loadSelectedImage(event) {
  const [file] = event.target.files ?? [];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Pilih file gambar berformat JPG, PNG, atau format gambar lain.');
    return;
  }

  stopCamera();
  resetCaptureState();
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    drawImageToEditor(image);
    setCameraStatus('Foto siap. Potong area nomor rangka sebelum menjalankan OCR.');
    URL.revokeObjectURL(objectUrl);
  };
  image.onerror = () => {
    showToast('File gambar tidak dapat dibaca. Pilih foto lain.');
    URL.revokeObjectURL(objectUrl);
  };
  image.src = objectUrl;
  event.target.value = '';
}

function setOcrBusy(isBusy) {
  elements.readVin.disabled = isBusy || !cropCommitted;
  elements.startCamera.disabled = isBusy;
  elements.capturePhoto.disabled = isBusy || !cameraStream;
  elements.confirmCrop.disabled = isBusy;
  elements.resetCrop.disabled = isBusy;
  elements.cropSelection.classList.toggle('is-disabled', isBusy);
  elements.ocrProgress.hidden = !isBusy;
  if (isBusy) elements.ocrProgressBar.style.width = '0%';
}

async function recognizeVin() {
  if (!cropCommitted || !ocrCanvas) {
    showToast('Potong dan gunakan area nomor rangka terlebih dahulu.');
    return;
  }

  setOcrBusy(true);
  elements.ocrStatus.textContent = 'Menyiapkan area nomor rangka...';

  let worker;
  try {
    worker = await createWorker('eng', 1, {
      logger: (message) => {
        if (message.progress == null) return;
        const percent = Math.round(message.progress * 100);
        elements.ocrProgressBar.style.width = `${percent}%`;
        elements.ocrStatus.textContent = `${message.status} ${percent}%`;
      },
    });
    const modes = [PSM.SINGLE_LINE, PSM.RAW_LINE];
    const candidates = [];

    for (const [index, mode] of modes.entries()) {
      elements.ocrStatus.textContent = index === 0
        ? 'Membaca baris VIN...'
        : 'Memeriksa pembacaan alternatif...';
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        tessedit_pageseg_mode: mode,
      });
      const { data } = await worker.recognize(ocrCanvas);
      const candidate = extractVinCandidate(data.text);
      if (candidate) candidates.push(candidate);
    }

    const candidate = candidates[0];
    if (candidate) {
      elements.vin.value = candidate;
      refreshVinState();
      elements.ocrStatus.textContent = 'VIN ditemukan dari area yang dipilih. Periksa semua karakter sebelum melanjutkan.';
      showToast('VIN terdeteksi. Cocokkan kembali dengan dokumen asli.');
      elements.vin.focus();
    } else {
      elements.ocrStatus.textContent = 'VIN 17 karakter belum ditemukan. Perbesar atau sesuaikan crop, lalu coba lagi.';
      showToast('OCR belum yakin. Sesuaikan area crop agar lebih rapat di sekitar VIN.');
      elements.cropSelection.focus({ preventScroll: true });
    }
  } catch (error) {
    console.error('OCR error:', error);
    elements.ocrStatus.textContent = 'OCR gagal dijalankan. Sesuaikan area crop atau masukkan VIN secara manual.';
    showToast('OCR gagal. Pastikan koneksi internet tersedia saat OCR pertama kali digunakan.');
  } finally {
    if (worker) await worker.terminate();
    setOcrBusy(false);
  }
}

async function copyVin() {
  if (!refreshVinState()) return false;

  try {
    await navigator.clipboard.writeText(elements.vin.value);
  } catch {
    elements.vin.focus();
    elements.vin.select();
    const copied = document.execCommand('copy');
    if (!copied) {
      showToast('VIN belum dapat disalin. Silakan salin secara manual.');
      return false;
    }
  }

  showToast('VIN sudah disalin. Tempelkan di situs SSC Toyota.');
  return true;
}

async function copyAndOpenSsc() {
  if (!refreshVinState()) return;
  window.open(SSC_URL, '_blank', 'noopener,noreferrer');
  const copied = await copyVin();

  if (!copied) {
    showToast('SSC Toyota sudah dibuka. Salin VIN secara manual bila diperlukan.');
  }
}

if (!window.isSecureContext && window.location.hostname !== 'localhost') {
  setCameraStatus('Agar kamera aktif, buka web-app ini melalui HTTPS. Anda tetap dapat mengunggah foto.');
}

elements.startCamera.addEventListener('click', startCamera);
elements.capturePhoto.addEventListener('click', capturePhoto);
elements.imageFile.addEventListener('change', loadSelectedImage);
elements.confirmCrop.addEventListener('click', confirmCrop);
elements.resetCrop.addEventListener('click', resetCropSelection);
elements.cropSelection.addEventListener('pointerdown', startCropInteraction);
elements.cropSelection.addEventListener('pointermove', moveCropInteraction);
elements.cropSelection.addEventListener('pointerup', endCropInteraction);
elements.cropSelection.addEventListener('pointercancel', endCropInteraction);
elements.cropSelection.addEventListener('keydown', nudgeCrop);
elements.readVin.addEventListener('click', recognizeVin);
elements.vin.addEventListener('input', refreshVinState);
elements.copyVin.addEventListener('click', copyVin);
elements.openSsc.addEventListener('click', copyAndOpenSsc);
window.addEventListener('pagehide', stopCamera);

refreshVinState();
