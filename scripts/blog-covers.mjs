import { Buffer } from "node:buffer";
import { URL } from "node:url";
import console from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import expansion from "../apps/web/src/content/blog-expansion.json" with { type: "json" };
const covers = [
  ["medya-takibi-nedir", "MEDYA TAKİBİ", "Gündemden karara", "radar"],
  [
    "marka-takibi-anahtar-kelime",
    "MARKA TAKİBİ",
    "Doğru kelime. Doğru sinyal.",
    "search",
  ],
  ["rss-ile-haber-takibi", "RSS & HABER", "Kaynakları birleştirin", "rss"],
  ["rakip-analizi-medya", "RAKİP ANALİZİ", "Pazardaki hareketi okuyun", "bars"],
  ["kriz-iletisimi-erken-uyari", "ERKEN UYARI", "Risk görünür olduğunda", "pulse"],
  ["share-of-voice-nedir", "SHARE OF VOICE", "Görünürlüğün payını anlayın", "donut"],
  ["medya-takip-raporu", "MEDYA RAPORU", "Bilgiyi kararlarla bağlayın", "report"],
  ["pr-kpi-olcumu", "PR & KPI", "Çıktıdan etkiye", "bars"],
  ["duygu-analizi-sinirlari", "DUYGU ANALİZİ", "Etiketin ötesindeki bağlam", "pulse"],
  [
    "haber-tekrarlarini-ayiklama",
    "TEKİLLEŞTİRME",
    "Tek olay. Birçok kaynak.",
    "layers",
  ],
  ["firsat-radari-nedir", "FIRSAT RADARI", "Sizin için önemli olan", "radar"],
  [
    "hibe-destek-cagrisi-takibi",
    "HİBE & DESTEK",
    "Duyurudan değerlendirmeye",
    "report",
  ],
  [
    "startup-yatirim-haberleri",
    "STARTUP GÜNDEMİ",
    "Ekosistemdeki sinyaller",
    "network",
  ],
  [
    "hizlandirici-program-secimi",
    "HIZLANDIRICILAR",
    "Bir sonraki aşamayı seçin",
    "orbit",
  ],
  ["sektor-gundemi-takibi", "SEKTÖR GÜNDEMİ", "Müşteriniz için ne değişti?", "network"],
  ["sosyal-medya-dinleme", "SOSYAL DİNLEME", "Konuşmayı bağlamıyla okuyun", "orbit"],
  ["seo-geo-icerik-stratejisi", "SEO / GEO", "Açık cevap. Güçlü bağlam.", "search"],
];
const tones = [
  ["#a78bfa", "#ff6bb5"],
  ["#2fd6ff", "#a78bfa"],
  ["#ffab6b", "#ff6bb5"],
];
const panel =
  '<rect x="688" y="139" width="390" height="360" rx="32" fill="#ffffff06" stroke="#ffffff20"/>';
