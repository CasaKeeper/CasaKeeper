export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function passwordRequirements(value: string) {
  return {
    length: value.length >= 8,
    lowercase: /[a-z]/.test(value),
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
  };
}

export function isStrongPassword(value: string) {
  return Object.values(passwordRequirements(value)).every(Boolean);
}
