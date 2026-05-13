// =====================================================
//  CONFIG
// =====================================================
const SYSTEM_PROMPT = `Bạn là chuyên gia dinh dưỡng thể thao. Người dùng sẽ gửi ảnh phiếu kết quả InBody.

Nhiệm vụ:
1. Đọc và trích xuất chính xác các chỉ số từ ảnh (nếu không thấy rõ, ghi "N/A")
2. Phân tích tình trạng cơ thể
3. Đưa ra thực đơn 7 ngày phù hợp

Trả về JSON hợp lệ (KHÔNG có markdown, KHÔNG có backtick), đúng cấu trúc sau:
{
  "metrics": {
    "weight": "kg",
    "bmi": "số",
    "body_fat_percent": "%",
    "muscle_mass": "kg",
    "water_percent": "%",
    "visceral_fat": "mức",
    "bmr": "kcal"
  },
  "analysis": {
    "status": "Bình thường / Thừa cân / Thiếu cân / Thừa mỡ / v.v.",
    "summary": "2-3 câu nhận xét tổng quan",
    "goal": "Giảm mỡ / Tăng cơ / Duy trì"
  },
  "daily_calories": số,
  "macros": { "protein_g": số, "carb_g": số, "fat_g": số },
  "menu": [
    {
      "day": "Thứ 2",
      "breakfast": "tên món + kcal",
      "lunch": "tên món + kcal",
      "dinner": "tên món + kcal",
      "snack": "tên món + kcal"
    }
  ]
}
Tạo đủ 7 ngày (Thứ 2 đến Chủ nhật).`;

const METRIC_LABEL = {
  weight: "Cân nặng", bmi: "BMI",
  body_fat_percent: "Mỡ cơ thể", muscle_mass: "Khối cơ",
  water_percent: "Nước cơ thể", visceral_fat: "Mỡ nội tạng", bmr: "BMR"
};
const METRIC_UNIT = {
  weight: "kg", bmi: "", body_fat_percent: "%",
  muscle_mass: "kg", water_percent: "%", visceral_fat: "", bmr: "kcal"
};

// =====================================================
//  STATE
// =====================================================
let currentFile = null;
let resultData = null;
let activeDay = 0;

// =====================================================
//  DOM refs
// =====================================================
const $ = id => document.getElementById(id);

const dropzone       = $("dropzone");
const fileInput      = $("fileInput");
const dropContent    = $("dropContent");
const previewContent = $("previewContent");
const previewImg     = $("previewImg");
const btnAnalyze     = $("btnAnalyze");
const btnReset       = $("btnReset");
const errorBox       = $("errorBox");

const stepUpload    = $("stepUpload");
const stepAnalyzing = $("stepAnalyzing");
const stepResult    = $("stepResult");

// =====================================================
//  INIT EVENTS
// =====================================================
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("active"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("active"));
dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("active");
  setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", e => setFile(e.target.files[0]));
btnAnalyze.addEventListener("click", analyze);
btnReset.addEventListener("click", reset);
$("btnExport").addEventListener("click", exportPDF);

// =====================================================
//  HELPERS
// =====================================================
function showStep(name) {
  stepUpload.classList.toggle("hidden", name !== "upload");
  stepAnalyzing.classList.toggle("hidden", name !== "analyzing");
  stepResult.classList.toggle("hidden", name !== "result");
  btnReset.classList.toggle("hidden", name === "upload");
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}
function hideError() { errorBox.classList.add("hidden"); }

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Đọc file thất bại"));
    r.readAsDataURL(file);
  });
}

function setFile(file) {
  if (!file) return;
  currentFile = file;
  previewImg.src = URL.createObjectURL(file);
  dropContent.classList.add("hidden");
  previewContent.classList.remove("hidden");
  btnAnalyze.classList.remove("hidden");
  dropzone.classList.add("active");
  $("customBox").classList.remove("hidden");
}

function reset() {
  currentFile = null; resultData = null; activeDay = 0;
  fileInput.value = "";
  previewImg.src = "";
  dropContent.classList.remove("hidden");
  previewContent.classList.add("hidden");
  btnAnalyze.classList.add("hidden");
  dropzone.classList.remove("active");
  $("customBox").classList.add("hidden");
  $("selDiet").value = "Bình thường";
  $("inputAllergy").value = "";
  hideError();
  showStep("upload");
}

// =====================================================
//  STATUS COLOR & GOAL ICON
// =====================================================
function statusColor(s = "") {
  const l = s.toLowerCase();
  if (l.includes("bình thường")) return "#2D6E65";
  if (l.includes("thừa")) return "#D85A30";
  if (l.includes("thiếu")) return "#378ADD";
  return "#888";
}
function goalIcon(g = "") {
  if (g.includes("Giảm")) return "🔥";
  if (g.includes("Tăng")) return "💪";
  return "⚖️";
}

