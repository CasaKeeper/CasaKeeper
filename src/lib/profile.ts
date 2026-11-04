export const displayNameLimit = 120;

export function validateDisplayName(value: string) {
  const name = value.trim();
  return name.length >= 1 && name.length <= displayNameLimit ? name : null;
}
