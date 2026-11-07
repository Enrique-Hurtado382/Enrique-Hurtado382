import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { openDatabase } from './db.js';
import { createResponder } from './ai.js';
import { seedDatabase } from './seed.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT) || 3000;
const db = openDatabase(process.env.DATABASE_PATH || './data/alma.db');
seedDatabase(db);

const responder = createResponder(process.env);
const app = createApp({ db, responder });

app.listen(port, () => {
  console.log(`\n  ✨ Alma está lista en http://localhost:${port}\n`);
  if (responder.mode === 'demo') {
    console.log('  ⚠️  Modo demo: no hay ANTHROPIC_API_KEY, los personajes darán respuestas de ejemplo.');
    console.log('     Copia .env.example a .env y añade tu clave para activar la IA.\n');
  } else {
    console.log(`  🤖 Personajes impulsados por ${responder.model}\n`);
  }
});
