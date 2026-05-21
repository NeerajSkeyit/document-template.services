// ================= BACKEND (Node.js + Express + MongoDB) =================

// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { default: puppeteer } = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

mongoose.connect("mongodb://127.0.0.1:27017/docgen", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Schema
const DocumentSchema = new mongoose.Schema({
  title: String,
  content: String, // HTML from editor
  tokens: [String],
  headerHeight: Number,
  footerHeight: Number,
  headerImage: String,
  footerImage: String,
});

const Document = mongoose.model("Document", DocumentSchema);

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const getMimeType = (filePath) => {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
    return "image/jpeg";
  return "image/png";
};

// Upload letterhead
app.post("/upload", upload.single("file"), (req, res) => {
  const { type } = req.body; // "header" or "footer"
  console.log("askjdkfs", type, req.file);

  res.json({ filePath: `/uploads/${req.file.filename}`, type });
});

// Create document
app.post("/documents", async (req, res) => {
  const doc = await Document.create(req.body);
  res.json(doc);
});

// Get documents
app.get("/documents", async (req, res) => {
  const docs = await Document.find();
  res.json(docs);
});

// Generate document with tokens
app.post("/generate/:id", async (req, res) => {
  const { tokenValues } = req.body;
  const doc = await Document.findById(req.params.id);

  let content = doc.content;

  doc.tokens.forEach((token) => {
    const value = tokenValues[token] || "";
    const regex = new RegExp(`{{${token}}}`, "g");
    content = content.replace(regex, value);
  });

  res.json({
    ...doc.toObject(),
    generatedContent: content,
  });
});

app.get("/download/:id", async (req, res) => {
  const doc = await Document.findById(req.params.id);

  // Static token values (for now)
  const tokenValues = {
    employee_name: "Neeraj Yadav",
    current_date: "19 March 2026",
    "Effective Date": "19 March 2026",
    amount: "₹50,000",
    day_number: "19",
    month: "March",
    year: "2026",
  };

  let content = doc.content;

  console.log("starting>>>>>>>>", content);
  Object.keys(tokenValues).forEach((token) => {
    const regex = new RegExp(`{${token}}`, "g");
    content = content.replace(regex, tokenValues[token]);
  });
  console.log("ending<<<<<<<<<<<", content);

  // Full HTML template
  const html = `
    <html>
      <head>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
          }
          .page {
            position: relative;
            width: 100%;
            min-height: 100vh;
          }
          .letterhead {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;

            object-fit: cover;
            z-index: 0;
          }
          .content {
            position: relative;
            z-index: 1;

            padding-left: 40px;
            padding-right: 40px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="content">
            ${content}
          </div>
        </div>
      </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  //   await page.setContent(html, { waitUntil: "networkidle0" });
  await page.setContent(html, { waitUntil: "load" });
  //   await page.waitForTimeout(500); // important

  let headerTemplate = `<div></div>`;
  let footerTemplate = `<div></div>`;

  let marginTop = "20px";
  let marginBottom = "20px";

  // HEADER IMAGE
  if (doc.headerImage) {
    const headerPath = path.join(__dirname, doc.headerImage);
    const headerBase64 = fs.readFileSync(headerPath, "base64");

    headerTemplate = `
    <div style="width:100%; margin:0; padding:0;">
      <img 
        src="data:${getMimeType(doc.headerImage)};base64,${headerBase64}"
        style="width:100%; display:block;"
      />
    </div>
  `;

    marginTop = `${doc.headerHeight}px`;
  }

  // FOOTER IMAGE
  if (doc.footerImage) {
    const footerPath = path.join(__dirname, doc.footerImage);
    const footerBase64 = fs.readFileSync(footerPath, "base64");

    footerTemplate = `
    <div style="width:100%; margin:0; padding:0;">
      <img 
        src="data:${getMimeType(doc.footerImage)};base64,${footerBase64}"
        style="width:100%; display:block;"
      />
    </div>
  `;

    marginBottom = `${doc.footerHeight}px`;
  }
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,

    displayHeaderFooter: true,

    headerTemplate,
    footerTemplate,

    margin: {
      top: marginTop,
      bottom: marginBottom,
      left: "40px",
      right: "40px",
    },
  });

  await browser.close();

  //   res.set({
  //     "Content-Type": "application/pdf",
  //     "Content-Disposition": "attachment; filename=document.pdf",
  //   });

  //   res.send(pdf);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": pdf.length,
    "Content-Disposition": "attachment; filename=document.pdf",
  });

  res.end(pdf);
});

app.listen(8080, () => console.log("Server running on 8080"));
