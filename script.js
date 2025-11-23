// ---------------------------
// Element references 
// ---------------------------
const html = document.documentElement;

const nameInput = document.getElementById('name');
const recentStudentsDatalist = document.getElementById('recentStudents');

const teacherSelect = document.getElementById('teacherSelect');
const teacherEmailInput = document.getElementById('teacherEmail');
const customTeacherGroup = document.getElementById('customTeacherGroup');
const customTeacherNameInput = document.getElementById('customTeacherName');
const copyEmailBtn = document.getElementById('copyEmailBtn');

const subjectSelect = document.getElementById('subjectSelect');
const projectSelect = document.getElementById('projectSelect');
const customProjectGroup = document.getElementById('customProjectGroup');
const customProjectInput = document.getElementById('customProjectInput');

const customTextInput = document.getElementById('subject'); // custom stamp text
const overlayTextEl = document.getElementById('overlayText');

const canvas = document.getElementById('canvas');
const video = document.getElementById('video');
const previewImg = document.getElementById('preview');

const fileInput = document.getElementById('fileInput');
const fileStampBtn = document.getElementById('fileStampBtn');
const shootBtn = document.getElementById('shootBtn');
const flipBtn = document.getElementById('flipBtn');
const shareBtn = document.getElementById('shareBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');

const initBtn = document.getElementById('initBtn');
const helpBtn = document.getElementById('helpBtn');
const themeBtn = document.getElementById('themeBtn');
const installBtn = document.getElementById('installBtn');

const toastEl = document.getElementById('toast');
const tipsDialog = document.getElementById('tipsDialog');
const teacherListEl = document.getElementById('teacherList');

// ---------------------------
// State
// ---------------------------
const THEME_KEY = 'phs-photo-theme';
const STUDENTS_KEY = 'phs-photo-recent-students';
const STATE_KEY = 'phs-photo-last-state';

let selections = {
  teachers: [],
  subjects: [],
  projects: []
};

let stream = null;
let videoDevices = [];
let currentDeviceIndex = 0;
let currentFacingMode = 'environment';

let lastBlob = null;
let lastMeta = null;
let lastObjectUrl = null;

let deferredPrompt = null;
let recentStudents = [];

// ---------------------------
// Helpers
// ---------------------------
function showToast(message, ok = true, duration = 2400) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (!ok) {
    toastEl.style.background = 'rgba(185, 28, 28, 0.98)';
  } else {
    toastEl.style.background = 'rgba(15, 23, 42, 0.95)';
  }

  setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'auto';
}

function setTheme(theme) {
  html.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = getTheme();
  const next = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
  setTheme(next);
  showToast(`Theme: ${next}`);
}

// ---------------------------
// Persistence: recent students + last state
// ---------------------------
function loadRecentStudents() {
  try {
    const raw = localStorage.getItem(STUDENTS_KEY);
    if (raw) {
      recentStudents = JSON.parse(raw);
    } else {
      recentStudents = [];
    }
  } catch {
    recentStudents = [];
  }
  renderRecentStudents();
}

function saveRecentStudents() {
  try {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(recentStudents.slice(0, 20)));
  } catch (e) {
    console.warn('Could not save recent students', e);
  }
}

function addRecentStudent(name) {
  if (!name) return;
  const existingIndex = recentStudents.indexOf(name);
  if (existingIndex >= 0) {
    recentStudents.splice(existingIndex, 1);
  }
  recentStudents.unshift(name);
  saveRecentStudents();
  renderRecentStudents();
}

function renderRecentStudents() {
  if (!recentStudentsDatalist) return;
  recentStudentsDatalist.innerHTML = '';
  recentStudents.forEach((n) => {
    const option = document.createElement('option');
    option.value = n;
    recentStudentsDatalist.appendChild(option);
  });
}

function saveState() {
  const state = {
    name: nameInput?.value || '',
    teacherId: teacherSelect?.value || '',
    teacherEmail: teacherEmailInput?.value || '',
    customTeacherName: customTeacherNameInput?.value || '',
    subjectId: subjectSelect?.value || '',
    projectId: projectSelect?.value || '',
    customProject: customProjectInput?.value || '',
    customText: customTextInput?.value || ''
  };
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (nameInput && state.name) nameInput.value = state.name;
    if (teacherEmailInput && state.teacherEmail) teacherEmailInput.value = state.teacherEmail;
    if (customTeacherNameInput && state.customTeacherName) customTeacherNameInput.value = state.customTeacherName;
    if (customProjectInput && state.customProject) customProjectInput.value = state.customProject;
    if (customTextInput && state.customText) customTextInput.value = state.customText;

    // selects applied after selections are loaded
    return state;
  } catch {
    return null;
  }
}

