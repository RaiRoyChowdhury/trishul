import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// The anon key is designed to be public: it can only do what Row Level Security allows. Never put the service key here.
export const supabase = url && key ? createClient(url, key) : null;
export const supabaseConfigured = !!supabase;
