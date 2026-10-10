/** Keep the established payload: selected terms plus optional custom text. */
export function readProfileTerms(data: FormData, field: string): string[] {
  return [
    ...new Set([
      ...data
        .getAll(field)
        .map(String)
        .filter((value) => value && value !== "__other__"),
      ...String(data.get(`${field}Other`) ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ]),
  ];
}

export function readProfileSingle(data: FormData, field: string): string {
  const value = String(data.get(field) ?? "");
  return value === "__other__" ? String(data.get(`${field}Other`) ?? "").trim() : value;
}
