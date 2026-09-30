import type en from "../../messages/en.json";
import type { LOCALES } from "./config";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof LOCALES)[number];
    Messages: typeof en;
  }
}
