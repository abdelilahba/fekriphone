const fs = require('fs');

// Supabase keys (public/anon - safe to include)
const supabaseUrl = 'https://zdvqqzplcuklajlnhgpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdnFxenBsY3VrbGFqbG5oZ3B0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTM1MDYsImV4cCI6MjA4NzY4OTUwNn0.Rg6n24mjPYVDxyWhL8zXfEzP184RCEGHHbqEBUDV1dc';

// Gemini API Key - MUST be set via environment variable (never hardcoded!)
// On Vercel: Settings > Environment Variables > GEMINI_API_KEY
// Locally: create a .env file with GEMINI_API_KEY=your_key (file is gitignored)
let geminiKey = process.env.GEMINI_API_KEY || '';

// Try to read from local .env file if env var is not set
if (!geminiKey) {
  try {
    const envFile = fs.readFileSync('.env', 'utf8');
    const match = envFile.match(/GEMINI_API_KEY=(.+)/);
    if (match) geminiKey = match[1].trim();
  } catch (e) {
    // .env file doesn't exist, that's fine
  }
}

if (!geminiKey) {
  console.warn('⚠️  GEMINI_API_KEY not found! AI assistant will not work.');
  console.warn('   Set it in .env file locally or in Vercel Environment Variables.');
  geminiKey = 'MISSING_KEY';
}

const envFileContent = `export const environment = {
  production: true,
  supabaseUrl: '${supabaseUrl}',
  supabaseKey: '${supabaseKey}',
  geminiKey: '${geminiKey}'
};
`;

const envDevFileContent = `export const environment = {
  production: false,
  supabaseUrl: '${supabaseUrl}',
  supabaseKey: '${supabaseKey}',
  geminiKey: '${geminiKey}'
};
`;

if (!fs.existsSync('./src/environments')) {
  fs.mkdirSync('./src/environments', { recursive: true });
}

fs.writeFileSync('./src/environments/environment.ts', envFileContent);
fs.writeFileSync('./src/environments/environment.development.ts', envDevFileContent);

console.log('✅ Environment files generated!' + (geminiKey === 'MISSING_KEY' ? ' (⚠️  without Gemini key)' : ''));
