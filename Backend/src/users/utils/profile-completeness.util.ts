export interface ProfileCompletenessResult {
  score: number;         // 0–100
  completed: string[];
  missing: string[];
}

export function calculateProfileCompleteness(
  profile: Record<string, any>,
): ProfileCompletenessResult {
  const fields: { key: string; weight: number }[] = [
    { key: 'displayName', weight: 20 },
    { key: 'bio',         weight: 20 },
    { key: 'avatarUrl',   weight: 20 },
    { key: 'website',     weight: 15 },
    { key: 'socialLinks', weight: 15 },
    { key: 'preferences', weight: 10 },
  ];

  const completed: string[] = [];
  const missing: string[] = [];
  let score = 0;

  for (const { key, weight } of fields) {
    const value = profile[key];
    const hasValue =
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !(Array.isArray(value) && value.length === 0);

    if (hasValue) {
      completed.push(key);
      score += weight;
    } else {
      missing.push(key);
    }
  }

  return { score, completed, missing };
}