/**
 * The geography Mediaory organises sources by: World → continent → country.
 * Today the catalog is Türkiye only; this tree is what lets coverage grow to
 * other countries — or to a whole continent — without restructuring anything:
 * a source stores its ISO country code, and the continent is derived here.
 *
 * Transcontinental countries (Türkiye, Russia, Egypt …) list a second
 * continent in `alsoIn`, so they appear under both when you browse by continent.
 * The list covers the countries media monitoring is commonly asked about; a
 * source with a code that is not listed still works and is shown as "Other".
 */
export const CONTINENTS = [
  { code: "EU", name: "Europe" },
  { code: "AS", name: "Asia" },
  { code: "AF", name: "Africa" },
  { code: "NA", name: "North America" },
  { code: "SA", name: "South America" },
  { code: "OC", name: "Oceania" },
] as const;
export type ContinentCode = (typeof CONTINENTS)[number]["code"];

export type Country = {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  continent: ContinentCode;
  /** A second continent for transcontinental countries. */
  alsoIn?: ContinentCode;
};

export const COUNTRIES: readonly Country[] = [
  { code: "AF", name: "Afghanistan", continent: "AS" },
  { code: "AL", name: "Albania", continent: "EU" },
  { code: "DZ", name: "Algeria", continent: "AF" },
  { code: "AO", name: "Angola", continent: "AF" },
  { code: "AR", name: "Argentina", continent: "SA" },
  { code: "AM", name: "Armenia", continent: "AS" },
  { code: "AU", name: "Australia", continent: "OC" },
  { code: "AT", name: "Austria", continent: "EU" },
  { code: "AZ", name: "Azerbaijan", continent: "AS", alsoIn: "EU" },
  { code: "BH", name: "Bahrain", continent: "AS" },
  { code: "BD", name: "Bangladesh", continent: "AS" },
  { code: "BY", name: "Belarus", continent: "EU" },
  { code: "BE", name: "Belgium", continent: "EU" },
  { code: "BJ", name: "Benin", continent: "AF" },
  { code: "BO", name: "Bolivia", continent: "SA" },
  { code: "BA", name: "Bosnia and Herzegovina", continent: "EU" },
  { code: "BW", name: "Botswana", continent: "AF" },
  { code: "BR", name: "Brazil", continent: "SA" },
  { code: "BG", name: "Bulgaria", continent: "EU" },
  { code: "BF", name: "Burkina Faso", continent: "AF" },
  { code: "KH", name: "Cambodia", continent: "AS" },
  { code: "CM", name: "Cameroon", continent: "AF" },
  { code: "CA", name: "Canada", continent: "NA" },
  { code: "CL", name: "Chile", continent: "SA" },
  { code: "CN", name: "China", continent: "AS" },
  { code: "CO", name: "Colombia", continent: "SA" },
  { code: "CR", name: "Costa Rica", continent: "NA" },
  { code: "HR", name: "Croatia", continent: "EU" },
  { code: "CU", name: "Cuba", continent: "NA" },
  { code: "CY", name: "Cyprus", continent: "EU", alsoIn: "AS" },
  { code: "CZ", name: "Czechia", continent: "EU" },
  { code: "CI", name: "Côte d'Ivoire", continent: "AF" },
  { code: "CD", name: "DR Congo", continent: "AF" },
  { code: "DK", name: "Denmark", continent: "EU" },
  { code: "DO", name: "Dominican Republic", continent: "NA" },
  { code: "EC", name: "Ecuador", continent: "SA" },
  { code: "EG", name: "Egypt", continent: "AF", alsoIn: "AS" },
  { code: "SV", name: "El Salvador", continent: "NA" },
  { code: "EE", name: "Estonia", continent: "EU" },
  { code: "ET", name: "Ethiopia", continent: "AF" },
  { code: "FI", name: "Finland", continent: "EU" },
  { code: "FR", name: "France", continent: "EU" },
  { code: "GE", name: "Georgia", continent: "AS", alsoIn: "EU" },
  { code: "DE", name: "Germany", continent: "EU" },
  { code: "GH", name: "Ghana", continent: "AF" },
  { code: "GR", name: "Greece", continent: "EU" },
  { code: "GT", name: "Guatemala", continent: "NA" },
  { code: "HN", name: "Honduras", continent: "NA" },
  { code: "HK", name: "Hong Kong", continent: "AS" },
  { code: "HU", name: "Hungary", continent: "EU" },
  { code: "IS", name: "Iceland", continent: "EU" },
  { code: "IN", name: "India", continent: "AS" },
  { code: "ID", name: "Indonesia", continent: "AS" },
  { code: "IR", name: "Iran", continent: "AS" },
  { code: "IQ", name: "Iraq", continent: "AS" },
  { code: "IE", name: "Ireland", continent: "EU" },
  { code: "IL", name: "Israel", continent: "AS" },
  { code: "IT", name: "Italy", continent: "EU" },
  { code: "JM", name: "Jamaica", continent: "NA" },
  { code: "JP", name: "Japan", continent: "AS" },
  { code: "JO", name: "Jordan", continent: "AS" },
  { code: "KZ", name: "Kazakhstan", continent: "AS", alsoIn: "EU" },
  { code: "KE", name: "Kenya", continent: "AF" },
  { code: "XK", name: "Kosovo", continent: "EU" },
  { code: "KW", name: "Kuwait", continent: "AS" },
  { code: "KG", name: "Kyrgyzstan", continent: "AS" },
  { code: "LV", name: "Latvia", continent: "EU" },
  { code: "LB", name: "Lebanon", continent: "AS" },
  { code: "LY", name: "Libya", continent: "AF" },
  { code: "LI", name: "Liechtenstein", continent: "EU" },
  { code: "LT", name: "Lithuania", continent: "EU" },
  { code: "LU", name: "Luxembourg", continent: "EU" },
  { code: "MY", name: "Malaysia", continent: "AS" },
  { code: "MT", name: "Malta", continent: "EU" },
  { code: "MX", name: "Mexico", continent: "NA" },
  { code: "MD", name: "Moldova", continent: "EU" },
  { code: "MC", name: "Monaco", continent: "EU" },
  { code: "MN", name: "Mongolia", continent: "AS" },
  { code: "ME", name: "Montenegro", continent: "EU" },
  { code: "MA", name: "Morocco", continent: "AF" },
  { code: "MZ", name: "Mozambique", continent: "AF" },
  { code: "MM", name: "Myanmar", continent: "AS" },
  { code: "NP", name: "Nepal", continent: "AS" },
  { code: "NL", name: "Netherlands", continent: "EU" },
  { code: "NZ", name: "New Zealand", continent: "OC" },
  { code: "NI", name: "Nicaragua", continent: "NA" },
  { code: "NG", name: "Nigeria", continent: "AF" },
  { code: "MK", name: "North Macedonia", continent: "EU" },
  { code: "NO", name: "Norway", continent: "EU" },
  { code: "OM", name: "Oman", continent: "AS" },
  { code: "PK", name: "Pakistan", continent: "AS" },
  { code: "PS", name: "Palestine", continent: "AS" },
  { code: "PA", name: "Panama", continent: "NA" },
  { code: "PY", name: "Paraguay", continent: "SA" },
  { code: "PE", name: "Peru", continent: "SA" },
  { code: "PH", name: "Philippines", continent: "AS" },
  { code: "PL", name: "Poland", continent: "EU" },
  { code: "PT", name: "Portugal", continent: "EU" },
  { code: "QA", name: "Qatar", continent: "AS" },
  { code: "RO", name: "Romania", continent: "EU" },
  { code: "RU", name: "Russia", continent: "EU", alsoIn: "AS" },
  { code: "SA", name: "Saudi Arabia", continent: "AS" },
  { code: "SN", name: "Senegal", continent: "AF" },
  { code: "RS", name: "Serbia", continent: "EU" },
  { code: "SG", name: "Singapore", continent: "AS" },
  { code: "SK", name: "Slovakia", continent: "EU" },
  { code: "SI", name: "Slovenia", continent: "EU" },
  { code: "ZA", name: "South Africa", continent: "AF" },
  { code: "KR", name: "South Korea", continent: "AS" },
  { code: "ES", name: "Spain", continent: "EU" },
  { code: "LK", name: "Sri Lanka", continent: "AS" },
  { code: "SD", name: "Sudan", continent: "AF" },
  { code: "SE", name: "Sweden", continent: "EU" },
  { code: "CH", name: "Switzerland", continent: "EU" },
  { code: "SY", name: "Syria", continent: "AS" },
  { code: "TW", name: "Taiwan", continent: "AS" },
  { code: "TJ", name: "Tajikistan", continent: "AS" },
  { code: "TZ", name: "Tanzania", continent: "AF" },
  { code: "TH", name: "Thailand", continent: "AS" },
  { code: "TN", name: "Tunisia", continent: "AF" },
  { code: "TM", name: "Turkmenistan", continent: "AS" },
  { code: "TR", name: "Türkiye", continent: "AS", alsoIn: "EU" },
  { code: "UG", name: "Uganda", continent: "AF" },
  { code: "UA", name: "Ukraine", continent: "EU" },
  { code: "AE", name: "United Arab Emirates", continent: "AS" },
  { code: "GB", name: "United Kingdom", continent: "EU" },
  { code: "US", name: "United States", continent: "NA" },
  { code: "UY", name: "Uruguay", continent: "SA" },
  { code: "UZ", name: "Uzbekistan", continent: "AS" },
  { code: "VE", name: "Venezuela", continent: "SA" },
  { code: "VN", name: "Vietnam", continent: "AS" },
  { code: "YE", name: "Yemen", continent: "AS" },
  { code: "ZM", name: "Zambia", continent: "AF" },
  { code: "ZW", name: "Zimbabwe", continent: "AF" },
];

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

