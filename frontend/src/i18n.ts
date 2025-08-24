type NestedTranslations = {
  [key: string]: string | NestedTranslations;
};

let currentLang: string = localStorage.getItem("language") || "en";
let translations: NestedTranslations = {};

export async function loadLanguage(lang: string) {
  switch (lang) {
    case "fr":
      translations = (await import("../locales/fr.json")).default;
      break;
    case "it":
      translations = (await import("../locales/it.json")).default;
      break;
    case "nl":
      translations = (await import("../locales/nl.json")).default;
      break;
    case "pirate":
      translations = (await import("../locales/pirate.json")).default;
      break;
    default:
      translations = (await import("../locales/en.json")).default;
      break;
  }
  currentLang = lang;
  localStorage.setItem("language", lang);
  document.documentElement.lang = lang;
  applyTranslations();
}

export function getCurrentLanguage(): string {
  return currentLang;
}

export function setLanguage(lang: string) {
  loadLanguage(lang);
}

function applyTranslations() {
  const elements = document.querySelectorAll<HTMLElement>("[data-i18n]");
  elements.forEach((el) => {
    const key = el.dataset.i18n;
    if (key) {
      const value = getNestedValue(translations, key);
      if (value) {
        el.textContent = value;
      }
    }
  });
}

function getNestedValue(
  obj: NestedTranslations,
  key: string,
): string | undefined {
  const result = key.split(".").reduce<unknown>((o, k) => {
    if (typeof o === "object" && o !== null && k in o) {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);

  return typeof result === "string" ? result : undefined;
}

type Vars = Record<string, string | number>;

export function t(key: string, vars: Vars = {}): string {
  const template = getNestedValue(translations, key) ?? key;
  return Object.entries(vars).reduce(
    (str, [name, value]) =>
      str.replace(new RegExp(`{{\\s*${name}\\s*}}`, "g"), String(value)),
    template,
  );
}

loadLanguage(currentLang);
