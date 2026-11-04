export function validateHouseholdName(value: string) {
  const name = value.trim();
  return name.length >= 1 && name.length <= 120 ? name : null;
}

export function householdErrorMessage(error: unknown, mode: "create" | "join") {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (mode === "join" && (message.includes("invalid") || message.includes("expired") || message.includes("revoked"))) return "That invitation is invalid, expired, revoked, or already used.";
  if (message.includes("already belongs") || message.includes("unique")) return "This account already belongs to a household.";
  return mode === "create" ? "We could not create the household. Check the name and try again." : "We could not join that household. Check the invitation code and try again.";
}
