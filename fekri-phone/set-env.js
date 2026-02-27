const fs = require('fs');

// Supabase keys (public/anon - safe to include)
const supabaseUrl = 'https://zdvqqzplcuklajlnhgpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdnFxenBsY3VrbGFqbG5oZ3B0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTM1MDYsImV4cCI6MjA4NzY4OTUwNn0.Rg6n24mjPYVDxyWhL8zXfEzP184RCEGHHbqEBUDV1dc';

// Gemini API Key - read from env variable on Vercel, fallback for local dev
const geminiKey = process.env.GEMINI_API_KEY || 'AIzaSyAnjCBmhL4sB98-SoNwF1f9Bba-qzvXYPs';

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

console.log('✅ Environment files generated successfully!');
