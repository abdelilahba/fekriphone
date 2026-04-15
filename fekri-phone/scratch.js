const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envStr = fs.readFileSync('src/environments/environment.ts', 'utf8');
const urlMatch = envStr.match(/supabaseUrl\s*:\s*'([^']+)'/);
const keyMatch = envStr.match(/supabaseKey\s*:\s*'([^']+)'/);

const supabase = createClient(urlMatch[1], keyMatch[1]);
supabase.from('ventes').select('montant_total, montant_paye, profit_total').limit(1).then(res => console.log(JSON.stringify(res, null, 2)));
