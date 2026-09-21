import { MarketingPage, MarketingSection } from "@/components/marketing-page";

export default function SecurityPage() {
  return (
    <MarketingPage
      title="Security"
      intro="Multi-tenant isolation, content rights, and data protection are treated as core product requirements, not add-ons."
    >
      <MarketingSection
        title="Tenant isolation"
        desc="Every organization's data is isolated at the application layer, enforced on every request from your authenticated session — never from client-supplied identifiers."
      />
      <MarketingSection
        title="Content rights"
        desc="Source content is stored and displayed only within what each publisher's policy permits. When it doesn't, you get a link to the original — never a copy we weren't allowed to keep."
      />
      <MarketingSection
        title="Data control"
        desc="Export or delete your account and organization data on request, with an audit trail of who did what and when."
      />
      <MarketingSection
        title="Secure by default"
        desc="Encrypted transport, hashed credentials, rate-limited authentication, and role-based access control on every action."
      />
    </MarketingPage>
  );
}
