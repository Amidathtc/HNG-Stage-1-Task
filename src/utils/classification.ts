/**
 * Classify age into an age group based on the specification:
 * 0–12 → child, 13–19 → teenager, 20–59 → adult, 60+ → senior
 */
export function getAgeGroup(age: number): string {
  if (age >= 0 && age <= 12) return "child";
  if (age >= 13 && age <= 19) return "teenager";
  if (age >= 20 && age <= 59) return "adult";
  if (age >= 60) return "senior";
  return "unknown";
}

export interface NationalizeCountry {
  country_id: string;
  probability: number;
}

/**
 * Extract the country with the highest probability from the Nationalize response.
 */
export function getTopCountry(
  countries: NationalizeCountry[]
): NationalizeCountry | null {
  if (!countries || !Array.isArray(countries) || countries.length === 0) {
    return null;
  }

  return countries.reduce((top, current) =>
    current.probability > top.probability ? current : top
  );
}
