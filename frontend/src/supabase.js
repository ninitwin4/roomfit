import { createClient } from "@supabase/supabase-js";

// Both values are safe to expose: the anon key only grants what your Row Level
// Security policies allow. Never put the service_role key in frontend code.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);

export async function fetchRooms() {
  const { data, error } = await supabase
    .from("rooms")
    .select(
      "id, title, rent, location, cleanliness, social_level, sleep_schedule, pets_allowed, smoking_allowed, owner_id"
    );

  if (error) throw new Error(`Couldn't load rooms: ${error.message}`);
  return data ?? [];
}
