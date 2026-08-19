import { useTranslation } from 'react-i18next';
import { setLanguage, SupportedLanguage } from '../i18n';

/**
 * Two-way toggle (ar/en), not a dropdown - only two languages are
 * supported, so a select adds a click for no benefit. Placed in
 * Layout's sidebar (inside the app) and standalone on the pre-auth
 * Login/Register pages, which render outside Layout.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation('nav');
  const current = i18n.language as SupportedLanguage;

  const options: { code: SupportedLanguage; label: string }[] = [
    { code: 'ar', label: t('languageArabic') },
    { code: 'en', label: t('languageEnglish') },
  ];

  return (
    <div className={`inline-flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5 text-xs ${className}`}>
      {options.map((option) => (
        <button
          key={option.code}
          type="button"
          onClick={() => setLanguage(option.code)}
          aria-pressed={current === option.code}
          className={`rounded-md px-2 py-1 font-medium transition-colors ${
            current === option.code ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
