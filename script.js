/**************************************************************
 *  Pukekohe HS – Evidence Stamper (Stable Camera Version)
 *  • Bullet-proof camera init (iOS + Chrome + PWA safe)
 *  • Safe enumerateDevices (permission-first)
 *  • Reliable flip-camera support
 *  • All original features kept exactly the same
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

let selections = { teachers: [], subjects: [], projects: [] };

let stream = null;
let videoDevices = [];
let currentDeviceIndex = 0;

let lastBlob = null;
let lastObjectUrl = null;
let lastMeta = null;

let deferredPrompt = null;
let recentStudents = [];

/* ============================================================
 *  TOAST
 * ============================================================*/
function showToast(message, ok = true, duration = 2400) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastEl.style.background = ok
    ? "rgba(15,23,42,0.95)"
    : "rgba(185,28,28,0.95)";
  setTimeout(() => toastEl.classList.remove("show"), duration);
}

/* ============================================================
 *  REQUIRE STUDENT NAME
 * ============================================================*/
function requireStudentName() {
  const name = (nameInput?.value || "").trim();
  if (!name) {
    showToast("Enter student name first.", false);
    nameInput.focus();
    return false;
  }
  return true;
}

/* ============================================================
 *  THEME
 * ============================================================*/
function getTheme() {
  return localStorage.getItem(THEME_KEY) || "auto";
}
function setTheme(theme) {
  html.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}
function toggleTheme() {
  const current = getTheme();
  const next =
    current === "light" ? "dark" : current === "dark" ? "auto" : "light";
  setTheme(next);
  showToast(`Theme: ${next}`);
}

/* ============================================================
 *  RECENT STUDENTS
 * ============================================================*/
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

/* ============================================================
 *  STATE SAVE / LOAD
 * ============================================================*/
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
    const state = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!state) return null;

    nameInput.value = state.name || "";
    teacherEmailInput.value = state.teacherEmail || "";
    customTeacherNameInput.value = state.customTeacherName || "";
    customProjectInput.value = state.customProject || "";
    customTextInput.value = state.customText || "";
    return state;
  } catch {
    return null;
  }
}

/* ============================================================
 *  LOAD selections.json
 * ============================================================*/
async function loadSelections() {
  try {
    const res = await fetch("selections.json", { cache: "no-store" });
    selections = await res.json();
  } catch {
    showToast("Could not load teacher list.", false);
    selections = { teachers: [], subjects: [], projects: [] };
  }

  populateTeachers();
  populateSubjects();

  const state = loadState();

  if (state) {
    if (state.subjectId) subjectSelect.value = state.subjectId;
    populateProjects(state.subjectId);

    if (state.projectId) projectSelect.value = state.projectId;
    if (state.teacherId) teacherSelect.value = state.teacherId;

    updateTeacherFromSelect();
  } else {
    populateProjects(subjectSelect.value);
  }

  renderTeacherList();
  updateOverlay();
}

