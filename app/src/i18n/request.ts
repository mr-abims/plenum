import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

/** Locale from the member's profile (stored in a cookie by the app). English ships; a second language is stretch. */
export const LOCALES = ["en"] as const;

export default getRequestConfig(async () => {
  const requested = (await cookies()).get("plenum.locale")?.value;
  const locale = LOCALES.includes(requested as never) ? (requested as string) : "en";
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
