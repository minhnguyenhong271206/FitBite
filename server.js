const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static("."));

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

app.post("/api/analyze", async (req, res) => {
  try {
    const { image_base64, media_type, extra_note } = req.body;
    const userText = `Đây là ảnh kết quả InBody của tôi. Hãy phân tích và trả về JSON.${extra_note ? `\nLưu ý: ${extra_note}` : ""}`;

    const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 3000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${media_type || "image/jpeg"};base64,${image_base64}` } },
              { type: "text", text: userText }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message || "OpenAI API lỗi");

    const raw = data.choices?.[0]?.message?.content || "";
    const clean = raw.replace(/```json|```/g, "").trim();

    res.json({ text: clean });

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
});