const STOPWORDS = new Set(
  "a an and are as at be by can do does for from has have how i if in is it its my of on or so that the their there this to was we what when where which who why will with you your".split(" "),
);

/** Lowercase alphanumeric tokens, stopwords removed. Keeps tokens like "429" and "2xx". */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));
}
