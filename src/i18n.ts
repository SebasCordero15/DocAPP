import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async () => {
  const raw = cookies().get("locale")?.value;
  const locale: Locale = LOCALES.includes(raw as Locale) ? (raw as Locale) : "es";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
