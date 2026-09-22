import { db, listMonitoringQueries } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { AlertRuleForm } from "./alert-rule-form";

export default async function NewAlertPage() {
  const context = await requireOrgContext();
  const queries = await listMonitoringQueries(db, context.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">New alert</h1>
        <p className="text-sm text-muted-foreground">
          Choose what should notify you, and how.
        </p>
      </div>
      <AlertRuleForm
        queries={queries.map((q) => ({
          id: q.id,
          name: q.name,
          projectId: q.projectId,
          trackingTarget: q.trackingTarget,
        }))}
      />
    </div>
  );
}