// =====================================================
//  EXPORT PDF
// =====================================================
function exportPDF() {
  const el = $("stepResult");
  const btn = $("btnExport");
  btn.textContent = "⏳ Đang xuất...";
  btn.disabled = true;
  html2pdf().set({
    margin: 10,
    filename: "FitBite-thucdon.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  }).from(el).save().then(() => {
    btn.textContent = "📄 Xuất PDF thực đơn";
    btn.disabled = false;
  });
}

// =====================================================
//  RENDER RESULT
// =====================================================
function renderResult(data) {
  const a = data.analysis || {};
  const m = data.metrics || {};

  $("goalIcon").textContent = goalIcon(a.goal || "");
  $("statusText").textContent = a.status || "N/A";
  $("statusText").style.color = statusColor(a.status || "");
  $("summaryText").textContent = a.summary || "";
  $("goalText").textContent = a.goal || "—";

  const grid = $("metricsGrid");
  grid.innerHTML = "";
  Object.entries(m).forEach(([k, v]) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <div class="metric-label">${METRIC_LABEL[k] || k}</div>
      <div class="metric-value">${v}<span class="metric-unit">${METRIC_UNIT[k] || ""}</span></div>
    `;
    grid.appendChild(card);
  });

  if (data.macros) {
    $("dailyKcal").textContent = (data.daily_calories || 0) + " kcal";
    const { protein_g: p, carb_g: c, fat_g: f } = data.macros;
    const total = (p * 4) + (c * 4) + (f * 9) || 1;
    const segments = [
      { label: "Protein", g: p, kcal: p * 4, color: "#2D6E65" },
      { label: "Carb",    g: c, kcal: c * 4, color: "#378ADD" },
      { label: "Fat",     g: f, kcal: f * 9, color: "#D85A30" }
    ];
    const bar = $("macroBar");
    const legend = $("macroLegend");
    bar.innerHTML = "";
    legend.innerHTML = "";
    segments.forEach(s => {
      const seg = document.createElement("div");
      seg.className = "macro-seg";
      seg.style.cssText = `width:${Math.round(s.kcal / total * 100)}%; background:${s.color};`;
      bar.appendChild(seg);
      const li = document.createElement("div");
      li.className = "legend-item";
      li.innerHTML = `<div class="legend-dot" style="background:${s.color}"></div>${s.label}: <b>${s.g}g</b>`;
      legend.appendChild(li);
    });
  }

  if (data.menu && data.menu.length) {
    const tabs = $("dayTabs");
    tabs.innerHTML = "";
    data.menu.forEach((d, i) => {
      const btn = document.createElement("button");
      btn.className = "day-tab" + (i === 0 ? " active" : "");
      btn.textContent = d.day;
      btn.addEventListener("click", () => {
        document.querySelectorAll(".day-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeDay = i;
        renderDayDetail(data.menu[i]);
      });
      tabs.appendChild(btn);
    });
    renderDayDetail(data.menu[0]);
  }

  showStep("result");
}

function renderDayDetail(day) {
  const meals = [
    ["🌅", "Sáng", day.breakfast],
    ["☀️", "Trưa", day.lunch],
    ["🌙", "Tối", day.dinner],
    ["🍎", "Snack", day.snack]
  ];
  const detail = $("dayDetail");
  detail.innerHTML = "";
  meals.forEach(([icon, label, value]) => {
    const card = document.createElement("div");
    card.className = "meal-card";
    card.innerHTML = `
      <div class="meal-label">${icon} ${label}</div>
      <div class="meal-value">${value || "—"}</div>
    `;
    detail.appendChild(card);
  });
}

// =====================================================
//  API CALL
// =====================================================
async function analyze() {
  if (!currentFile) return;
  hideError();
  showStep("analyzing");

  try {
    const b64 = await toBase64(currentFile);
    const mediaType = currentFile.type || "image/jpeg";

    const diet = $("selDiet").value;
    const allergy = $("inputAllergy").value.trim();
    const extraNote = `Chế độ ăn: ${diet}.${allergy ? ` Không dùng: ${allergy}.` : ""}`;

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: b64, media_type: mediaType, extra_note: extraNote })
    });

    const json = await response.json();
    if (json.error) throw new Error(json.error.message || "API lỗi");

    const raw = json.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    resultData = JSON.parse(clean);
    renderResult(resultData);

  } catch (err) {
    console.error(err);
    showError("❌ Lỗi: " + (err.message || "Không thể phân tích. Vui lòng thử lại."));
    showStep("upload");
  }
}