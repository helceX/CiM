import type { SocialEnv, SocialProvider } from "./provider";
import { mockSocialProvider } from "./mock";
import { xProvider } from "./x";
import { youtubeProvider } from "./youtube";

export const SOCIAL_PROVIDERS: SocialProvider[] = [youtubeProvider, xProvider, mockSocialProvider];

export function getSocialProvider(key: string): SocialProvider | undefined {
  return SOCIAL_PROVIDERS.find((provider) => provider.key === key);
}

/**
 * Platforms people ask for that need an app review or a paid/partner programme
 * before a customer can link an account. Listed so the screen is honest about
 * what is coming and why, instead of hiding or faking them.
 */
export const PLANNED_SOCIAL_PLATFORMS: { key: string; label: string; note: string }[] = [
  { key: "instagram", label: "Instagram", note: "Needs a Meta app with Instagram Graph API review (professional accounts only)." },
  { key: "facebook", label: "Facebook", note: "Needs a Meta app with Pages API review (Pages you manage)." },
  { key: "linkedin", label: "LinkedIn", note: "Needs LinkedIn's Community Management API approval (company pages you administer)." },
  { key: "tiktok", label: "TikTok", note: "Needs TikTok for Developers app approval (your own account's videos and comments)." },
];

/** Providers the operator has configured — the only ones a customer is offered a Connect button for. */
export function configuredSocialProviders(env: SocialEnv): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((provider) => provider.isConfigured(env));
}
