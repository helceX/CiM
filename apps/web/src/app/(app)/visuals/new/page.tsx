import { requireOrgContext } from "@/lib/tenant";
import { VisualBuilder } from "./visual-builder";

export default async function NewVisualPage() {
  const context = await requireOrgContext();
  const canWrite = context.permissions.includes("monitoring:write");
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">New visual</h1>
        <p className="text-sm text-muted-foreground">
          Pick what to measure and how to group it. The preview updates as you change options.
        </p>
      </div>
      {canWrite ? (
        <VisualBuilder />
      ) : (
        <p className="text-sm text-muted-foreground">You don&apos;t have permission to create visuals.</p>
      )}
    </div>
  );
}
