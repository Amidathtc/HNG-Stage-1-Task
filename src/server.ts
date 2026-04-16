import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { initDB } from "./config/database";

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDB();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
