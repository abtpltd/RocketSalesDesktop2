// Manager / App user filters can hold several choices. They travel as one text value, the choices separated by "|".

export const SEP = '|';
export const splitPicks = (v: string): string[] => v.split(SEP).map((x) => x.trim()).filter(Boolean);
export const joinPicks = (v: string[]): string => v.filter(Boolean).join(SEP);

/** The app users to offer: those of the chosen managers (all when none is chosen). */
export function usersFor<U extends { manager: string }>(users: U[], managers: string[]): U[] {
  return managers.length ? users.filter((u) => managers.includes(u.manager)) : users;
}

/** After the managers change, drop chosen app users who no longer belong to a chosen manager. */
export function keepUsers(chosen: string[], users: { code: string; name: string; manager: string }[], managers: string[]): string[] {
  if (!managers.length) return chosen;
  return chosen.filter((c) => users.some((u) => (u.code || u.name) === c && managers.includes(u.manager)));
}
