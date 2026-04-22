window.TT_SUPABASE_URL = "https://rfcwfbdcdnjpaxwztvfr.supabase.co";
window.TT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY3dmYmRjZG5qcGF4d3p0dmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODQ5NzUsImV4cCI6MjA4OTk2MDk3NX0.9XLDNzgIXu5-i3oTvkYem3hTX2rgmF3D5vw40F8tNwQ";

window.ttSupabase = supabase.createClient(
  window.TT_SUPABASE_URL,
  window.TT_SUPABASE_ANON_KEY
);
