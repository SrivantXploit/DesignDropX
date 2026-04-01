const supabaseUrl = 'https://czksyqihgwlzzlneurkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6a3N5cWloZ3dsenpsbmV1cmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDI4MzcsImV4cCI6MjA4OTg3ODgzN30.jfOV0h6QUhVEvTzhg0MixZjxy8JISNpZdqNZ0mAB6Lk';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Verify Supabase Connection
(async function verifyConnection() {
  try {
    const { error } = await supabaseClient.from('projects').select('id').limit(1);
    // Suppressing expected missing table error from failing loudly in console if user knows about it, but keeping it visible
    if (error) {
      console.error('Supabase Connection Failed:', error.message);
    } else {
      console.log('Successfully connected to Supabase table "projects"!');
    }
  } catch (err) {
    console.error('Supabase Initialization Error:', err);
  }
})();
