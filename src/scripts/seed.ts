import fs from "fs";
import axios from "axios";
import { getPool, initDB } from "../config/database";
import { v7 as uuidv7 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

// Define strict profile row matching expected JSON structure
interface RawProfile {
  id?: string;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name?: string;
  country_probability: number;
  created_at?: string;
  // If sample_size is missing in the data, we mock it. Stage 1 has sample_size
  sample_size?: number;
}

const FILE_ID = "1Up06dcS9OfUEnDj_u6OV_xTRntupFhPH";
const DOWNLOAD_URL = `https://drive.google.com/uc?export=download&id=${FILE_ID}`;

async function downloadData(url: string): Promise<RawProfile[]> {
  console.log(`Downloading profiles data from Google Drive...`);
  try {
    const response = await axios.get(url, { responseType: "json" });
    return response.data;
  } catch (error: any) {
    console.error("Failed to download data natively:", error.message);
    
    // Fallback if Google Drive shows virus warning for large files:
    // It requires extracting the `confirm` token from cookies or HTML.
    // Given the size (2026 profiles ~ 300KB), it might just download directly.
    return [];
  }
}

async function runSeed() {
  try {
    console.log("Initializing database schema...");
    await initDB();
    
    const pool = getPool();

    let dataText: string;
    try {
      dataText = fs.readFileSync("raw_drive.html", "utf-8");
    } catch (e: any) {
      console.log("No local file found, downloading...");
      // Download if not exists
      const res = await axios.get(DOWNLOAD_URL, { responseType: "json" });
      dataText = JSON.stringify(res.data);
    }
    
    const parsedData = JSON.parse(dataText);
    let profiles = Array.isArray(parsedData) ? parsedData : parsedData.profiles;
    
    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      console.error("No profiles downloaded. Check if the Google Drive link requires confirmation.");
      throw new Error("Empty dataset");
    }

    console.log(`Downloaded ${profiles.length} profiles. Starting seeding process...`);

    const regionNamesInEnglish = new Intl.DisplayNames(['en'], { type: 'region' });

    for (let p of profiles) {
      const id = p.id || uuidv7();
      
      let countryName = p.country_name || p.country_id;
      if (!p.country_name) {
        try {
          countryName = regionNamesInEnglish.of(p.country_id) || p.country_id;
        } catch { }
      }

      const sample_size = p.sample_size || 1000; // default for mock data
      const created_at = p.created_at || new Date().toISOString();

      await pool.query(
        `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_name, country_probability, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          id,
          p.name,
          p.gender,
          p.gender_probability,
          sample_size,
          p.age,
          p.age_group,
          p.country_id,
          countryName,
          p.country_probability,
          created_at
        ]
      );
    }
    
    console.log("✅ Database seeded successfully!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

runSeed();
