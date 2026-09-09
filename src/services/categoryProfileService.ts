import type { Category, RaceProfile } from '../types';

/**
 * Leest zowel het nieuwe meervoudige veld als het oude enkelvoudige veld.
 * Daardoor blijven bestaande IndexedDB-gegevens en oudere back-ups werken.
 */
export const getCategoryProfileIds = (category?: Category | null): string[] => {
  if (!category) return [];
  const ids = Array.isArray(category.raceProfileIds) ? category.raceProfileIds : [];
  return [...new Set([...ids, ...(category.raceProfileId ? [category.raceProfileId] : [])].filter(Boolean))];
};

export const getDefaultCategoryProfileId = (category?: Category | null): string =>
  getCategoryProfileIds(category)[0] || '';

export const categoryUsesProfile = (category: Category, profileId: string): boolean =>
  getCategoryProfileIds(category).includes(profileId);

export const getProfilesForCategory = (
  profiles: RaceProfile[],
  category?: Category | null
): RaceProfile[] => {
  const allowedIds = getCategoryProfileIds(category);
  return allowedIds.length > 0
    ? profiles.filter((profile) => allowedIds.includes(profile.id))
    : profiles;
};

export const withCategoryProfiles = (
  category: Category,
  profileIds: string[]
): Category => {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))];
  return {
    ...category,
    raceProfileIds: uniqueIds,
    raceProfileId: uniqueIds[0],
  };
};
