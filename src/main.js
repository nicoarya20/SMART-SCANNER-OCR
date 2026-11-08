import { createWorker, PSM } from 'tesseract.js';
import './style.css';
import { extractVinCandidate, isValidVin, normalizeVinInput } from './vin.js';

const SSC_URL = 'https://ssc.toyota.astra.co.id/';
const MAX_IMAGE_EDGE = 2400;

const elements = {
  camera: document.querySelector('#camera'),
  preview: document.querySelector('#preview'),
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

const context = elements.preview.getContext('2d', { willReadFrequently: true });
let cameraStream = null;
let hasImage = false;
let toastTimeout = null;

function setCameraStatus(message) {
  elements.cameraStatus.textContent = message;
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

function showPreview() {
  elements.emptyPreview.hidden = true;
  elements.camera.hidden = true;
  elements.preview.hidden = false;
  hasImage = true;
  elements.readVin.disabled = false;
  updateProgressStep(2);
}

function drawImageToPreview(image) {
  const sourceWidth = image.videoWidth || image.naturalWidth || image.width;
  const sourceHeight = image.videoHeight || image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
  elements.preview.width = Math.round(sourceWidth * scale);
  elements.preview.height = Math.round(sourceHeight * scale);
  context.clearRect(0, 0, elements.preview.width, elements.preview.height);
  context.drawImage(image, 0, 0, elements.preview.width, elements.preview.height);
  showPreview();
}

async function startCamera() {
  stopCamera();

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
    elements.preview.hidden = true;
    elements.emptyPreview.hidden = true;
    elements.camera.hidden = false;
    elements.camera.srcObject = cameraStream;
    await elements.camera.play();
    elements.capturePhoto.disabled = false;
    setCameraStatus('Kamera aktif. Posisikan nomor rangka agar seluruh 17 karakter terlihat.');
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

  drawImageToPreview(elements.camera);
  stopCamera();
  setCameraStatus('Foto siap diproses. Lanjutkan dengan tombol baca nomor rangka.');
}

async function loadSelectedImage(event) {
  const [file] = event.target.files ?? [];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Pilih file gambar berformat JPG, PNG, atau format gambar lain.');
    return;
  }

  stopCamera();
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    drawImageToPreview(image);
    setCameraStatus('Foto siap diproses. Lanjutkan dengan tombol baca nomor rangka.');
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
  elements.readVin.disabled = isBusy || !hasImage;
  elements.startCamera.disabled = isBusy;
  elements.capturePhoto.disabled = isBusy || !cameraStream;
  elements.ocrProgress.hidden = !isBusy;
  if (isBusy) elements.ocrProgressBar.style.width = '0%';
}

async function recognizeVin() {
  if (!hasImage) return;

  setOcrBusy(true);
  elements.ocrStatus.textContent = 'Memuat mesin OCR...';

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
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    const { data } = await worker.recognize(elements.preview);
    const candidate = extractVinCandidate(data.text);

    if (candidate) {
      elements.vin.value = candidate;
      refreshVinState();
      elements.ocrStatus.textContent = 'VIN ditemukan. Mohon periksa semua karakter sebelum melanjutkan.';
      showToast('VIN terdeteksi. Cocokkan kembali dengan dokumen asli.');
      elements.vin.focus();
    } else {
      elements.ocrStatus.textContent = 'VIN 17 karakter belum ditemukan. Isi atau koreksi VIN secara manual.';
      showToast('OCR selesai, tetapi VIN belum terdeteksi dengan yakin.');
      elements.vin.focus();
    }
  } catch (error) {
    console.error('OCR error:', error);
    elements.ocrStatus.textContent = 'OCR gagal dijalankan. Coba foto yang lebih terang atau masukkan VIN secara manual.';
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
elements.readVin.addEventListener('click', recognizeVin);
elements.vin.addEventListener('input', refreshVinState);
elements.copyVin.addEventListener('click', copyVin);
elements.openSsc.addEventListener('click', copyAndOpenSsc);
window.addEventListener('pagehide', stopCamera);

refreshVinState();