// ------------ Teachers
function populateTeachers() {
  teacherSelect.innerHTML = "";
  selections.teachers.forEach((t) => {
    teacherSelect.appendChild(new Option(t.name, t.id));
  });
  const divider = new Option("──────────", "", true, false);
  divider.disabled = true;
  teacherSelect.appendChild(divider);
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

// ------------ Subjects
function populateSubjects() {
  subjectSelect.innerHTML = "";
  selections.subjects.forEach((s) => {
    subjectSelect.appendChild(new Option(s.label, s.id));
  });
  subjectSelect.appendChild(new Option("──────────", "", true, false));
  subjectSelect.lastChild.disabled = true;
  subjectSelect.appendChild(new Option("Other subject / context", "__custom"));
  subjectSelect.value = selections.subjects[0]?.id || "";
}

// ------------ Projects
function populateProjects(subjectId) {
  projectSelect.innerHTML = "";
  if (subjectId !== "__custom") {
    selections.projects
      .filter((p) => p.subjectId === subjectId)
      .forEach((p) => projectSelect.appendChild(new Option(p.label, p.id)));
  }
  projectSelect.appendChild(new Option("──────────", "", true, false));
  projectSelect.lastChild.disabled = true;
  projectSelect.appendChild(new Option("Other project / task", "__custom"));
  customProjectGroup.style.display =
    subjectId === "__custom" ? "" : projectSelect.value === "__custom" ? "" : "none";
}

function renderTeacherList() {
  teacherListEl.innerHTML = "";
  selections.teachers.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${t.name}</strong><div class="small">${t.email || "No email"}</div>`;
    teacherListEl.appendChild(li);
  });
}

/* ============================================================
 *  STAMP OVERLAY
 * ============================================================*/
function getNowStampDisplay() {
  const now = new Date();
  return now.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildStampLines() {
  const student = (nameInput.value || "").trim() || "Student";
  const teacher =
    teacherSelect.value === "__custom"
      ? customTeacherNameInput.value || "Teacher"
      : selections.teachers.find((t) => t.id === teacherSelect.value)?.name || "Teacher";

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

    line3 = subj && proj ? `${subj} • ${proj}` : subj || proj || "Learning evidence";
  }
  return [line1, line2, line3];
}

function updateOverlay() {
  const [l1, l2, l3] = buildStampLines();
  overlayTextEl.innerHTML = `<span>${l1}<br>${l2}<br>${l3}</span>`;
  saveState();
}

/* ============================================================
 *  CAMERA (rewritten to be bullet-proof)
 * ============================================================*/

// --- Stop camera
function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  shootBtn.disabled = true;
}

// --- Permission-first device enumeration
async function ensureVideoDevices() {
  try {
    // Required by iOS + Chrome to reveal labels
    await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    showToast("Camera permission is required.", false);
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter((d) => d.kind === "videoinput");

    const backIndex = videoDevices.findIndex((d) =>
      /back|rear|environment/i.test(d.label)
    );
    if (backIndex >= 0) currentDeviceIndex = backIndex;
  } catch (err) {
    console.error(err);
    showToast("Unable to list cameras.", false);
  }
}

// --- Init camera
async function initCamera() {
  stopCamera();

  await ensureVideoDevices();

  let constraints;

  if (videoDevices.length) {
    const dev = videoDevices[currentDeviceIndex];
    constraints = { audio: false, video: { deviceId: { exact: dev.deviceId } } };
  } else {
    constraints = { audio: false, video: { facingMode: "environment" } };
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    // fallback
    constraints = { audio: false, video: { facingMode: "environment" } };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  video.srcObject = stream;
  await video.play();
  shootBtn.disabled = false;
  showToast("Camera ready");
}

// --- Flip camera
async function flipCamera() {
  if (!requireStudentName()) return;

  if (!videoDevices.length) await ensureVideoDevices();
  if (videoDevices.length <= 1) {
    showToast("Only one camera available.", false);
    return;
  }

  currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
  await initCamera();
}

/* ============================================================
 *  STAMPING
 * ============================================================*/
function stampFromVideo() {
  if (!requireStudentName()) return;
  if (!video.videoWidth) return showToast("Camera not ready.", false);

  drawStampedImage(video.videoWidth, video.videoHeight, (ctx) =>
    ctx.drawImage(video, 0, 0)
  );
}

function stampFromFile(file) {
  if (!requireStudentName()) return;
  const img = new Image();
  img.onload = () => {
    const max = 1920;
    let w = img.width,
      h = img.height;
    if (w > max || h > max) {
      const s = max / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    drawStampedImage(w, h, (ctx) => ctx.drawImage(img, 0, 0, w, h));
  };
  img.src = URL.createObjectURL(file);
}

function drawStampedImage(w, h, drawer) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  drawer(ctx);

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

  let ty = y + pad;
  const tx = x + boxW - pad;

  ctx.font = `${lh}px system-ui`;
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

/* ============================================================
 *  SHARE / DOWNLOAD
 * ============================================================*/
async function shareStamped() {
  if (!lastBlob) return showToast("Nothing to share.", false);
  const file = new File([lastBlob], lastMeta.filename, { type: lastMeta.type });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "PHS Evidence" });
    showToast("Shared");
  } else {
    downloadStamped();
  }
}

function downloadStamped() {
  if (!lastObjectUrl) return showToast("Nothing to download.", false);
  const a = document.createElement("a");
  a.href = lastObjectUrl;
  a.download = lastMeta.filename;
  a.click();
}

/* ============================================================
 *  INIT EVENTS
 * ============================================================*/
document.addEventListener("DOMContentLoaded", () => {
  setTheme(getTheme());
  loadRecentStudents();
  loadSelections();

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

  projectSelect.addEventListener("change", updateOverlay);
  customProjectInput.addEventListener("input", updateOverlay);
  customTextInput.addEventListener("input", updateOverlay);

  initBtn.addEventListener("click", () => initCamera());
  flipBtn.addEventListener("click", () => flipCamera());

  fileStampBtn.addEventListener("click", () => {
    const file = fileInput.files?.[0];
    if (!file) return showToast("Choose a file first.", false);
    stampFromFile(file);
  });

  shootBtn.addEventListener("click", stampFromVideo);
  shareBtn.addEventListener("click", shareStamped);
  downloadBtn.addEventListener("click", downloadStamped);

  clearBtn.addEventListener("click", () => {
    lastBlob = null;
    previewImg.src = "";
    shareBtn.disabled = true;
    downloadBtn.disabled = true;
    showToast("Cleared");
  });

  themeBtn.addEventListener("click", toggleTheme);

  if (installBtn) {
    installBtn.addEventListener("click", () => {
      deferredPrompt?.prompt();
    });
  }

  copyEmailBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(teacherEmailInput.value || "");
    showToast("Email copied");
  });
});
