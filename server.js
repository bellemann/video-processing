import express from "express";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import multer from "multer";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const AUTH_KEY = process.env.AUTH_KEY;

app.post("/process", upload.single("video"), async (req, res) => {
  // Auth check
  if (req.headers.authorization !== `Bearer ${AUTH_KEY}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No video provided" });
  }

  const tempInput = `/tmp/input_${Date.now()}.mp4`;
  const videoOutput = `/tmp/video_${Date.now()}_720p.mp4`;
  const thumbnailOutput = `/tmp/thumb_${Date.now()}.jpg`;

  // Write buffer to temp file
  fs.writeFileSync(tempInput, req.file.buffer);

  // Check duration
  ffmpeg.ffprobe(tempInput, (err, metadata) => {
    if (err) {
      fs.unlinkSync(tempInput);
      return res.status(400).json({ error: "Invalid video" });
    }

    const duration = metadata.format.duration;
    if (duration > 60) {
      fs.unlinkSync(tempInput);
      return res.status(400).json({ error: "Video must be under 1 minute" });
    }

    processVideo();
  });

  function processVideo() {
    ffmpeg(tempInput)
      .outputOptions([
        "-vf scale=1280:720:force_original_aspect_ratio=decrease",
        "-r 30",
        "-c:v libx264",
        "-crf 23",
        "-c:a aac",
        "-b:a 128k",
      ])
      .output(videoOutput)
      .on("end", () => generateThumbnail())
      .on("error", (err) => {
        cleanup();
        res.status(500).json({ error: err.message });
      })
      .run();
  }

  function generateThumbnail() {
    ffmpeg(tempInput)
      .screenshots({
        timestamps: ["00:00:01"],
        filename: `thumb_${Date.now()}.jpg`,
        folder: "/tmp",
        size: "320x180",
      })
      .on("end", () => {
        const video = fs.readFileSync(videoOutput);
        const thumb = fs.readFileSync(thumbnailOutput);
        cleanup();
        res.json({
          video: video.toString("base64"),
          thumbnail: thumb.toString("base64"),
        });
      })
      .on("error", (err) => {
        cleanup();
        res.status(500).json({ error: err.message });
      });
  }

  function cleanup() {
    [tempInput, videoOutput, thumbnailOutput].forEach((file) => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  }
});

app.listen(3000, () => console.log("Server running on :3000"));