function motif(kind, n) {
  const center = '<circle cx="883" cy="318" r="8" fill="url(#accent)"/>';
  switch (kind) {
    case "radar":
      return (
        [62, 112, 155]
          .map(
            (r) =>
              `<circle cx="883" cy="318" r="${r}" fill="none" stroke="#ffffff22"/>`,
          )
          .join("") +
        '<path d="M883 318L1008 220A158 158 0 0 1 1036 359Z" fill="url(#accent)" opacity=".28"/><path d="M726 318H1040M883 163V473" stroke="#ffffff14"/>' +
        center +
        `<circle cx="${940 + n}" cy="253" r="11" fill="url(#accent)"/><circle cx="802" cy="360" r="6" fill="#2fd6ff"/>`
      );
    case "search":
      return '<circle cx="864" cy="293" r="99" fill="#a78bfa0d" stroke="url(#accent)" stroke-width="9"/><path d="M936 365L1027 456" stroke="url(#accent)" stroke-width="22" stroke-linecap="round"/><path d="M810 277H912M810 308H890M810 339H860" stroke="#ffffff88" stroke-width="8" stroke-linecap="round"/>';
    case "rss":
      return '<circle cx="776" cy="423" r="17" fill="url(#accent)"/><path d="M766 323A110 110 0 0 1 876 433M766 247A186 186 0 0 1 952 433M766 171A262 262 0 0 1 1028 433" stroke="url(#accent)" stroke-width="15" fill="none" stroke-linecap="round"/>';
    case "bars":
      return (
        [90, 145, 115, 228]
          .map(
            (h, i) =>
              `<rect x="${752 + i * 72}" y="${443 - h - n}" width="42" height="${h + n}" rx="10" fill="url(#accent)" opacity="${0.45 + i * 0.17}"/>`,
          )
          .join("") + '<path d="M730 460H1040" stroke="#ffffff44"/>'
      );
    case "pulse":
      return '<path d="M720 324H782L823 248L863 391L913 210L954 324H1045" stroke="url(#accent)" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" fill="none"/><path d="M720 397H1045M720 246H1045" stroke="#ffffff12"/>';
    case "donut":
      return '<circle cx="884" cy="315" r="121" stroke="#ffffff15" stroke-width="43" fill="none"/><circle cx="884" cy="315" r="121" stroke="url(#accent)" stroke-width="43" stroke-dasharray="304 760" transform="rotate(-90 884 315)" fill="none"/><text x="884" y="330" text-anchor="middle" font-size="47" fill="#f5f5fc" font-family="Arial" font-weight="700">SOV</text>';
    case "report":
      return '<rect x="780" y="177" width="212" height="278" rx="18" fill="#ffffff08" stroke="url(#accent)" stroke-width="3"/><path d="M814 224H946M814 251H913" stroke="#ffffff88" stroke-width="7" stroke-linecap="round"/><rect x="814" y="297" width="35" height="111" rx="6" fill="url(#accent)"/><rect x="863" y="334" width="35" height="74" rx="6" fill="url(#accent)" opacity=".65"/><rect x="912" y="277" width="35" height="131" rx="6" fill="url(#accent)" opacity=".85"/>';
    case "layers":
      return '<rect x="745" y="171" width="244" height="198" rx="18" fill="#211831" stroke="#a78bfa66"/><rect x="779" y="217" width="244" height="198" rx="18" fill="#211831" stroke="#ff6bb566"/><rect x="813" y="263" width="244" height="198" rx="18" fill="#211831" stroke="url(#accent)" stroke-width="3"/><path d="M851 310H1015M851 340H983M851 370H996" stroke="#ffffff88" stroke-width="8" stroke-linecap="round"/>';
    case "network":
      return (
        '<path d="M771 233L883 319L993 214M883 319L1008 423M883 319L766 430" stroke="url(#accent)" stroke-width="4" fill="none"/>' +
        [
          [771, 233],
          [993, 214],
          [1008, 423],
          [766, 430],
        ]
          .map(
            ([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="26" fill="#17132d" stroke="url(#accent)" stroke-width="4"/>`,
          )
          .join("") +
        '<circle cx="883" cy="319" r="53" fill="url(#accent)" opacity=".8"/>'
      );
    default:
      return '<ellipse cx="883" cy="315" rx="151" ry="72" transform="rotate(-30 883 315)" stroke="url(#accent)" stroke-width="4" fill="none"/><ellipse cx="883" cy="315" rx="151" ry="72" transform="rotate(30 883 315)" stroke="#ffffff33" stroke-width="3" fill="none"/><circle cx="883" cy="315" r="49" fill="url(#accent)"/><circle cx="1000" cy="240" r="14" fill="#2fd6ff"/>';
  }
}
const directory = new URL("../apps/web/public/blog/covers/", import.meta.url);
covers.push(...expansion.covers);
await mkdir(directory, { recursive: true });
for (const [i, [slug, title, subtitle, kind]] of covers.entries()) {
  const [a, b] = tones[i % tones.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="glow"><stop stop-color="${a}" stop-opacity=".22"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="#080916"/><ellipse cx="935" cy="275" rx="420" ry="340" fill="url(#glow)"/><path d="M0 564H1200M64 0V630" stroke="#ffffff0e"/><circle cx="94" cy="83" r="13" fill="url(#accent)"/><text x="119" y="92" fill="#f5f5fc" font-size="28" font-family="Arial,sans-serif" font-weight="700">mediaory</text><text x="78" y="225" fill="${a}" font-size="14" letter-spacing="4" font-family="Arial,sans-serif">SAHADAN KARARA / REHBER ${String(i + 1).padStart(2, "0")}</text><text x="76" y="308" fill="#f5f5fc" font-size="${title.length > 18 ? 40 : 48}" font-family="Arial,sans-serif" font-weight="700" letter-spacing="-1">${title.replace(/&/g, "&amp;")}</text><text x="78" y="355" fill="#b3b5d3" font-size="23" font-family="Arial,sans-serif">${subtitle.replace(/&/g, "&amp;")}</text><path d="M78 401H249" stroke="url(#accent)" stroke-width="4"/><text x="78" y="589" fill="#b3b5d3" font-size="14" font-family="Arial,sans-serif" letter-spacing="2">MEDIAORY.IO / BLOG</text>${panel}${motif(kind, i)}</svg>`;
  await writeFile(new URL(`${slug}.svg`, directory), svg);
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(new URL(`${slug}.png`, directory).pathname.replace(/^\/(\w:)/, "$1"));
}
console.log(`${covers.length} original SVG + PNG covers saved`);