// ---------------------------
// Selections (teachers / subjects / projects)
// ---------------------------
async function loadSelections() {
  try {
    const res = await fetch('selections.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load selections');
    selections = await res.json();
  } catch (e) {
    console.error(e);
    showToast('Could not load teachers/subjects.', false);
    selections = { teachers: [], subjects: [], projects: [] };
  }

  populateTeachers();
  populateSubjects();
  const lastState = loadState();
  if (lastState) {
    if (subjectSelect && lastState.subjectId) {
      subjectSelect.value = lastState.subjectId;
      populateProjects(lastState.subjectId);
    } else {
      populateProjects(subjectSelect?.value || '');
    }
    if (projectSelect && lastState.projectId) {
      projectSelect.value = lastState.projectId;
    }
    if (teacherSelect && lastState.teacherId) {
      teacherSelect.value = lastState.teacherId;
      updateTeacherFromSelect();
    }
  } else {
    populateProjects(subjectSelect?.value || '');
  }

  renderTeacherList();
  updateOverlay();
}

function populateTeachers() {
  if (!teacherSelect) return;
  teacherSelect.innerHTML = '';

  // Normal teachers
  selections.teachers.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    teacherSelect.appendChild(opt);
  });

  // Divider-ish
  const optDivider = document.createElement('option');
  optDivider.disabled = true;
  optDivider.textContent = '──────────';
  teacherSelect.appendChild(optDivider);

  // Custom teacher option
  const optCustom = document.createElement('option');
  optCustom.value = '__custom';
  optCustom.textContent = 'Other teacher (custom)';
  teacherSelect.appendChild(optCustom);

  teacherSelect.value = selections.teachers[0]?.id || '';
}

function populateSubjects() {
  if (!subjectSelect) return;
  subjectSelect.innerHTML = '';

  selections.subjects.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label;
    subjectSelect.appendChild(opt);
  });

  const optDivider = document.createElement('option');
  optDivider.disabled = true;
  optDivider.textContent = '──────────';
  subjectSelect.appendChild(optDivider);

  const optCustom = document.createElement('option');
  optCustom.value = '__custom';
  optCustom.textContent = 'Other subject / context';
  subjectSelect.appendChild(optCustom);

  subjectSelect.value = selections.subjects[0]?.id || '';
}

function populateProjects(subjectId) {
  if (!projectSelect) return;
  projectSelect.innerHTML = '';

  const isCustomSubject = subjectId === '__custom';

  if (!isCustomSubject) {
    const list = selections.projects.filter((p) => p.subjectId === subjectId);
    list.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      projectSelect.appendChild(opt);
    });
  }

  const optDivider = document.createElement('option');
  optDivider.disabled = true;
  optDivider.textContent = '──────────';
  projectSelect.appendChild(optDivider);

  const optCustom = document.createElement('option');
  optCustom.value = '__custom';
  optCustom.textContent = 'Other project / task';
  projectSelect.appendChild(optCustom);

  // default selection
  if (projectSelect.options.length > 0) {
    const firstValid = Array.from(projectSelect.options).find((o) => !o.disabled);
    if (firstValid) projectSelect.value = firstValid.value;
  }

  // custom project group visible if subject or project is custom
  if (customProjectGroup) {
    customProjectGroup.style.display =
      subjectId === '__custom' || projectSelect.value === '__custom' ? '' : 'none';
  }
}

function renderTeacherList() {
  if (!teacherListEl) return;
  teacherListEl.innerHTML = '';

  selections.teachers.forEach((t) => {
    const li = document.createElement('li');

    const nameEl = document.createElement('strong');
    nameEl.textContent = t.name;
    li.appendChild(nameEl);

    const emailEl = document.createElement('div');
    emailEl.className = 'small';
    emailEl.textContent = t.email;
    li.appendChild(emailEl);

    if (t.subjects && t.subjects.length) {
      const subEl = document.createElement('div');
      subEl.className = 'small';
      const labels = t.subjects
        .map((id) => selections.subjects.find((s) => s.id === id)?.label || id)
        .join(', ');
      subEl.textContent = labels;
      li.appendChild(subEl);
    }

    teacherListEl.appendChild(li);
  });
}

