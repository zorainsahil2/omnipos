import { createClient } from '@supabase/supabase-js';

// Admin client uses the SERVICE ROLE key — bypasses RLS.
// ONLY used in the Super Admin panel. Never expose this key to shopkeepers.
// Add VITE_SUPABASE_SERVICE_ROLE_KEY to your .env.local and Vercel env vars.

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const serviceRoleKey  = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.warn(
    '[supabaseAdmin] VITE_SUPABASE_SERVICE_ROLE_KEY is missing. ' +
    'Super Admin store creation will not work. Add it to your .env.local.'
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl || '',
  serviceRoleKey || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
