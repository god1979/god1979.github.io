const OPENAI_API_KEY = "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"; // ⚠️ visible in browser – use backend for production
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Elements
const imgInput = document.getElementById("imageInput");
const cameraBtn = document.getElementById("cameraBtn");
const cameraContainer = document.getElementById("cameraContainer");
const video = document.getElementById("camera");
const captureBtn = document.getElementById("captureBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");
const photoCanvas = document.getElementById("photoCanvas");
const statusDiv = document.getElementById("status");
const formSection = document.getElementById("formSection");
const waLinkDiv = document.getElementById("waLinkDiv");

let stream = null;

function sanitize(s = "") {
  return s.replace(/["':;]+/g, "").replace(/\s+/g, " ").trim();
}

function parseJsonLoose(str) {
  try {
    return JSON.parse(str);
  } catch {
    const out = {};
    const lines = str.split(/\n|,/);
    lines.forEach((line) => {
      const m = line.match(
        /(Name|Phone Number|WhatsApp Number|Email|Address|Company Name)\s*[:\-]?\s*(.*)/i
      );
      if (m) out[m[1]] = m[2];
    });
    return out;
  }
}

async function processImage(base64) {
  statusDiv.textContent = "Working...";
  formSection.style.display = "none";
  waLinkDiv.innerHTML = "";

  const prompt = `
You are a precise OCR and contact extractor AI.
Perform OCR + cleanup from the given business card image.
There may be multiple people and phone numbers.
Return valid JSON like:
{
  "Contacts": [
    {
      "Name": "",
      "Phone Number": "",
      "WhatsApp Number": "",
      "Email": "",
      "Address": "",
      "Company Name": ""
    }
  ]
}
Rules:
- Return every distinct contact/person separately in the "Contacts" array.
- Include both numbers if more than one phone number is present on the card.
- If WhatsApp number is missing, leave the field empty.
- Do not include any extra text before or after the JSON.
`;

  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You extract structured contact info from business cards accurately." },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64," + base64 } }
        ]
      }
    ],
    temperature: 0
  };

  try {
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENAI_API_KEY
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    console.log("LLM Output:", content);

    const parsed = parseJsonLoose(content);
    const contacts = Array.isArray(parsed.Contacts) ? parsed.Contacts : [parsed];

    displayContacts(contacts);
    statusDiv.textContent = "Process completed.";
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Failed. Please retry.";
  }
}

// Display contacts
function displayContacts(contacts) {
  formSection.style.display = "block";
  formSection.innerHTML = ""; 

  contacts.forEach((contact, i) => {
    const name = sanitize(contact["Name"]);
    const phone = sanitize(contact["Phone Number"]);
    const whatsapp = sanitize(contact["WhatsApp Number"]);
    const email = sanitize(contact["Email"]);
    const address = sanitize(contact["Address"]);
    const company = sanitize(contact["Company Name"]);

    // WhatsApp link
    let waNumRaw = whatsapp || phone;
    let waLink = "";
    if (waNumRaw) {
      const digits = waNumRaw.replace(/\D/g, "");
      let fullNum = digits;
      if (/^[6-9]\d{9}$/.test(digits)) fullNum = "91" + digits;
      waLink = `https://wa.me/${fullNum}`;
    }

    const card = document.createElement("div");
    card.className = "contact-card";
    card.innerHTML = `
      <h3>Contact ${i + 1}</h3>
      <div class="field"><label>Name</label><input type="text" value="${name}"></div>
      <div class="field"><label>Phone</label><input type="text" value="${phone}" readonly></div>
      <div class="field"><label>Email</label><input type="text" value="${email}" readonly></div>
      <div class="field"><label>Address</label><input type="text" value="${address}" readonly></div>
      <div class="field"><label>Company</label><input type="text" value="${company}" readonly></div>
      ${waLink ? `<a href="${waLink}" target="_blank" class="wa-button">💬 Open WhatsApp Chat</a>` : ""}
      <button class="vcardBtn">Download vCard</button>
    `;

    // Add vCard download action
    const vcardBtn = card.querySelector(".vcardBtn");
    vcardBtn.addEventListener("click", () => downloadVCard(name, phone, waLink, email, address, company));

    formSection.appendChild(card);
  });
}

function downloadVCard(n, p, w, e, a, c) {
  let telLines = "";
  if (p) telLines += `TEL;TYPE=CELL:${p}\n`;
  if (w && w !== p) telLines += `TEL;TYPE=CELL;X-ABLabel=WhatsApp:${w}\n`;

  const vcf = `BEGIN:VCARD
VERSION:3.0
N:${n}
FN:${n}
ORG:${c}
${telLines}EMAIL;TYPE=INTERNET:${e}
ADR;TYPE=WORK:;;${a}
END:VCARD`;

  const blob = new Blob([vcf], { type: "text/vcard" });
  const url = URL.createObjectURL(blob);
  const aTag = document.createElement("a");
  aTag.href = url;
  aTag.download = (n || "contact") + ".vcf";
  aTag.click();
  URL.revokeObjectURL(url);
}

imgInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const base64 = await new Promise((r) => {
    const reader = new FileReader();
    reader.onload = () => r(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
  await processImage(base64);
});

cameraBtn.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    cameraContainer.style.display = "block";
  } catch (err) {
    alert("Camera not available or permission denied.");
  }
});

closeCameraBtn.addEventListener("click", () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  cameraContainer.style.display = "none";
});

captureBtn.addEventListener("click", () => {
  if (!stream) return;
  const ctx = photoCanvas.getContext("2d");
  photoCanvas.width = video.videoWidth;
  photoCanvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  const dataUrl = photoCanvas.toDataURL("image/jpeg");
  const base64 = dataUrl.split(",")[1];
  cameraContainer.style.display = "none";
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  processImage(base64);
});