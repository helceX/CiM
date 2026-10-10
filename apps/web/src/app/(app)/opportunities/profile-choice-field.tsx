"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { OPPORTUNITY_PROFILE_OPTIONS } from "@cim/core";

type Field = keyof typeof OPPORTUNITY_PROFILE_OPTIONS;
export function ProfileChoiceField({
  name,
  label,
  values,
  disabled,
  single = false,
  hint,
}: {
  name: Field;
  label: string;
  values: string[];
  disabled: boolean;
  single?: boolean;
  hint?: string;
}) {
  const t = useTranslations("opportunities");
  const id = useId();
  const options = OPPORTUNITY_PROFILE_OPTIONS[name];
  const isKnown = (value: string) =>
    options.some((option) =>
      option.aliases.some(
        (alias) =>
          alias.toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR"),
      ),
    );
  const custom = values.filter((value) => !isKnown(value));
  const initial = options
    .filter((option) =>
      values.some((value) =>
        option.aliases.some(
          (alias) =>
            alias.toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR"),
        ),
      ),
    )
    .map((option) => option.value);
  const [other, setOther] = useState(custom.length > 0);
  const [otherValue, setOtherValue] = useState(custom.join(", "));
  const [selection, setSelection] = useState<string>(
    custom.length ? "__other__" : (initial[0] ?? ""),
  );
  const helpId = `${id}-help`;
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 rounded-lg border border-border p-3 text-sm"
      aria-describedby={helpId}
    >
      <legend className="px-1 font-medium">{label}</legend>
      <p id={helpId} className="mb-3 text-xs text-muted-foreground">
        {hint ?? (single ? t("chooseOption") : t("multipleChoices"))}
      </p>
      {single ? (
        <select
          aria-label={label}
          name={name}
          value={selection}
          onChange={(event) => {
            setSelection(event.target.value);
            setOther(event.target.value === "__other__");
          }}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="">{t("chooseOption")}</option>
          {options.map((option) => (
            <option key={option.id} value={option.value}>
              {t(`choices.${option.id}`)}
            </option>
          ))}
          <option value="__other__">{t("otherOption")}</option>
        </select>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input
                type="checkbox"
                name={name}
                value={option.value}
                defaultChecked={initial.includes(option.value)}
                className="accent-primary"
              />
              {t(`choices.${option.id}`)}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <input
              type="checkbox"
              checked={other}
              onChange={(event) => setOther(event.target.checked)}
              className="accent-primary"
            />
            {t("otherOption")}
          </label>
        </div>
      )}
      {other ? (
        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor={`${id}-other`}>{t("otherTerms")}</label>
          <input
            id={`${id}-other`}
            name={`${name}Other`}
            value={otherValue}
            onChange={(event) => setOtherValue(event.target.value)}
            aria-describedby={!single ? `${id}-other-help` : undefined}
            maxLength={single ? (name === "sector" ? 120 : 80) : undefined}
            className="rounded-md border border-border bg-background px-3 py-2"
          />
          {!single ? (
            <span id={`${id}-other-help`} className="text-xs text-muted-foreground">
              {t("commaSeparated")}
            </span>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
