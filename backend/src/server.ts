import "dotenv/config";

import cors from "cors";
import express from "express";
import helmet from "helmet";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "MediGuide AI backend",
    message: "Backend server is running.",
  });
});

app.listen(PORT, () => {
  console.log(`MediGuide AI backend running on port ${PORT}`);
});