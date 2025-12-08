// backend/server.js

import express from "express";
import connectDb from "./config/config.js";
import userRouter from "./routers/router.js";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

app.use("/api", userRouter);

app.get("/health", (req, res) => res.json({ ok: true, message: "Geh!" }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

app.listen(process.env.PORT || 4000, () => {
  console.log(
    `Server is running on http://localhost:${process.env.PORT || 4000}`,
  );
  connectDb();
});
