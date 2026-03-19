import { createContext, useContext, useState, useEffect } from 'react';
import { getTranslation } from '../i18n/translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'ru';
    const saved = localStorage.getItem('appLanguage');
    return saved === 'kk' ? 'kk' : 'ru';
  });

  useEffect(() => {
    localStorage.setItem('appLanguage', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key) => getTranslation(lang, key);

  const toggleLanguage = () => {
    setLang((prev) => (prev === 'ru' ? 'kk' : 'ru'));
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
};
