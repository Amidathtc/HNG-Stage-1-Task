import axios from "axios";

const GENDERIZE_URL = "https://api.genderize.io";
const AGIFY_URL = "https://api.agify.io";
const NATIONALIZE_URL = "https://api.nationalize.io";

export interface GenderizeResponse {
  count: number;
  name: string;
  gender: string | null;
  probability: number;
}

export interface AgifyResponse {
  count: number;
  name: string;
  age: number | null;
}

export interface NationalizeResponse {
  count: number;
  name: string;
  country: Array<{ country_id: string; probability: number }>;
}

/**
 * Fetch gender prediction from Genderize API.
 */
async function fetchGender(name: string): Promise<GenderizeResponse> {
  try {
    const response = await axios.get<GenderizeResponse>(GENDERIZE_URL, {
      params: { name },
      timeout: 10000,
    });
    return response.data;
  } catch {
    throw new Error("Genderize");
  }
}

/**
 * Fetch age prediction from Agify API.
 */
async function fetchAge(name: string): Promise<AgifyResponse> {
  try {
    const response = await axios.get<AgifyResponse>(AGIFY_URL, {
      params: { name },
      timeout: 10000,
    });
    return response.data;
  } catch {
    throw new Error("Agify");
  }
}

/**
 * Fetch nationality prediction from Nationalize API.
 */
async function fetchNationality(name: string): Promise<NationalizeResponse> {
  try {
    const response = await axios.get<NationalizeResponse>(NATIONALIZE_URL, {
      params: { name },
      timeout: 10000,
    });
    return response.data;
  } catch {
    throw new Error("Nationalize");
  }
}

export interface ExternalData {
  genderData: GenderizeResponse;
  ageData: AgifyResponse;
  nationalityData: NationalizeResponse;
}

/**
 * Fetch all three external APIs in parallel.
 */
export async function fetchAllExternalData(name: string): Promise<ExternalData> {
  const [genderData, ageData, nationalityData] = await Promise.all([
    fetchGender(name),
    fetchAge(name),
    fetchNationality(name),
  ]);

  return { genderData, ageData, nationalityData };
}
