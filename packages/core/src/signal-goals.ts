import { FOCUS_OPTIONS, type GoalKey, type MonitoringIntent } from "./intent";

/**
 * What a person can be looking for, and the words that make a story about it stand out. A story that
 * names what is tracked AND uses one of these words ("Acme sued over data breach", "KOSGEB hibe çağrısı")
 * ranks above one that only names it. The lists are plain and public — the monitoring form shows them —
 * and mix Turkish and English because those are the two languages the product's customers read.
 * Words take the usual word endings (hibe → hibeler, hibeyi; sue → sued) except short ALL-CAPS
 * abbreviations (CEO, KVKK), which keep their capitals.
 */
export type SignalGoal = {
  key: GoalKey;
  label: string;
  description: string;
  /** Words that point at this goal; empty for plain coverage. */
  words: readonly string[];
};

export const SIGNAL_GOALS: readonly SignalGoal[] = [
  {
    key: "coverage",
    label: "Coverage",
    description: "Stories that name what I track — those with it in the headline first.",
    words: [],
  },
  {
    key: "risk",
    label: "Risks & crises",
    description: "Lawsuits, investigations, outages, breaches, boycotts and other trouble.",
    words: [
      "kriz",
      "dava",
      "soruşturma",
      "ceza",
      "iflas",
      "boykot",
      "skandal",
      "yolsuzluk",
      "usulsüzlük",
      "dolandırıcılık",
      "siber saldırı",
      "veri ihlali",
      "veri sızıntısı",
      "geri çağırma",
      "grev",
      "işten çıkarma",
      "istifa",
      "gözaltı",
      "yaptırım",
      "tepki",
      "protesto",
      "şikayet",
      "zehirlenme",
      "crisis",
      "lawsuit",
      "sued",
      "investigation",
      "bankruptcy",
      "boycott",
      "scandal",
      "fraud",
      "corruption",
      "cyberattack",
      "data breach",
      "leak",
      "outage",
      "recall",
      "layoff",
      "resign",
      "arrest",
      "sanction",
      "backlash",
      "complaint",
    ],
  },
  {
    key: "opportunity",
    label: "Opportunities & funding",
    description: "Grants, calls, tenders, investment rounds, partnerships and awards.",
    words: [
      "hibe",
      "fon",
      "yatırım turu",
      "yatırım aldı",
      "finansman",
      "çağrı",
      "başvuru",
      "ihale",
      "ortaklık",
      "iş birliği",
      "protokol",
      "ödül",
      "kuluçka",
      "hızlandırıcı",
      "mentörlük",
      "burs",
      "girişim sermayesi",
      "grant",
      "funding",
      "funding round",
      "seed round",
      "series a",
      "call for applications",
      "tender",
      "partnership",
      "award",
      "accelerator",
      "incubator",
      "scholarship",
      "deadline",
    ],
  },
  {
    key: "competitor",
    label: "Competitor & market moves",
    description: "Launches, acquisitions, pricing, partnerships and hires.",
    words: [
      "lansman",
      "yeni ürün",
      "piyasaya sürdü",
      "satın aldı",
      "satın alma",
      "birleşme",
      "devralma",
      "zam",
      "indirim",
      "kampanya",
      "genişleme",
      "işe aldı",
      "atandı",
      "pazara girdi",
      "halka arz",
      "CEO",
      "launch",
      "unveil",
      "acquire",
      "acquisition",
      "merger",
      "price increase",
      "price cut",
      "expand",
      "hire",
      "appoint",
      "shut down",
      "IPO",
    ],
  },
  {
    key: "policy",
    label: "Policy & regulation",
    description: "Laws, regulations, incentives, rulings and official decisions.",
    words: [
      "kanun",
      "yasa",
      "yönetmelik",
      "düzenleme",
      "mevzuat",
      "tebliğ",
      "genelge",
      "resmi gazete",
      "vergi",
      "teşvik",
      "yasak",
      "denetim",
      "lisans",
      "KVKK",
      "BDDK",
      "SPK",
      "law",
      "laws",
      "legislation",
      "regulation",
      "regulator",
      "directive",
      "ruling",
      "tax",
      "incentive",
      "ban",
      "banned",
      "compliance",
      "license",
      "GDPR",
    ],
  },
  {
    key: "trend",
    label: "Research & trends",
    description: "Reports, studies, surveys, statistics and forecasts.",
    words: [
      "araştırma",
      "anket",
      "istatistik",
      "tahmin",
      "trend",
      "eğilim",
      "pazar büyüklüğü",
      "endeks",
      "projeksiyon",
      "study",
      "survey",
      "statistics",
      "forecast",
      "market size",
      "outlook",
      "research",
    ],
  },
];

const BY_KEY = new Map(SIGNAL_GOALS.map((goal) => [goal.key, goal]));

export function goalLabel(key: GoalKey | "custom"): string {
  return key === "custom" ? "Your signal words" : (BY_KEY.get(key)?.label ?? key);
}

export function goalWords(key: GoalKey): readonly string[] {
  return BY_KEY.get(key)?.words ?? [];
}

export type IntentSummary = {
  /** What the person is looking for, in a phrase. */
  looking: string;
  /** How much they see without asking. */
  showing: string;
};

/**
 * Two short phrases that say what a monitoring was set up to do — for the monitoring list and the form's
 * summary. Null for a monitoring saved before intents existed (it shows everything, as it always did).
 */
export function intentSummary(intent: MonitoringIntent | null | undefined): IntentSummary | null {
  if (!intent) return null;
  const chosen = intent.goals.filter((goal) => goal !== "coverage").map((goal) => goalLabel(goal));
  const own = intent.signalWords.length;
  const looking =
    chosen.length === 0 && own === 0
      ? "Every story that names what you track"
      : [chosen.join(", "), own > 0 ? `${own} word${own === 1 ? "" : "s"} of your own` : ""].filter(Boolean).join(" + ");
  return { looking, showing: FOCUS_OPTIONS.find((option) => option.key === intent.focus)?.label ?? intent.focus };
}