function updateTeacherFromSelect() {
  if (!teacherSelect || !teacherEmailInput || !customTeacherGroup) return;
  const value = teacherSelect.value;
  if (value === '__custom') {
    customTeacherGroup.style.display = '';
    teacherEmailInput.value = '';
  } else {
    customTeacherGroup.style.display = 'none';
    const t = selections.teachers.find((x) => x.id === value);
    teacherEmailInput.value = t?.email || '';
    if (customTeacherNameInput) customTeacherNameInput.value = '';
  }
}

// ---------------------------
// Stamp text & overlay
// ---------------------------
function getNowStampDisplay() {
  const now = new Date();
  const opts = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };
  return now.toLocaleString(undefined, opts);
}

function getSelectedTeacherName() {
  if (!teacherSelect) return '';
  if (teacherSelect.value === '__custom') {
    return customTeacherNameInput?.value || (teacherEmailInput?.value || '').split('@')[0] || 'Teacher';
  }
  const t = selections.teachers.find((x) => x.id === teacherSelect.value);
  return t?.name || 'Teacher';
}

function getSelectedSubjectLabel() {
  if (!subjectSelect) return '';
  if (subjectSelect.value === '__custom') {
    return customProjectInput?.value || 'Custom context';
  }
  const s = selections.subjects.find((x) => x.id === subjectSelect.value);
  return s?.label || '';
}

function getSelectedProjectLabel() {
  if (!projectSelect) return '';
  if (projectSelect.value === '__custom') {
    return customProjectInput?.value || 'Custom project';
  }
  const p = selections.projects.find((x) => x.id === projectSelect.value);
  return p?.label || '';
}

function buildStampLines() {
  const studentName = (nameInput?.value || '').trim() || 'Student Name';
  const teacherName = getSelectedTeacherName();
  const line1 = `${studentName} – ${teacherName}`;

  const timeDisplay = getNowStampDisplay();
  const line2 = `Pukekohe High School • ${timeDisplay}`;

  const custom = (customTextInput?.value || '').trim();
  let line3 = custom;
  if (!line3) {
    const subj = getSelectedSubjectLabel();
    const proj = getSelectedProjectLabel();
    if (subj && proj) {
      line3 = `${subj} • ${proj}`;
    } else if (subj || proj) {
      line3 = subj || proj;
    } else {
      line3 = 'Learning evidence';
    }
  }

  return [line1, line2, line3];
}

function updateOverlay() {
  if (!overlayTextEl) return;
  const [line1, line2, line3] = buildStampLines();
  overlayTextEl.innerHTML = `<span>${line1}<br>${line2}<br>${line3}</span>`;
  saveState();
}

// ---------------------------
// Camera handling (with enumerateDevices)
// ---------------------------
async function ensureVideoDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter((d) => d.kind === 'videoinput');

    if (videoDevices.length > 1 && currentDeviceIndex === 0) {
      const backIndex = videoDevices.findIndex((d) =>
        /back|rear|environment/i.test(d.label)
      );
      if (backIndex >= 0) {
        currentDeviceIndex = backIndex;
        currentFacingMode = 'environment';
      }
    }
  } catch (e) {
    console.warn('enumerateDevices failed:', e);
  }
}

async function initCamera(facingMode) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Camera not supported in this browser.', false);
    return;
  }

  if (typeof facingMode === 'string') {
    currentFacingMode = facingMode;
  } else {
    currentFacingMode = currentFacingMode || 'environment';
  }

  stopCamera();

  if (!videoDevices.length && navigator.mediaDevices.enumerateDevices) {
    await ensureVideoDevices();
  }

  let constraints = {
    audio: false,
    video: {}
  };

  if (videoDevices.length) {
    const device = videoDevices[currentDeviceIndex] || videoDevices[0];
    constraints.video.deviceId = { exact: device.deviceId };
  } else {
    constraints.video.facingMode = { ideal: currentFacingMode };
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.warn('getUserMedia failed with deviceId/facingMode, falling back:', err);
    constraints = { audio: false, video: true };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  try {
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
    if (shootBtn) shootBtn.disabled = false;

    if (videoDevices.length > 1) {
      const label = videoDevices[currentDeviceIndex].label || `Camera ${currentDeviceIndex + 1}`;
      showToast(label);
    } else {
      showToast(currentFacingMode === 'user' ? 'Front camera enabled.' : 'Back camera enabled.');
    }

    if (!videoDevices.length && navigator.mediaDevices.enumerateDevices) {
      await ensureVideoDevices();
    }
  } catch (err) {
    console.error(err);
    showToast('Could not start video stream.', false);
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (video) {
    video.srcObject = null;
  }
  if (shootBtn) shootBtn.disabled = true;
}

async function flipCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Camera flip not supported on this device.', false);
    return;
  }

  if (!videoDevices.length && navigator.mediaDevices.enumerateDevices) {
    await ensureVideoDevices();
  }

  if (!videoDevices.length || videoDevices.length === 1) {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await initCamera(currentFacingMode);
    return;
  }

  currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
  await initCamera();
}

