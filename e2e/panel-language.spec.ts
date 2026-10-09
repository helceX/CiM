import { test, expect, type Page } from "@playwright/test";
import { latestEmailLinkFor, userLocale } from "./db";
import { registerAndOnboard } from "./helpers";

/**
 * The panel speaks English and Türkçe (docs/product/PANEL_I18N.md). The account is made in English (every
 * other spec relies on that), then the language is changed the way a person would: from the account menu.
 */

const leakedKey = /\b(shell|palette|notifications|ui)\.[a-zA-Z]+/;

async function openAccountMenu(page: Page, label: string) {
  await page.getByRole("button", { name: label }).click();
}

test("the panel can be switched to Turkish from the account menu, the choice sticks and is stored on the account", async ({ page }) => {
  const { email } = await registerAndOnboard(page);

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Monitoring" })).toBeVisible();

  await openAccountMenu(page, "Account menu");
  await page.getByRole("menuitem", { name: "Türkçe" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  const nav = page.getByRole("navigation", { name: "Ana gezinme" });
  await expect(nav.getByRole("link", { name: "Pano" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "İzlemeler" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Bahsetmeler" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hesap menüsü" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Bildirimler/ })).toBeVisible();

  // It stays across navigation and a reload, and is on the account for the e-mails we send.
  await page.goto("/alerts");
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Ana gezinme" }).getByRole("link", { name: "Uyarılar" })).toBeVisible();
  expect(userLocale(email)).toBe("tr");

  // The command palette speaks Turkish and finds a page by its Turkish name (Turkish İ/i included).
  await page.keyboard.press("Control+K");
  await page.getByLabel("Sayfa ve eylem ara").fill("izle");
  await page.getByRole("button", { name: "İzlemeler sayfasına git" }).click();
  await expect(page).toHaveURL(/\/monitoring/);

  // No message key leaked onto the screen where a translation should be.
  expect(await page.locator("body").innerText()).not.toMatch(leakedKey);

  // And back.
  await openAccountMenu(page, "Hesap menüsü");
  await page.getByRole("menuitem", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Dashboard" })).toBeVisible();
  expect(userLocale(email)).toBe("en");
});

test("a Turkish browser gets the Turkish panel without choosing anything", async ({ page, browser }) => {
  await registerAndOnboard(page);
  // The same signed-in session, in a browser whose language is Turkish.
  const turkish = await browser.newContext({
    baseURL: "http://localhost:3000",
    locale: "tr-TR",
    storageState: await page.context().storageState(),
  });
  const tr = await turkish.newPage();
  await tr.goto("/dashboard");
  await expect(tr.locator("html")).toHaveAttribute("lang", "tr");
  await expect(tr.getByRole("navigation", { name: "Ana gezinme" }).getByRole("link", { name: "Raporlar" })).toBeVisible();
  expect(await tr.locator("body").innerText()).not.toMatch(leakedKey);
  await turkish.close();
});

test("someone with a Turkish browser can sign up, verify and set up their first monitoring entirely in Turkish", async ({ browser }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const octet = () => Math.floor(Math.random() * 254) + 1;
  const context = await browser.newContext({
    baseURL: "http://localhost:3000",
    locale: "tr-TR",
    // A fresh client address keeps the sign-up rate limit out of the way.
    extraHTTPHeaders: { "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` },
  });
  const page = await context.newPage();
  const email = `e2e-tr-${unique}@example.com`;
  const company = `Örnek Şirket ${unique}`;

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Hesabınızı oluşturun" })).toBeVisible();
  // A required field's label reads "Ad *", so the fields are found by their accessible name.
  const field = (name: string) => page.getByRole("textbox", { name, exact: true });
  await field("Ad").fill("Ayşe");
  await field("Soyad").fill("Yılmaz");
  await field("İş e-postası").fill(email);
  await field("Şirket adı").fill(company);
  await field("Pozisyon").fill("İletişim Müdürü");
  // A weak password is explained in Turkish, not in the English the schema is written in.
  await field("Parola").fill("Kisa1");
  await page.getByRole("button", { name: "Hesap oluştur" }).click();
  await expect(page.getByText("Parola en az 10 karakter olmalı")).toBeVisible();
  await field("Parola").fill("Sup3rSecret!");
  await page.getByRole("button", { name: "Hesap oluştur" }).click();
  await expect(page.getByText("E-postanızı kontrol edin")).toBeVisible();
  expect(userLocale(email)).toBe("tr");

  await page.goto(latestEmailLinkFor(email, "verify_email"));
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
  await expect(page.getByText("Adım 1 / 5")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Neyi izlemek istiyorsunuz?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Şirket" })).toBeVisible();
  await page.getByRole("button", { name: "Devam" }).click();

  await page.getByLabel("Anahtar kelime").fill(company);
  await page.getByRole("button", { name: "Ekle" }).click();
  await expect(page.getByRole("button", { name: `${company} öğesini kaldır` })).toBeVisible();
  await page.getByRole("button", { name: "Devam" }).click();
  await expect(page.getByRole("heading", { name: "Kaynakları seçin" })).toBeVisible();
  await page.getByRole("button", { name: "Devam" }).click();
  await expect(page.getByRole("heading", { name: "Size nasıl haber verelim?" })).toBeVisible();
  await page.getByRole("button", { name: "Devam" }).click();
  await expect(page.getByText(/kaynak türü genelinde 1 anahtar kelime izleniyor/)).toBeVisible();
  await page.getByRole("button", { name: "Panoya git" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByRole("navigation", { name: "Ana gezinme" }).getByRole("link", { name: "Bahsetmeler" })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(leakedKey);
  await context.close();
});

test("the sign-in page speaks Turkish to a Turkish browser and shows a Turkish error", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://localhost:3000", locale: "tr-TR" });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Giriş yap" })).toBeVisible();
  await page.getByRole("textbox", { name: "E-posta", exact: true }).fill("kimse@example.com");
  await page.getByRole("textbox", { name: "Parola", exact: true }).fill("YanlisParola1");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  // (Next.js keeps its own empty role="alert" route announcer on every page.)
  await expect(page.getByRole("alert").filter({ hasText: "E-posta veya parola hatalı." })).toBeVisible();
  await context.close();
});
