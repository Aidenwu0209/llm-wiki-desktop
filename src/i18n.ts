export type UiLanguage = "zh" | "en";

export const INTERFACE_LANGUAGE_STORAGE_KEY = "llm-wiki-desktop.interfaceLanguage";

export function normalizeUiLanguage(value?: string | null): UiLanguage {
  return value === "en" ? "en" : "zh";
}

export function oppositeLanguage(language: UiLanguage): UiLanguage {
  return language === "zh" ? "en" : "zh";
}

export function languageName(language: UiLanguage) {
  return language === "zh" ? "中文" : "English";
}
