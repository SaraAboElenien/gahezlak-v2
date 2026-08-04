export const isEnglish = (str: string) => /^[a-zA-Z0-9\s.,!?'"-]+$/.test(str);
export const isArabic = (str: string) =>
  /^[\u0600-\u06FF\s0-9.,!?'"-]+$/.test(str);
