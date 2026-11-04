import type { SupabaseClient } from "@supabase/supabase-js";

export type WishlistRow = {
  id: string;
  title: string;
  price_cents: number | null;
  links: string[];
  notes: string;
  purchased: boolean;
};

export async function loadHouseholdWishlist(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("id, title, price_cents, links, notes, purchased")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { items: [] as WishlistRow[], error };
  return { items: (data || []) as WishlistRow[], error: null };
}
