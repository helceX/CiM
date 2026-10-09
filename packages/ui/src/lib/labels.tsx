"use client";

import * as React from "react";

/**
 * The few words the shared components say on their own (the "Close" on a dialog). The app supplies them in the
 * person's language once, near the top of the tree; without a provider they stay English.
 */
export type UiLabels = { close: string };

const DEFAULT_LABELS: UiLabels = { close: "Close" };
const UiLabelsContext = React.createContext<UiLabels>(DEFAULT_LABELS);

export function UiLabelsProvider({
  labels,
  children,
}: {
  labels: Partial<UiLabels>;
  children: React.ReactNode;
}) {
  const { close } = labels;
  const value = React.useMemo<UiLabels>(
    () => ({ close: close ?? DEFAULT_LABELS.close }),
    [close],
  );
  return <UiLabelsContext.Provider value={value}>{children}</UiLabelsContext.Provider>;
}

export function useUiLabels(): UiLabels {
  return React.useContext(UiLabelsContext);
}
