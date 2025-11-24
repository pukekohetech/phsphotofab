/**************************************************************
 *  Pukekohe HS – Evidence Stamper (Streamlined Version)
 *  Option B: Auto-camera AFTER first approval
 **************************************************************/

// ---------------------------
// Element references
// ---------------------------
const html = document.documentElement;

const nameInput = document.getElementById("name");
const recentStudentsDatalist = document.getElementById("recentStudents");

const teacherSelect = document.getElementById("teacherSelect");
const teacherEmailInput = document.getElementById("teacherEmail");
const customTeacherGroup = document.getElementById("customTeacherGroup");
const customTeacherNameInput = document.getElementById("customTeacherName");
const copyEmailBtn = document.getElementById("copyEmailBtn");

const subjectSelect = document.getElementById("subjectSelect");
const projectSelect = document.getElementById("projectSelect");
const customProjectGroup = document.getElementById("customProjectGroup");
const customProjectInput = document.getElementById("customProjectInput");

const customTextInput = document.getElementById("subject");
const overlayTextEl = document.getElementById("overlayText");

const canvas = document.getElementById("canvas");
const video = document.getElementById("video");
const previewImg = document.getElementById("preview");

const fileInput = document.getElementById("fileInput");
const fileStampBtn = document.getElementById("fileStampBtn");
const shootBtn = document.getElementById("shootBtn");
const flipBtn = document.getElementById("flipBtn");
const shareBtn = document.getElementById("shareBtn");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");

const initBtn = document.getElementById("initBtn");
const themeBtn = document.getElementById("themeBtn");
const installBtn = document.getElementById("installBtn");

const toastEl = document.getElementById("toast");
const teacherListEl = document.getElementById("teacherList");

// ---------------------------
// State
// ---------------------------
const THEME_KEY = "phs-photo-theme";
const STUDENTS_KEY = "phs-photo-recent-students";
const STATE_KEY = "phs-photo-last-state";
const CAM_PERMISSION_KEY = "phs-photo-camera-approved";

let selections = { teachers: [], subjects: [], projects: [] };

let stream = null;
let videoDevices = [];
let currentDeviceIndex = 0;
let currentFacingMode = "environment";

let lastBlob = null;
let lastMeta = null;
let lastObjectUrl = null;

let deferredPrompt = null;
let recentStudents = [];

// ---------------------------
// Toast
// ---------------------------
function showToast(message, ok = true, duration = 2200) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastEl.style.background = ok
    ? "rgba(15,23,42,0.95)"
    : "rgba(185,28,28,0.95)";

  setTimeout(() => toastEl.classList.remove("show"), duration);
}

// ---------------------------
// Require student name
// ---------------------------
function requireStudentName() {
  const name = (nameInput.value || "").trim();
  if (!name) {
    showToast("Enter student name first.", false);
    nameInput.focus();
    return false;
  }
  return true;
}

// ---------------------------
// Theme
// ---------------------------
function getTheme() {
  return localStorage.getItem(THEME_KEY) || "auto";
}

function setTheme(theme) {
  html.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const cur = getTheme();
  const next = cur === "light" ? "dark" : cur === "dark" ? "auto" : "light";
  setTheme(next);
  showToast(`Theme: ${next}`);
}

// ---------------------------
// Student history
// ---------------------------
function loadRecentStudents() {
  try {
    recentStudents = JSON.parse(localStorage.getItem(STUDENTS_KEY)) || [];
  } catch {
    recentStudents = [];
  }
  renderRecentStudents();
}

function saveRecentStudents() {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(recentStudents.slice(0, 20)));
}

function addRecentStudent(name) {
  if (!name) return;
  const ix = recentStudents.indexOf(name);
  if (ix >= 0) recentStudents.splice(ix, 1);
  recentStudents.unshift(name);
  saveRecentStudents();
  renderRecentStudents();
}

function renderRecentStudents() {
  recentStudentsDatalist.innerHTML = "";
  recentStudents.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    recentStudentsDatalist.appendChild(opt);
  });
}

// ---------------------------
// Save/load UI state
// ---------------------------
function saveState() {
  const state = {
    name: nameInput.value,
    teacherId: teacherSelect.value,
    teacherEmail: teacherEmailInput.value,
    customTeacherName: customTeacherNameInput.value,
    subjectId: subjectSelect.value,
    projectId: projectSelect.value,
    customProject: customProjectInput.value,
    customText: customTextInput.value,
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!s) return null;

    nameInput.value = s.name || "";
    teacherEmailInput.value = s.teacherEmail || "";
    customTeacherNameInput.value = s.customTeacherName || "";
    customProjectInput.value = s.customProject || "";
    customTextInput.value = s.customText || "";
    return s;
  } catch {
    return null;
  }
}

