import { Request, Response } from "express";
import * as countries from "i18n-iso-countries";
// Load english data for i18n
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

function parseNaturalLanguageQuery(queryText: string) {
  const query = queryText.toLowerCase().trim();
  const filters: Record<string, string> = {};

  let interpreted = false;

  // 1. Gender mapping
  if (/\b(?:males?|men|boy|boys)\b/.test(query)) {
    filters.gender = "male";
    interpreted = true;
  } else if (/\b(?:females?|women|girls?)\b/.test(query)) {
    filters.gender = "female";
    interpreted = true;
  }

  // 2. Age mappings
  if (/\byoung\b/.test(query)) {
    // "young maps to ages 16–24 for parsing purposes only"
    filters.min_age = "16";
    filters.max_age = "24";
    interpreted = true;
  }

  if (/\b(?:children|child)\b/.test(query)) {
    filters.age_group = "child";
    interpreted = true;
  } else if (/\b(?:teenagers?|teens?)\b/.test(query)) {
    filters.age_group = "teenager";
    interpreted = true;
  } else if (/\b(?:adults?)\b/.test(query)) {
    filters.age_group = "adult";
    interpreted = true;
  } else if (/\b(?:seniors?)\b/.test(query)) {
    filters.age_group = "senior";
    interpreted = true;
  }

  // 3. Above / Below maps (e.g., "above 30", "over 18")
  const aboveMatch = query.match(/\b(?:above|over)\s+(\d+)\b/);
  if (aboveMatch) {
    filters.min_age = aboveMatch[1];
    interpreted = true;
  }

  const belowMatch = query.match(/\b(?:below|under)\s+(\d+)\b/);
  if (belowMatch) {
    filters.max_age = belowMatch[1];
    interpreted = true;
  }
  
  // 4. Extract country
  // We look for "from [Country]" or "in [Country]"
  // Because country names can be multi-word, we look for anything after "from" or "in" and try to match it.
  const countryMatchRegex = /\b(?:from|in)\s+([a-z\s]+)(?:$|\babove\b|\bbelow\b|\bwith\b|\band\b|\bover\b|\bunder\b|\byoung\b|\bmales?\b|\bfemales?\b)/;
  const countryMatch = query.match(countryMatchRegex);
  
  if (countryMatch) {
    const rawCountry = countryMatch[1].trim();
    // Use library to get alpha-2 code from country name
    const code = countries.getAlpha2Code(rawCountry, "en");
    if (code) {
      filters.country_id = code;
      interpreted = true;
    } else {
      // In case user writes something like "people from somewhere", maybe it doesn't match a country
      // But typically we should parse it. Let's see if there is any other exact match
      // i18n-iso-countries supports "United States of America" -> "US", built-in.
    }
  }

  // We should return false if nothing could be matched at all
  if (!interpreted) {
    return null;
  }

  return filters;
}

export async function searchProfiles(req: Request, res: Response): Promise<void> {
  let { q, page, limit, order, sort_by } = req.query;

  if (!q || typeof q !== "string" || q.trim() === "") {
    res.status(400).json({
      status: "error",
      message: "Missing or empty query string",
    });
    return;
  }

  const parsedFilters = parseNaturalLanguageQuery(q);

  if (!parsedFilters) {
    res.status(400).json({
      status: "error",
      // Based on instructions: return 400 for inability to interpret, actually instructions say:
      // "Queries that can't be interpreted return { status: 'error', message: 'Unable to interpret query' }"
      message: "Unable to interpret query"
    });
    return;
  }

  // Setup proxy parameters for getAllProfiles
  req.query = {
    ...req.query,
    ...parsedFilters
  };

  // Import dynamically or directly reference the controller method for getAllProfiles
  const { getAllProfiles } = require('./profileController');
  
  // We can just call getAllProfiles, it uses req.query which is now hydrated with parsedFilters + existing params like page and limit
  await getAllProfiles(req, res);
}
