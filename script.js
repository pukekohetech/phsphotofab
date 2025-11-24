/**************************************************************
 *  Pukekohe HS – Evidence Stamper (Shield + Sharper Images)
 *  • Camera now reliable on Chrome, Android, iOS Safari, PWA
 *  • Preview ALWAYS works (toBlob fallback + safe delays)
 *  • Shield restored on stamped image
 *  • Higher-res capture for camera + file input
 *  • All IDs, UI behaviours, and logic preserved exactly
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

// ---------------------------
// Logo / Shield
// ---------------------------
/**
 * Load the crest used in the stamped image. In the original
 * implementation the code attempted to load a non‑existent
 * `phs-shield.png`. This prevented the crest from appearing on
 * the final stamped photo and produced console warnings. To
 * restore the shield we copy one of the supplied crest assets
 * (see the README for available sizes) into `phs-shield.png` in
 * the project root. If you update the crest in the future, be
 * sure to mirror it here as well.
 */
const logoImg = new Image();
let logoReady = false;
// Always load the shield using a stable file name. A copy of
// `crest-512.png` is provided at build time as `phs-shield.png`.
logoImg.src = "phs-shield.png";

logoImg.onload = () => {
  logoReady = true;
};

logoImg.onerror = () => {
  console.warn("Shield image failed to load (phs-shield.png)");
};

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
    showToast("Enter student ID first.", false);
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
    current === "light" ? "dark" :
    current === "dark" ? "auto" : "light";
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
 *  LOAD Selections.json
 * ============================================================*/
async function loadSelections() {
  try {
    const res = await fetch("selections.json?v=2", { cache: "no-store" });
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

    // Ensure custom project visibility restored correctly
    customProjectGroup.style.display =
      state.subjectId === "__custom" || state.projectId === "__custom" ? "" : "none";
  } else {
    populateProjects(subjectSelect.value);
  }

  renderTeacherList();
  updateOverlay();
}

// ---------- Teachers
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

// ---------- Subjects
function populateSubjects() {
  subjectSelect.innerHTML = "";
  selections.subjects.forEach((s) =>
    subjectSelect.appendChild(new Option(s.label, s.id))
  );

  subjectSelect.appendChild(new Option("──────────", "", true, false));
  subjectSelect.lastChild.disabled = true;

  subjectSelect.appendChild(new Option("Other subject / context", "__custom"));
  subjectSelect.value = selections.subjects[0]?.id || "";
}

// ---------- Projects
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
    subjectId === "__custom" || projectSelect.value === "__custom" ? "" : "none";
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
  const n = new Date();
  return n.toLocaleString(undefined, {
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

  const l1 = `${student} – ${teacher}`;
  const l2 = `Pukekohe High School • ${getNowStampDisplay()}`;

  let l3 = customTextInput.value.trim();
  if (!l3) {
    const subj =
      subjectSelect.value === "__custom"
        ? customProjectInput.value
        : selections.subjects.find((s) => s.id === subjectSelect.value)?.label;

    const proj =
      projectSelect.value === "__custom"
        ? customProjectInput.value
        : selections.projects.find((p) => p.id === projectSelect.value)?.label;

    l3 = subj && proj ? `${subj} • ${proj}` : subj || proj || "Learning evidence";
  }
  return [l1, l2, l3];
}

function updateOverlay() {
  const [l1, l2, l3] = buildStampLines();
  overlayTextEl.innerHTML = `<span>${l1}<br>${l2}<br>${l3}</span>`;
  saveState();
}

/* ============================================================
 *  CAMERA (FULLY PATCHED + HIGHER RES)
 * ============================================================*/
function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  shootBtn.disabled = true;
}

