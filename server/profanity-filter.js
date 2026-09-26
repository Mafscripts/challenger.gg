const blockedTermsByLanguage = {
  en: [
    "fuck", "fucker", "motherfuck", "motherfucker", "shit", "bullshit", "bitch", "bastard", "cunt", "dickhead",
    "asshole", "wanker", "slut", "whore", "retard", "nigger", "nigga", "faggot", "dyke", "chink",
    "spic", "kike", "tranny", "coon", "wetback",
  ],
  nl: [
    "kanker", "kankerlijer", "tering", "teringlijer", "tyfus", "tyfuslijer", "kut", "kutwijf", "klootzak",
    "lul", "hoer", "slet", "mongool", "debiel", "flikker", "homo", "neger", "nikker", "rotzak",
    "godverdomme", "verdomme", "eikel",
  ],
  fr: [
    "putain", "merde", "connard", "connasse", "salope", "pute", "encule", "enculer", "batard",
    "nique", "niquer", "couille", "bite", "branleur", "pedale", "bougnoule", "negre", "tapette",
    "facho",
  ],
  de: [
    "scheisse", "arschloch", "wichser", "hurensohn", "hure", "fotze", "schlampe", "missgeburt",
    "spast", "schwuchtel", "kanake", "neger", "drecksau", "vollidiot", "miststuck", "verpiss",
    "fick", "ficker",
  ],
  es: [
    "puta", "puto", "mierda", "cabron", "cabrona", "cojones", "pendejo", "pendeja", "gilipollas",
    "maricon", "marica", "joder", "chingar", "chingada", "culero", "culera", "verga", "zorra",
    "cono", "negro", "sudaca", "retrasado",
  ],
};

const leetMap = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeModeratedText = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[01345789@$]/g, (character) => leetMap[character] || character)
  .replace(/\s+/g, " ")
  .trim();

const termPattern = (term) => {
  const compact = normalizeModeratedText(term).replace(/[^a-z]/g, "");
  const letters = [...compact]
    .map((letter) => `${escapeRegex(letter)}+[\\s._*~|/\\\\-]*`)
    .join("");
  return new RegExp(`(?:^|[^a-z])${letters}(?:e?s|er|ers|ing|ed|en|je|jes)?(?:$|[^a-z])`, "i");
};

const compiledTerms = Object.entries(blockedTermsByLanguage).flatMap(([language, terms]) => (
  terms.map((term) => ({ language, term, pattern: termPattern(term) }))
));

export const findBlockedLanguage = (value) => {
  const normalized = normalizeModeratedText(value);
  const match = compiledTerms.find(({ pattern }) => pattern.test(normalized));
  return match?.language || null;
};

export const containsBlockedLanguage = (value) => Boolean(findBlockedLanguage(value));
