import type { Category, Participant, RaceProfile } from '../types';
import { getCategoryProfileIds } from './categoryProfileService';

/** Competition age is the age on December 31 of the event year. */
export function competitionAge(birthDate: string | undefined, eventDate: string): number | undefined {
  const eventYear = Number(eventDate?.match(/^\d{4}/)?.[0]);
  const iso = birthDate?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const local = birthDate?.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!iso && !local) return undefined;
  const [year, month, day] = iso ? [+iso[1], +iso[2], +iso[3]] : [+local![3], +local![2], +local![1]];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!eventYear || year > eventYear || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return eventYear - year;
}

export function classifyParticipant(p: Participant, eventDate: string, categories: Category[], profiles: RaceProfile[]) {
  const age = competitionAge(p.birthDate, eventDate);
  const matches = age === undefined ? [] : categories.filter(c =>
    (c.minAge === undefined || age >= c.minAge) && (c.maxAge === undefined || age <= c.maxAge) &&
    (c.gender === 'ALL' || c.gender === p.gender));
  const category = p.categoryAssignment === 'manual' ? categories.find(c => c.id === p.categoryId) : matches.length === 1 ? matches[0] : undefined;
  const article = p.article ?? String(p.stamhoofdRegistration?.product ?? '');
  const matchingProfiles = category ? profiles.filter(profile => profile.articles?.includes(article) && getCategoryProfileIds(category).includes(profile.id)) : [];
  const profile = p.profileAssignment === 'manual' ? profiles.find(profile => profile.id === p.raceProfileId) : matchingProfiles.length === 1 ? matchingProfiles[0] : undefined;
  const issues: string[] = [];
  if (!category) issues.push(age === undefined && p.categoryAssignment !== 'manual' ? 'Geldige geboortedatum en evenementdatum nodig' : matches.length > 1 ? 'Meerdere leeftijdscategorieën passen' : 'Geen leeftijdscategorie gevonden; controleer leeftijd en geslacht');
  if (!profile) issues.push(matchingProfiles.length > 1 ? 'Meerdere wedstrijdprofielen passen' : 'Geen wedstrijdprofiel gekoppeld aan artikel en categorie');
  return { categoryId: category?.id ?? '', raceProfileId: profile?.id ?? '', issues, age };
}
