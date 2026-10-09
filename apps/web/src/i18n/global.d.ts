import type { Messages } from "../../messages/types";
import type { LOCALES } from "./config";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof LOCALES)[number];
    Messages: Messages;
  }
}