// ---------------------------
// Stamping
// ---------------------------
function drawStampOnCanvas(width, height, imageDrawer) {
  if (!canvas) return;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  imageDrawer(ctx);
  ctx.restore();

  const padding = Math.round(width * 0.02);
  const lineHeight = Math.round(height * 0.03);
  const boxHeight = lineHeight * 4;

  const x = padding;
  const y = height - boxHeight - padding;
  const boxWidth = Math.round(width * 0.8);

  ctx.save();
  const gradient = ctx.createLinearGradient(x, y + boxHeight, x, y);
  gradient.addColorStop(0, 'rgba(15,23,42,0.95)');
  gradient.addColorStop(0.7, 'rgba(15,23,42,0.7)');
  gradient.addColorStop(1, 'rgba(15,23,42,0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.restore();

  // Crest
  const crestImg = new Image();
  crestImg.src = 'crest-192.png';

  const [line1, line2, line3] = buildStampLines();

  crestImg.onload = () => {
    const crestSize = boxHeight - padding * 2;
    ctx.drawImage(crestImg, x + padding, y + padding, crestSize, crestSize);

    ctx.fillStyle = '#f9fafb';
    ctx.font = `${Math.round(lineHeight * 0.9)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';

    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;

    const textRight = x + boxWidth - padding;
    let textY = y + padding + 2;

    ctx.fillText(line1, textRight, textY);
    textY += lineHeight + 2;
    ctx.fillText(line2, textRight, textY);
    textY += lineHeight + 2;
    ctx.fillText(line3, textRight, textY);

    ctx.shadowBlur = 0;
    updatePreviewFromCanvas();
  };

  crestImg.onerror = () => {
    const [line1, line2, line3] = buildStampLines();

    ctx.fillStyle = '#111827';
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#f9fafb';
    ctx.font = `${Math.round(lineHeight * 0.9)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';

    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;

    const textRight = x + boxWidth - padding;
    let textY = y + padding + 2;

    ctx.fillText(line1, textRight, textY);
    textY += lineHeight + 2;
    ctx.fillText(line2, textRight, textY);
    textY += lineHeight + 2;
    ctx.fillText(line3, textRight, textY);

    ctx.shadowBlur = 0;
    updatePreviewFromCanvas();
  };
}

function updatePreviewFromCanvas() {
  if (!canvas || !previewImg) return;
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('Could not create image blob.', false);
      return;
    }
    lastBlob = blob;

    const now = new Date();
    const studentName = (nameInput?.value || 'student').trim().replace(/\s+/g, '_');
    const filename = `PHS_${studentName || 'student'}_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}.png`;

    lastMeta = { filename, type: blob.type };
    lastObjectUrl = URL.createObjectURL(blob);
    previewImg.src = lastObjectUrl;

    if (shareBtn) shareBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = false;

    const student = (nameInput?.value || '').trim();
    if (student) addRecentStudent(student);
  }, 'image/png');
}

async function stampFromVideo() {
  if (!video || !video.videoWidth || !video.videoHeight) {
    showToast('Camera not ready yet.', false);
    return;
  }

  const w = video.videoWidth;
  const h = video.videoHeight;

  drawStampOnCanvas(w, h, (ctx) => {
    ctx.drawImage(video, 0, 0, w, h);
  });
}

function stampFromImageFile(file) {
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const maxDim = 1920;
    let { width, height } = img;
    if (width > height && width > maxDim) {
      const scale = maxDim / width;
      width = maxDim;
      height = Math.round(height * scale);
    } else if (height > maxDim) {
      const scale = maxDim / height;
      height = maxDim;
      width = Math.round(width * scale);
    }

    drawStampOnCanvas(width, height, (ctx) => {
      ctx.drawImage(img, 0, 0, width, height);
    });
  };
  img.onerror = () => {
    showToast('Could not load image file.', false);
  };

  const url = URL.createObjectURL(file);
  img.src = url;
}

