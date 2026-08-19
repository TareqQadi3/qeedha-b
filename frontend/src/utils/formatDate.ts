import i18n from '../i18n';

// Locale-aware date formatting for the two supported UI languages. Every
// caller already re-renders on language change (they all use useTranslation
// for their own strings), so reading i18n.language fresh on each call is
// enough - no hook/subscription needed here.
//
// The Arabic branch keeps the exact locale ('ar-SA') the app always used,
// so switching this file changes nothing for Arabic users (still the
// default language). English mode gets a Gregorian, Western-digit format
// via 'en-GB' instead of staying stuck in Arabic formatting.
function localeFor(): string {
  return i18n.language === 'en' ? 'en-GB' : 'ar-SA';
}

export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(localeFor(), options);
}

export function formatDateTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString(localeFor(), options);
}
