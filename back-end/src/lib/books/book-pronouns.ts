/** Resolve supported pronoun forms without matching "he" inside "they". */
export function resolveBookPronouns(value: unknown) {
  const words = typeof value === 'string' ? value.trim().toLowerCase().split(/[^a-z]+/) : [];
  if (words.includes('she') || words.includes('girl')) {
    return { subject: 'she', object: 'her', possessive: 'her', reflexive: 'herself' };
  }
  if (words.includes('he') || words.includes('boy')) {
    return { subject: 'he', object: 'him', possessive: 'his', reflexive: 'himself' };
  }
  return { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themselves' };
}