// ---------------------------
// Load selections.json
// ---------------------------
async function loadSelections() {
  const res = await fetch("selections.json", { cache: "no-store" });
  selections = await res.json();

  populateTeachers();
  populateSubjects();

  const s = loadState();

  if (s) {
    subjectSelect.value = s.subjectId;
    populateProjects(s.subjectId);
    projectSelect.value = s.projectId;
    teacherSelect.value = s.teacherId;
    updateTeacherFromSelect();
  } else {
    populateProjects(subjectSelect.value);
  }

  updateOverlay();
  renderTeacherList();
}

// ---------------------------
// Dropdown building
// ---------------------------
function populateTeachers() {
  teacherSelect.innerHTML = "";
  selections.teachers.forEach((t) =>
    teacherSelect.appendChild(new Option(t.name, t.id))
  );
  teacherSelect.appendChild(new Option("──────────", "", true, false));
  teacherSelect.lastChild.disabled = true;

  teacherSelect.appendChild(new Option("Other teacher (custom)", "__custom"));

  teacherSelect.value = selections.teachers[0]?.id || "";
}

function updateTeacherFromSelect() {
  if (teacherSelect.value === "__custom") {
    customTeacherGroup.style.display = "";
    teacherEmailInput.value = "";
  } else {
    customTeacherGroup.style.display = "none";
    const t = selections.teachers.find((x) => x.id === teacherSelect.value);
    teacherEmailInput.value = t?.email || "";
    customTeacherNameInput.value = "";
  }
}

function populateSubjects() {
  subjectSelect.innerHTML = "";
  selections.subjects.forEach((s) =>
    subjectSelect.appendChild(new Option(s.label, s.id))
  );
  subjectSelect.appendChild(new Option("──────────", "", true, false));
  subjectSelect.lastChild.disabled = true;

  subjectSelect.appendChild(new Option("Other subject/context", "__custom"));

  subjectSelect.value = selections.subjects[0]?.id || "";
}

function populateProjects(subjectId) {
  projectSelect.innerHTML = "";

  if (subjectId !== "__custom") {
    selections.projects
      .filter((p) => p.subjectId === subjectId)
      .forEach((p) => projectSelect.appendChild(new Option(p.label, p.id)));
  }

  projectSelect.appendChild(new Option("──────────", "", true, false));
  projectSelect.lastChild.disabled = true;

  projectSelect.appendChild(new Option("Custom project/task", "__custom"));

  customProjectGroup.style.display =
    subjectId === "__custom" ||
    projectSelect.value === "__custom"
      ? ""
      : "none";
}

