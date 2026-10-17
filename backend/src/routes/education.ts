
import { Router } from "express";

const educationRouter = Router();

// Temporary educational examples.
// These are not yet clinically reviewed or approved for production.
const topics = [
  {
    id: "hydration",
    title: "Understanding hydration",
    summary:
      "Water helps your body regulate temperature and maintain normal functions.",
    guidance:
      "Fluid needs vary with activity, climate, age, and health. Ask a qualified healthcare professional for advice about individual fluid needs if you have a medical condition that affects fluid intake.",
    sourceStatus: "illustrative-example",
  },
  {
    id: "hand-hygiene",
    title: "Understanding hand hygiene",
    summary:
      "Cleaning your hands helps reduce the spread of many germs.",
    guidance:
      "Wash your hands with soap and clean running water, including the backs of your hands and between your fingers. When soap and water are unavailable, an appropriate alcohol-based hand sanitizer may be an alternative.",
    sourceStatus: "illustrative-example",
  },
];

// GET /api/education
// Return the available general health education topics.
educationRouter.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "General health education topics retrieved.",
    disclaimer:
      "Educational information only. These examples have not been clinically reviewed for this product and are not a substitute for professional medical advice.",
    topics,
  });
});

// GET /api/education/:id
// Return one topic by its ID.
educationRouter.get("/:id", (req, res) => {
  const topic = topics.find((item) => item.id === req.params.id);

  if (!topic) {
    res.status(404).json({
      status: "error",
      message: "The requested education topic was not found.",
    });
    return;
  }

  res.status(200).json({
    status: "ok",
    topic,
    disclaimer:
      "Educational information only. These examples have not been clinically reviewed for this product and are not a substitute for professional medical advice.",
  });
});

export default educationRouter;