/** "world" = no restriction; otherwise a continent code or an ISO country code. */
export type RegionScope = "world" | ContinentCode | (string & {});

export function countryByCode(code: string | null | undefined): Country | undefined {
  return code ? BY_CODE.get(code.toUpperCase()) : undefined;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  return countryByCode(code)?.name ?? code.toUpperCase();
}

export function isContinentCode(value: string): value is ContinentCode {
  return CONTINENTS.some((continent) => continent.code === value);
}

export function continentName(code: ContinentCode): string {
  return CONTINENTS.find((continent) => continent.code === code)?.name ?? code;
}

/** Continents a country belongs to (empty for an unlisted code). */
export function continentsOfCountry(code: string | null | undefined): ContinentCode[] {
  const country = countryByCode(code);
  if (!country) return [];
  return country.alsoIn ? [country.continent, country.alsoIn] : [country.continent];
}

export function countriesInContinent(continent: ContinentCode): Country[] {
  return COUNTRIES.filter((country) => country.continent === continent || country.alsoIn === continent);
}

/** Does a source from `countryCode` fall inside the chosen scope? */
export function countryInScope(countryCode: string | null | undefined, scope: RegionScope): boolean {
  if (scope === "world") return true;
  if (!countryCode) return false;
  if (isContinentCode(scope)) return continentsOfCountry(countryCode).includes(scope);
  return countryCode.toUpperCase() === scope.toUpperCase();
}

/** ISO codes covered by a scope, or null for "world" (no restriction). */
export function countryCodesInScope(scope: RegionScope): string[] | null {
  if (scope === "world") return null;
  if (isContinentCode(scope)) return countriesInContinent(scope).map((country) => country.code);
  return [scope.toUpperCase()];
}