function renderTeacherList() {
  teacherListEl.innerHTML = "";
  selections.teachers.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${t.name}</strong>
      <div class="small">${t.email}</div>`;
    teacherListEl.appendChild(li);
  });
}
// ---------------------------
// Overlay text
// ---------------------------
function getNowStampDisplay() {
  return new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildStampLines() {
  const student = nameInput.value.trim() || "Student";
  const teacher =
    teacherSelect.value === "__custom"
      ? customTeacherNameInput.value || "Teacher"
      : selections.teachers.find((t) => t.id === teacherSelect.value)?.name ||
        "Teacher";

  const line1 = `${student} – ${teacher}`;
  const line2 = `Pukekohe High School • ${getNowStampDisplay()}`;

  let line3 = customTextInput.value.trim();
  if (!line3) {
    const subj =
      subjectSelect.value === "__custom"
        ? customProjectInput.value
        : selections.subjects.find((s) => s.id === subjectSelect.value)?.label;
    const proj =
      projectSelect.value === "__custom"
        ? customProjectInput.value
        : selections.projects.find((p) => p.id === projectSelect.value)?.label;
    line3 = subj && proj ? `${subj} • ${proj}` : subj || proj || "Learning Evidence";
  }

  return [line1, line2, line3];
}

function updateOverlay() {
  const [a, b, c] = buildStampLines();
  overlayTextEl.innerHTML = `<span>${a}<br>${b}<br>${c}</span>`;
  saveState();
}

// ---------------------------
// CAMERA — enumerateDevices + Option B logic
// ---------------------------
async function ensureVideoDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  videoDevices = devices.filter((d) => d.kind === "videoinput");

  const backIndex = videoDevices.findIndex((d) =>
    /back|environment|rear/i.test(d.label)
  );
  if (backIndex >= 0) currentDeviceIndex = backIndex;
}

async function initCamera() {
  if (!navigator.mediaDevices) return showToast("No camera", false);

  await ensureVideoDevices();
  stopCamera();

  let constraints = { audio: false, video: {} };

  if (videoDevices.length) {
    constraints.video.deviceId = {
      exact: videoDevices[currentDeviceIndex].deviceId,
    };
  } else {
    constraints.video.facingMode = { ideal: "environment" };
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Mark that permission was granted
    localStorage.setItem(CAM_PERMISSION_KEY, "yes");

    video.srcObject = stream;
    await video.play();

    shootBtn.disabled = false;
    showToast("Camera ready");
  } catch (err) {
    showToast("Camera blocked", false);
  }
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  shootBtn.disabled = true;
}

async function flipCamera() {
  if (!requireStudentName()) return;

  if (!videoDevices.length) await ensureVideoDevices();
  if (videoDevices.length <= 1)
    return showToast("Only one camera", false);

  currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
  await initCamera();
}

// ---------------------------
// Stamping
// ---------------------------
function drawStamped(w, h, drawFn) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  drawFn(ctx);

  const pad = Math.round(w * 0.02);
  const lh = Math.round(h * 0.03);
  const boxH = lh * 4;
  const x = pad;
  const y = h - boxH - pad;
  const boxW = Math.round(w * 0.8);

  const g = ctx.createLinearGradient(x, y + boxH, x, y);
  g.addColorStop(0, "rgba(15,23,42,0.95)");
  g.addColorStop(0.7, "rgba(15,23,42,0.7)");
  g.addColorStop(1, "transparent");

  ctx.fillStyle = g;
  ctx.fillRect(x, y, boxW, boxH);

  const [l1, l2, l3] = buildStampLines();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.font = `${lh}px system-ui`;

  let ty = y + pad;
  const tx = x + boxW - pad;
  ctx.fillText(l1, tx, ty);
  ty += lh + 2;
  ctx.fillText(l2, tx, ty);
  ty += lh + 2;
  ctx.fillText(l3, tx, ty);

  canvas.toBlob((blob) => {
    lastBlob = blob;
    lastObjectUrl && URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = URL.createObjectURL(blob);

    const now = new Date();
    const nm = nameInput.value.trim().replace(/\s+/g, "_") || "student";

    lastMeta = {
      filename: `PHS_${nm}_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}.png`,
      type: blob.type,
    };

    previewImg.src = lastObjectUrl;
    shareBtn.disabled = false;
    downloadBtn.disabled = false;
    addRecentStudent(nameInput.value.trim());
  });
}

function stampFromVideo() {
  if (!requireStudentName()) return;
  if (!video.videoWidth) return showToast("Camera not ready", false);

  drawStamped(video.videoWidth, video.videoHeight, (ctx) =>
    ctx.drawImage(video, 0, 0)
  );
}

function stampFromFile(file) {
  if (!requireStudentName()) return;
  const img = new Image();
  img.onload = () => {
    const maxDim = 1920;
    let w = img.width,
      h = img.height;

    if (Math.max(w, h) > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    drawStamped(w, h, (ctx) => ctx.drawImage(img, 0, 0, w, h));
  };
  img.src = URL.createObjectURL(file);
}

// ---------------------------
// Share + Download
// ---------------------------
async function shareStamped() {
  if (!lastBlob) return showToast("Nothing to share", false);
  const file = new File([lastBlob], lastMeta.filename, {
    type: lastMeta.type,
  });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
  } else {
    downloadStamped();
  }
}

function downloadStamped() {
  if (!lastObjectUrl) return;
  const a = document.createElement("a");
  a.href = lastObjectUrl;
  a.download = lastMeta.filename;
  a.click();
}

// ---------------------------
// INIT — Option B Logic
// ---------------------------
document.addEventListener("DOMContentLoaded", async () => {
  setTheme(getTheme());
  loadRecentStudents();
  loadSelections();

  // Auto-start camera ONLY if user approved once
  const camApproved = localStorage.getItem(CAM_PERMISSION_KEY) === "yes";
  if (camApproved) {
    initCamera();
  }

  initBtn.addEventListener("click", () => initCamera());

  nameInput.addEventListener("input", updateOverlay);

  teacherSelect.addEventListener("change", () => {
    updateTeacherFromSelect();
    updateOverlay();
  });

  teacherEmailInput.addEventListener("input", saveState);
  customTeacherNameInput.addEventListener("input", updateOverlay);

  subjectSelect.addEventListener("change", () => {
    populateProjects(subjectSelect.value);
    updateOverlay();
  });

  projectSelect.addEventListener("change", () => {
    customProjectGroup.style.display =
      subjectSelect.value === "__custom" ||
      projectSelect.value === "__custom"
        ? ""
        : "none";
    updateOverlay();
  });

  customProjectInput.addEventListener("input", updateOverlay);
  customTextInput.addEventListener("input", updateOverlay);

  fileStampBtn.addEventListener("click", () => {
    const file = fileInput.files?.[0];
    if (!file) return showToast("Pick a file first", false);
    stampFromFile(file);
  });

  shootBtn.addEventListener("click", stampFromVideo);
  flipBtn.addEventListener("click", flipCamera);

  shareBtn.addEventListener("click", shareStamped);
  downloadBtn.addEventListener("click", downloadStamped);

  clearBtn.addEventListener("click", () => {
    previewImg.src = "";
    lastBlob = null;
    shareBtn.disabled = true;
    downloadBtn.disabled = true;
    showToast("Cleared");
  });

  themeBtn.addEventListener("click", toggleTheme);

  if (installBtn) {
    installBtn.addEventListener("click", () => deferredPrompt?.prompt());
  }

  copyEmailBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(teacherEmailInput.value || "");
    showToast("Email copied");
  });
});
