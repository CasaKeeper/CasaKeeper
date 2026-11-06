export type ItemType = "interior-repairs" | "plumbing" | "electrical" | "seasonal-outdoor" | "safety-upgrades" | "general-maintenance";

export const ITEM_TYPES: { value: ItemType; label: string; icon: "hammer" | "droplet" | "zap" | "sprout" | "shield-check" | "clipboard-list"; color: string }[] = [
  { value: "interior-repairs", label: "Interior Repairs & Finishes", icon: "hammer", color: "#E87928" },
  { value: "plumbing", label: "Plumbing Work", icon: "droplet", color: "#2685DA" },
  { value: "electrical", label: "Electrical Work", icon: "zap", color: "#D6A000" },
  { value: "seasonal-outdoor", label: "Seasonal & Outdoor Maintenance", icon: "sprout", color: "#319A55" },
  { value: "safety-upgrades", label: "Home Safety & Upgrades", icon: "shield-check", color: "#8555CC" },
  { value: "general-maintenance", label: "General Maintenance & Organization", icon: "clipboard-list", color: "#64748B" },
];

export function itemType(value: string | null | undefined) {
  return ITEM_TYPES.find((type) => type.value === value) || null;
}

export function validItemType(value: string | null | undefined): value is ItemType | null | undefined {
  return !value || ITEM_TYPES.some((type) => type.value === value);
}