// Permission-first enumeration (iOS + Chrome fix)
async function ensureVideoDevices() {
  try {
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

async function initCamera() {
  stopCamera();
  await ensureVideoDevices();

  let constraints;

  if (videoDevices.length) {
    const dev = videoDevices[currentDeviceIndex];
    constraints = {
      audio: false,
      video: {
        deviceId: { exact: dev.deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
  } else {
    constraints = {
      audio: false,
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch {
    constraints = {
      audio: false,
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  video.srcObject = stream;
  await video.play();
  shootBtn.disabled = false;
  showToast("Camera ready");
}

async function flipCamera() {
  if (!requireStudentName()) return;

  if (!videoDevices.length) await ensureVideoDevices();
  if (videoDevices.length <= 1) return showToast("Only one camera available.", false);

  currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
  await initCamera();
}

/* ============================================================
 *  UNIVERSAL BLOB HANDLER (Fixes PREVIEW)
 * ============================================================*/
function handleStampedBlob(blob) {
  if (!blob) {
    console.error("handleStampedBlob called with null/undefined blob");
    showToast("Could not create image from canvas.", false);
    return;
  }

  lastBlob = blob;

  // Create a fresh URL first
  const newUrl = URL.createObjectURL(blob);

  // Revoke the previous URL after switching
  if (lastObjectUrl && lastObjectUrl !== newUrl) {
    try {
      URL.revokeObjectURL(lastObjectUrl);
    } catch (e) {
      console.warn("Failed to revoke old object URL", e);
    }
  }
  lastObjectUrl = newUrl;

  if (!previewImg) {
    console.error("previewImg element not found");
    showToast("Preview element missing in DOM.", false);
    return;
  }

  // Force refresh even if URL might match previous
  previewImg.removeAttribute("src");

  // Small delay improves reliability on Safari / iOS
  setTimeout(() => {
    previewImg.src = newUrl;
  }, 30);

  const now = new Date();
  const nm = nameInput.value.trim().replace(/\s+/g, "_") || "student";

  lastMeta = {
    filename: `PHS_${nm}_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}.png`,
    type: blob.type || "image/png",
  };

  shareBtn.disabled = false;
  downloadBtn.disabled = false;

  addRecentStudent(nameInput.value.trim());
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
    const max = 2560; // slightly higher max for sharper stamped images
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

  // Use high quality scaling when resizing images. Without this the
  // canvas may look soft on high DPI screens. Enabling image
  // smoothing and requesting the highest quality ensures text and
  // logo render crisply.
  ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) {
    ctx.imageSmoothingQuality = 'high';
  }

  console.log("Drawing stamped image", { w, h });

  // Draw the base image onto the canvas via the supplied drawer
  drawer(ctx);

  // Compute sizes relative to the smallest image dimension. Using
  // minEdge rather than width/height separately yields more
  // consistent results across portrait/landscape photos and across
  // devices with varying aspect ratios.
  const minEdge = Math.min(w, h);
  const pad = Math.round(minEdge * 0.02);
  const lh = Math.round(minEdge * 0.03);
  const logoSize = Math.round(minEdge * 0.12);

  // --- Draw shield / crest in top‑left ---
  if (logoReady) {
    ctx.drawImage(logoImg, pad, pad, logoSize, logoSize);
  }

  // Dimensions for the gradient box behind the text. We reserve
  // space for three lines plus a small margin.
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

  // --- SAFARI-SAFE BLOB CREATION ---
  canvas.toBlob((blob) => {
    console.log("canvas.toBlob result:", blob);
    if (!blob) {
      // Safari fallback using dataURL → blob
      const dataURL = canvas.toDataURL("image/png");
      console.log("Using dataURL fallback");
      fetch(dataURL)
        .then((r) => r.blob())
        .then((fallbackBlob) => {
          console.log("Fallback blob created:", fallbackBlob);
          handleStampedBlob(fallbackBlob);
        })
        .catch((err) => {
          console.error("Fallback blob creation failed", err);
          showToast("Could not create image.", false);
        });
      return;
    }
    handleStampedBlob(blob);
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
    customProjectGroup.style.display =
      subjectSelect.value === "__custom" || projectSelect.value === "__custom"
        ? ""
        : "none";
    updateOverlay();
  });

  projectSelect.addEventListener("change", () => {
    customProjectGroup.style.display =
      subjectSelect.value === "__custom" || projectSelect.value === "__custom"
        ? ""
        : "none";
    updateOverlay();
  });

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
    if (lastObjectUrl) {
      try {
        URL.revokeObjectURL(lastObjectUrl);
      } catch (e) {
        console.warn("Failed to revoke object URL on clear", e);
      }
      lastObjectUrl = null;
    }
    previewImg.removeAttribute("src");
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