// ---------------------------
// Share & Download
// ---------------------------
async function shareImage() {
  if (!lastBlob || !lastMeta) {
    showToast('Create a stamped image first.', false);
    return;
  }

  const file = new File([lastBlob], lastMeta.filename, { type: lastMeta.type });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Pukekohe HS – evidence',
        text: 'Stamped evidence from Pukekohe High School.'
      });
      showToast('Shared.');
    } catch (e) {
      console.warn(e);
      showToast('Share cancelled.', false);
    }
  } else if (navigator.share) {
    try {
      await navigator.share({
        title: 'Pukekohe HS – evidence',
        text: 'Stamped evidence from Pukekohe High School.',
        url: lastObjectUrl
      });
      showToast('Shared link.');
    } catch (e) {
      console.warn(e);
      showToast('Share cancelled.', false);
    }
  } else {
    downloadImage();
  }
}

function downloadImage() {
  if (!lastBlob || !lastMeta || !lastObjectUrl) {
    showToast('Nothing to download yet.', false);
    return;
  }
  const a = document.createElement('a');
  a.href = lastObjectUrl;
  a.download = lastMeta.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------------------------
// Install prompt
// ---------------------------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = '';
});

async function handleInstallClick() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try {
    await deferredPrompt.userChoice;
  } finally {
    deferredPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
  }
}

// ---------------------------
// Event wiring
// ---------------------------
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopCamera();
  }
});

window.addEventListener('beforeunload', () => {
  stopCamera();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return;
    if (!shootBtn?.disabled) {
      e.preventDefault();
      shootBtn.click();
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (shareBtn && !shareBtn.disabled) {
      shareBtn.click();
    } else if (downloadBtn && !downloadBtn.disabled) {
      downloadBtn.click();
    }
  }
});

// ---------------------------
// Init
// ---------------------------
document.addEventListener('DOMContentLoaded', () => {
  setTheme(getTheme());
  loadRecentStudents();
  updateOverlay();
  loadSelections();

  // input change handlers
  if (nameInput) nameInput.addEventListener('input', updateOverlay);
  if (teacherSelect) {
    teacherSelect.addEventListener('change', () => {
      updateTeacherFromSelect();
      updateOverlay();
    });
  }
  if (teacherEmailInput) teacherEmailInput.addEventListener('input', saveState);
  if (customTeacherNameInput) customTeacherNameInput.addEventListener('input', updateOverlay);
  if (subjectSelect) {
    subjectSelect.addEventListener('change', () => {
      populateProjects(subjectSelect.value);
      updateOverlay();
    });
  }
  if (projectSelect) {
    projectSelect.addEventListener('change', () => {
      if (customProjectGroup) {
        customProjectGroup.style.display =
          subjectSelect.value === '__custom' || projectSelect.value === '__custom' ? '' : 'none';
      }
      updateOverlay();
    });
  }
  if (customProjectInput) customProjectInput.addEventListener('input', updateOverlay);
  if (customTextInput) customTextInput.addEventListener('input', updateOverlay);

  // buttons
  if (initBtn) {
    initBtn.addEventListener('click', () => {
      initCamera();
    });
  }

  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      flipCamera();
    });
  }

  if (fileInput && fileStampBtn) {
    fileStampBtn.addEventListener('click', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        showToast('Choose a photo file first.', false);
        return;
      }
      stampFromImageFile(file);
    });
  }

  if (shootBtn) {
    shootBtn.addEventListener('click', () => {
      stampFromVideo();
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareImage();
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      downloadImage();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      lastBlob = null;
      lastMeta = null;
      if (previewImg) previewImg.src = '';
      if (shareBtn) shareBtn.disabled = true;
      if (downloadBtn) downloadBtn.disabled = true;
      showToast('Cleared.');
    });
  }

  if (helpBtn && tipsDialog) {
    helpBtn.addEventListener('click', () => {
      try {
        tipsDialog.showModal();
      } catch {
        tipsDialog.setAttribute('open', 'open');
      }
    });
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      toggleTheme();
    });
  }

  if (installBtn) {
    installBtn.addEventListener('click', () => {
      handleInstallClick();
    });
  }

  if (copyEmailBtn && teacherEmailInput) {
    copyEmailBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(teacherEmailInput.value || '');
        showToast('Email copied.');
      } catch {
        showToast('Could not copy email.', false);
      }
    });
  }
});
