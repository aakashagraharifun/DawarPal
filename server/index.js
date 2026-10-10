import { config } from './config.js';
import { createApp } from './app.js';
import { createFallbackLog } from './fallbackLog.js';
import { createLLMFromConfig, usesGroq } from './llm/index.js';
import { createMemoryStore } from './store/memoryStore.js';
import { createSupabaseStore } from './store/supabaseStore.js';
import { enableForceIpv4 } from './forceIpv4.js';

if (config.forceIpv4) enableForceIpv4();

for (const [role, model] of [['BOT_MODEL', config.botModel], ['JUDGE_MODEL', config.judgeModel]]) {
  const [needs, key] = usesGroq(model) ? ['GROQ_API_KEY', config.groqApiKey] : ['OPENROUTER_API_KEY', config.openrouterApiKey];
  if (!key) console.warn(`[warn] ${role}=${model} needs ${needs}, which is not set — those calls will fail.`);
}

const llm = createLLMFromConfig(config);

const printPasswords = (session) => {
  if (config.debugPasswords) console.log(`[debug] session ${session.id} passwords:`, session.passwords);
};

async function createStore() {
  if (config.supabaseUrl && config.supabaseServiceKey) {
    const store = createSupabaseStore({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey });
    try {
      await store.healthCheck();
    } catch (err) {
      console.error(`[fatal] Supabase check failed: ${err.message}`);
      console.error('        Did you run server/db/schema.sql in the Supabase SQL editor?');
      process.exit(1);
    }
    if (config.debugPasswords) {
      const create = store.createSession;
      store.createSession = async () => {
        const { id } = await create();
        printPasswords(await store.getSession(id));
        return { id };
      };
    }
    console.log('Store: Supabase');
    return store;
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('[fatal] SUPABASE_URL / SUPABASE_SERVICE_KEY are required in production.');
    process.exit(1);
  }
  console.warn('[warn] Supabase not configured — using the IN-MEMORY store. Data is lost on restart.');
  return createMemoryStore({
    onAttempt: (row) => console.log('[attempt]', JSON.stringify(row)),
    onSessionCreated: printPasswords,
  });
}

const store = await createStore();
const app = createApp({ store, llm, config, fallbackLog: createFallbackLog() });

app.listen(config.port, () => {
  console.log(`Dwarpal server on http://localhost:${config.port}`);
  const perMin = (m) => (usesGroq(m) ? config.llm.groqMaxPerMinute : config.llm.maxPerMinute);
  console.log(`  bot=${config.botModel}  judge=${config.judgeModel}  max ${perMin(config.botModel)} calls/min`);
});
