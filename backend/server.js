
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Only PDF files are allowed"));
        }
    }
});

app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No PDF uploaded" });
        }

        const formData = new FormData();

        const pdfBlob = new Blob([req.file.buffer], {
            type: "application/pdf"
        });

        formData.append("file", pdfBlob, req.file.originalname);
        formData.append("network", "public");

        const response = await fetch(
            "https://uploads.pinata.cloud/v3/files",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.PINATA_JWT}`
                },
                body: formData
            }
        );

        const result = await response.json();

        if (!response.ok) {
            console.error(result);
            return res.status(response.status).json({
                error: "Pinata upload failed"
            });
        }

        res.json({
            success: true,
            cid: result.data.cid,
            name: result.data.name
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Server upload failed"
        });
    }
});

app.listen(process.env.PORT || 5000, () => {
    console.log(`CertiChain backend running on port ${process.env.PORT || 5000}`);
});
