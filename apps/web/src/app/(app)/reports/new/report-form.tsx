"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@cim/ui";
import { REPORT_TEMPLATES, type ReportPeriodType, type ReportTemplateKey } from "@cim/reports/templates";

type ProjectOption = { id: string; name: string };

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "rolling_7d", label: "Last 7 days" },
  { value: "rolling_30d", label: "Last 30 days" },
];

export function ReportForm({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [templateKey, setTemplateKey] = useState<ReportTemplateKey>(REPORT_TEMPLATES[0]!.key);
  const [periodType, setPeriodType] = useState(REPORT_TEMPLATES[0]!.defaultPeriodType);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function selectTemplate(key: ReportTemplateKey) {
    setTemplateKey(key);
    const template = REPORT_TEMPLATES.find((t) => t.key === key);
    if (template) setPeriodType(template.defaultPeriodType);
  }

  async function handleSave() {
    setError(null);
    if (!projectId) {
      setError("Select a project first.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name || REPORT_TEMPLATES.find((t) => t.key === templateKey)?.name || "Report",
          templateKey,
          periodType,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(`/reports/${data.reportId}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Create a project first — reports are generated for a project&apos;s monitored mentions.
      </p>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <Field id="name" label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 brand summary" />
      </Field>

      <Field id="project" label="Project" required>
        <Select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Template</span>
        <div className="flex flex-col gap-2">
          {REPORT_TEMPLATES.map((template) => (
            <label
              key={template.key}
              className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 ${
                templateKey === template.key ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="template"
                className="mt-1"
                checked={templateKey === template.key}
                onChange={() => selectTemplate(template.key)}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{template.name}</span>
                <span className="block text-sm text-muted-foreground">{template.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <Field id="period" label="Period">
        <Select
          id="period"
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as ReportPeriodType)}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Generating…" : "Generate report"}
        </Button>
      </div>
    </div>
  );
}
