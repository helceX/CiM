import { MarketingPage } from "@/components/marketing-page";

export default function ContactPage() {
  return (
    <MarketingPage
      title="Contact"
      intro="Have a question about CiM for your team? Reach out and we'll get back to you."
    >
      <p className="text-sm text-muted-foreground">
        Email{" "}
        <a href="mailto:hello@cim.example" className="text-primary underline underline-offset-2">
          hello@cim.example
        </a>{" "}
        — a contact form with routing and CRM integration ships in a later phase (see the
        product roadmap).
      </p>
    </MarketingPage>
  );
}
