/**
 * The geography Mediaory organises sources by: World → continent → country.
 *
 * Continent codes are three letters (EUR, ASI, AFR, NAM, SAM, OCE) on purpose: two-letter
 * ISO country codes already use AF (Afghanistan), NA (Namibia) and SA (Saudi Arabia), and a
 * country must never be mistaken for a continent.
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
  { code: "EUR", name: "Europe" },
  { code: "ASI", name: "Asia" },
  { code: "AFR", name: "Africa" },
  { code: "NAM", name: "North America" },
  { code: "SAM", name: "South America" },
  { code: "OCE", name: "Oceania" },
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

const COUNTRY_LIST: Country[] = [
  { code: "AF", name: "Afghanistan", continent: "ASI" },
  { code: "AL", name: "Albania", continent: "EUR" },
  { code: "DZ", name: "Algeria", continent: "AFR" },
  { code: "AO", name: "Angola", continent: "AFR" },
  { code: "AR", name: "Argentina", continent: "SAM" },
  { code: "AM", name: "Armenia", continent: "ASI" },
  { code: "AU", name: "Australia", continent: "OCE" },
  { code: "AT", name: "Austria", continent: "EUR" },
  { code: "AZ", name: "Azerbaijan", continent: "ASI", alsoIn: "EUR" },
  { code: "BH", name: "Bahrain", continent: "ASI" },
  { code: "BD", name: "Bangladesh", continent: "ASI" },
  { code: "BY", name: "Belarus", continent: "EUR" },
  { code: "BE", name: "Belgium", continent: "EUR" },
  { code: "BJ", name: "Benin", continent: "AFR" },
  { code: "BO", name: "Bolivia", continent: "SAM" },
  { code: "BA", name: "Bosnia and Herzegovina", continent: "EUR" },
  { code: "BW", name: "Botswana", continent: "AFR" },
  { code: "BR", name: "Brazil", continent: "SAM" },
  { code: "BG", name: "Bulgaria", continent: "EUR" },
  { code: "BF", name: "Burkina Faso", continent: "AFR" },
  { code: "KH", name: "Cambodia", continent: "ASI" },
  { code: "CM", name: "Cameroon", continent: "AFR" },
  { code: "CA", name: "Canada", continent: "NAM" },
  { code: "CL", name: "Chile", continent: "SAM" },
  { code: "CN", name: "China", continent: "ASI" },
  { code: "CO", name: "Colombia", continent: "SAM" },
  { code: "CR", name: "Costa Rica", continent: "NAM" },
  { code: "HR", name: "Croatia", continent: "EUR" },
  { code: "CU", name: "Cuba", continent: "NAM" },
  { code: "CY", name: "Cyprus", continent: "EUR", alsoIn: "ASI" },
  { code: "CZ", name: "Czechia", continent: "EUR" },
  { code: "CI", name: "Côte d'Ivoire", continent: "AFR" },
  { code: "CD", name: "DR Congo", continent: "AFR" },
  { code: "DK", name: "Denmark", continent: "EUR" },
  { code: "DO", name: "Dominican Republic", continent: "NAM" },
  { code: "EC", name: "Ecuador", continent: "SAM" },
  { code: "EG", name: "Egypt", continent: "AFR", alsoIn: "ASI" },
  { code: "SV", name: "El Salvador", continent: "NAM" },
  { code: "EE", name: "Estonia", continent: "EUR" },
  { code: "ET", name: "Ethiopia", continent: "AFR" },
  { code: "FI", name: "Finland", continent: "EUR" },
  { code: "FR", name: "France", continent: "EUR" },
  { code: "GE", name: "Georgia", continent: "ASI", alsoIn: "EUR" },
  { code: "DE", name: "Germany", continent: "EUR" },
  { code: "GH", name: "Ghana", continent: "AFR" },
  { code: "GR", name: "Greece", continent: "EUR" },
  { code: "GT", name: "Guatemala", continent: "NAM" },
  { code: "HN", name: "Honduras", continent: "NAM" },
  { code: "HK", name: "Hong Kong", continent: "ASI" },
  { code: "HU", name: "Hungary", continent: "EUR" },
  { code: "IS", name: "Iceland", continent: "EUR" },
  { code: "IN", name: "India", continent: "ASI" },
  { code: "ID", name: "Indonesia", continent: "ASI" },
  { code: "IR", name: "Iran", continent: "ASI" },
  { code: "IQ", name: "Iraq", continent: "ASI" },
  { code: "IE", name: "Ireland", continent: "EUR" },
  { code: "IL", name: "Israel", continent: "ASI" },
  { code: "IT", name: "Italy", continent: "EUR" },
  { code: "JM", name: "Jamaica", continent: "NAM" },
  { code: "JP", name: "Japan", continent: "ASI" },
  { code: "JO", name: "Jordan", continent: "ASI" },
  { code: "KZ", name: "Kazakhstan", continent: "ASI", alsoIn: "EUR" },
  { code: "KE", name: "Kenya", continent: "AFR" },
  { code: "XK", name: "Kosovo", continent: "EUR" },
  { code: "KW", name: "Kuwait", continent: "ASI" },
  { code: "KG", name: "Kyrgyzstan", continent: "ASI" },
  { code: "LV", name: "Latvia", continent: "EUR" },
  { code: "LB", name: "Lebanon", continent: "ASI" },
  { code: "LY", name: "Libya", continent: "AFR" },
  { code: "LI", name: "Liechtenstein", continent: "EUR" },
  { code: "LT", name: "Lithuania", continent: "EUR" },
  { code: "LU", name: "Luxembourg", continent: "EUR" },
  { code: "MY", name: "Malaysia", continent: "ASI" },
  { code: "MT", name: "Malta", continent: "EUR" },
  { code: "MX", name: "Mexico", continent: "NAM" },
  { code: "MD", name: "Moldova", continent: "EUR" },
  { code: "MC", name: "Monaco", continent: "EUR" },
  { code: "MN", name: "Mongolia", continent: "ASI" },
  { code: "ME", name: "Montenegro", continent: "EUR" },
  { code: "MA", name: "Morocco", continent: "AFR" },
  { code: "MZ", name: "Mozambique", continent: "AFR" },
  { code: "MM", name: "Myanmar", continent: "ASI" },
  { code: "NP", name: "Nepal", continent: "ASI" },
  { code: "NL", name: "Netherlands", continent: "EUR" },
  { code: "NZ", name: "New Zealand", continent: "OCE" },
  { code: "NI", name: "Nicaragua", continent: "NAM" },
  { code: "NG", name: "Nigeria", continent: "AFR" },
  { code: "MK", name: "North Macedonia", continent: "EUR" },
  { code: "NO", name: "Norway", continent: "EUR" },
  { code: "OM", name: "Oman", continent: "ASI" },
  { code: "PK", name: "Pakistan", continent: "ASI" },
  { code: "PS", name: "Palestine", continent: "ASI" },
  { code: "PA", name: "Panama", continent: "NAM" },
  { code: "PY", name: "Paraguay", continent: "SAM" },
  { code: "PE", name: "Peru", continent: "SAM" },
  { code: "PH", name: "Philippines", continent: "ASI" },
  { code: "PL", name: "Poland", continent: "EUR" },
  { code: "PT", name: "Portugal", continent: "EUR" },
  { code: "QA", name: "Qatar", continent: "ASI" },
  { code: "RO", name: "Romania", continent: "EUR" },
  { code: "RU", name: "Russia", continent: "EUR", alsoIn: "ASI" },
  { code: "SA", name: "Saudi Arabia", continent: "ASI" },
  { code: "SN", name: "Senegal", continent: "AFR" },
  { code: "RS", name: "Serbia", continent: "EUR" },
  { code: "SG", name: "Singapore", continent: "ASI" },
  { code: "SK", name: "Slovakia", continent: "EUR" },
  { code: "SI", name: "Slovenia", continent: "EUR" },
  { code: "ZA", name: "South Africa", continent: "AFR" },
  { code: "KR", name: "South Korea", continent: "ASI" },
  { code: "ES", name: "Spain", continent: "EUR" },
  { code: "LK", name: "Sri Lanka", continent: "ASI" },
  { code: "SD", name: "Sudan", continent: "AFR" },
  { code: "SE", name: "Sweden", continent: "EUR" },
  { code: "CH", name: "Switzerland", continent: "EUR" },
  { code: "SY", name: "Syria", continent: "ASI" },
  { code: "TW", name: "Taiwan", continent: "ASI" },
  { code: "TJ", name: "Tajikistan", continent: "ASI" },
  { code: "TZ", name: "Tanzania", continent: "AFR" },
  { code: "TH", name: "Thailand", continent: "ASI" },
  { code: "TN", name: "Tunisia", continent: "AFR" },
  { code: "TM", name: "Turkmenistan", continent: "ASI" },
  { code: "TR", name: "Türkiye", continent: "ASI", alsoIn: "EUR" },
  { code: "UG", name: "Uganda", continent: "AFR" },
  { code: "UA", name: "Ukraine", continent: "EUR" },
  { code: "AE", name: "United Arab Emirates", continent: "ASI" },
  { code: "GB", name: "United Kingdom", continent: "EUR" },
  { code: "US", name: "United States", continent: "NAM" },
  { code: "UY", name: "Uruguay", continent: "SAM" },
  { code: "UZ", name: "Uzbekistan", continent: "ASI" },
  { code: "VE", name: "Venezuela", continent: "SAM" },
  { code: "VN", name: "Vietnam", continent: "ASI" },
  { code: "YE", name: "Yemen", continent: "ASI" },
  { code: "ZM", name: "Zambia", continent: "AFR" },
  { code: "ZW", name: "Zimbabwe", continent: "AFR" },
  // Added with the world RSS pack (small states and territories that now carry feeds).
  { code: "AD", name: "Andorra", continent: "EUR" },
  { code: "NA", name: "Namibia", continent: "AFR" },
  { code: "AG", name: "Antigua and Barbuda", continent: "NAM" },
  { code: "BB", name: "Barbados", continent: "NAM" },
  { code: "BI", name: "Burundi", continent: "AFR" },
  { code: "BM", name: "Bermuda", continent: "NAM" },
  { code: "BN", name: "Brunei", continent: "ASI" },
  { code: "BS", name: "Bahamas", continent: "NAM" },
  { code: "BT", name: "Bhutan", continent: "ASI" },
  { code: "BZ", name: "Belize", continent: "NAM" },
  { code: "CF", name: "Central African Republic", continent: "AFR" },
  { code: "CG", name: "Republic of the Congo", continent: "AFR" },
  { code: "CV", name: "Cape Verde", continent: "AFR" },
  { code: "DJ", name: "Djibouti", continent: "AFR" },
  { code: "DM", name: "Dominica", continent: "NAM" },
  { code: "ER", name: "Eritrea", continent: "AFR" },
  { code: "FJ", name: "Fiji", continent: "OCE" },
  { code: "FM", name: "Micronesia", continent: "OCE" },
  { code: "FO", name: "Faroe Islands", continent: "EUR" },
  { code: "GA", name: "Gabon", continent: "AFR" },
  { code: "GD", name: "Grenada", continent: "NAM" },
  { code: "GF", name: "French Guiana", continent: "SAM" },
  { code: "GI", name: "Gibraltar", continent: "EUR" },
  { code: "GM", name: "Gambia", continent: "AFR" },
  { code: "GN", name: "Guinea", continent: "AFR" },
  { code: "GQ", name: "Equatorial Guinea", continent: "AFR" },
  { code: "GW", name: "Guinea-Bissau", continent: "AFR" },
  { code: "GY", name: "Guyana", continent: "SAM" },
  { code: "HT", name: "Haiti", continent: "NAM" },
  { code: "IM", name: "Isle of Man", continent: "EUR" },
  { code: "KM", name: "Comoros", continent: "AFR" },
  { code: "KN", name: "Saint Kitts and Nevis", continent: "NAM" },
  { code: "KP", name: "North Korea", continent: "ASI" },
  { code: "KY", name: "Cayman Islands", continent: "NAM" },
  { code: "LA", name: "Laos", continent: "ASI" },
  { code: "LC", name: "Saint Lucia", continent: "NAM" },
  { code: "LR", name: "Liberia", continent: "AFR" },
  { code: "LS", name: "Lesotho", continent: "AFR" },
  { code: "MG", name: "Madagascar", continent: "AFR" },
  { code: "MH", name: "Marshall Islands", continent: "OCE" },
  { code: "ML", name: "Mali", continent: "AFR" },
  { code: "MQ", name: "Martinique", continent: "NAM" },
  { code: "MR", name: "Mauritania", continent: "AFR" },
  { code: "MU", name: "Mauritius", continent: "AFR" },
  { code: "MV", name: "Maldives", continent: "ASI" },
  { code: "MW", name: "Malawi", continent: "AFR" },
  { code: "NE", name: "Niger", continent: "AFR" },
  { code: "PF", name: "French Polynesia", continent: "OCE" },
  { code: "PG", name: "Papua New Guinea", continent: "OCE" },
  { code: "PR", name: "Puerto Rico", continent: "NAM" },
  { code: "RW", name: "Rwanda", continent: "AFR" },
  { code: "SB", name: "Solomon Islands", continent: "OCE" },
  { code: "SL", name: "Sierra Leone", continent: "AFR" },
  { code: "SM", name: "San Marino", continent: "EUR" },
  { code: "SO", name: "Somalia", continent: "AFR" },
  { code: "SR", name: "Suriname", continent: "SAM" },
  { code: "SS", name: "South Sudan", continent: "AFR" },
  { code: "ST", name: "São Tomé and Príncipe", continent: "AFR" },
  { code: "SZ", name: "Eswatini", continent: "AFR" },
  { code: "TD", name: "Chad", continent: "AFR" },
  { code: "TG", name: "Togo", continent: "AFR" },
  { code: "TL", name: "Timor-Leste", continent: "ASI" },
  { code: "TO", name: "Tonga", continent: "OCE" },
  { code: "TT", name: "Trinidad and Tobago", continent: "NAM" },
  { code: "VC", name: "Saint Vincent and the Grenadines", continent: "NAM" },
  { code: "VI", name: "U.S. Virgin Islands", continent: "NAM" },
  { code: "WS", name: "Samoa", continent: "OCE" },
];

/** Alphabetical by English name, whatever order the list above grows in. */
export const COUNTRIES: readonly Country[] = [...COUNTRY_LIST].sort((a, b) => a.name.localeCompare(b.name, "en"));

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
