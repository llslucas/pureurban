// https://docs.expo.dev/guides/customizing-metro/
const http = require('http');
const https = require('https');
const { getDefaultConfig } = require('expo/metro-config');

// --- Cross-origin isolation (Bloqueio 3) ---------------------------------
//
// No alvo web o expo-sqlite roda sobre wa-sqlite, e o WorkerChannel dele
// (node_modules/expo-sqlite/web/WorkerChannel.ts) instancia `SharedArrayBuffer`.
// Todo browser moderno só expõe `SharedArrayBuffer` sob cross-origin isolation,
// que é decidida pelos headers COOP/COEP da resposta do DOCUMENTO — não do bundle.
//
// A doc do Expo prescreve `config.server.enhanceMiddleware` para isso, mas aqui
// isso não basta: o Expo CLI registra o middleware customizado no FIM da pilha
// connect (@expo/cli .../metro/instantiateMetro.js, `middleware.use(metroMiddleware)`),
// então ele alcança as rotas de bundle (/_expo/static/...) e NUNCA o index.html do
// SPA, que é servido por um middleware anterior. Medido com curl: o documento sai
// sem headers e `window.crossOriginIsolated` fica false.
//
// Patchar `createServer` põe o listener antes de toda a pilha, então os headers
// valem também para o documento.
//
// ORDEM: o patch precisa rodar antes de `runServer()` (@expo/cli
// .../metro/runServer-fork.js), que é quem constrói o servidor. Rodar no load do
// módulo garante isso. NÃO é `getDefaultConfig` que importa — ele não cria
// servidor nenhum; não mova este bloco para dentro de uma função achando que a
// única restrição é ficar acima dele.
//
// http E https: `runServer-fork.js:92-95` escolhe `https.createServer` quando
// `secureServerOptions` existe, ou seja, sob `expo start --web --https`. Como a
// câmera exige secure context, `--https` é a saída natural para testar fora de
// localhost — e com só `http` patchado os headers sumiriam exatamente aí.
//
// `credentialless` (e não `require-corp`) porque require-corp exigiria header CORP
// em todo subrecurso cross-origin. É o valor que a doc do Expo prescreve.
//
// NÃO REMOVA achando que é gambiarra: sem isto o Tier 2 (fila offline) não abre o
// banco no browser e a verificação das stories mobile volta a ser impossível.
function patchCreateServer(module_, name) {
  // Sem esta guarda, uma segunda avaliação deste arquivo no mesmo processo faz
  // `original` capturar a função JÁ patchada: os listeners empilham e cada
  // resposta seta os headers N vezes.
  if (module_.__coopCoepPatched) {
    return;
  }
  module_.__coopCoepPatched = true;

  const original = module_.createServer;
  module_.createServer = function patchedCreateServer(...args) {
    const server = original.apply(this, args);
    server.prependListener('request', (_req, res) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    });
    return server;
  };
  return name;
}

const patched = [patchCreateServer(http, 'http'), patchCreateServer(https, 'https')].filter(
  Boolean,
);

// Sem este log o patch falha em silêncio se uma versão futura do @expo/cli passar
// a capturar `createServer` num binding ESM nomeado (que não enxerga reatribuição
// posterior no objeto do módulo). O sintoma que chegaria ao dev seria um
// `SharedArrayBuffer is not defined` no boot, sem nenhuma pista de origem.
if (patched.length > 0) {
  console.log(`[metro] COOP/COEP aplicados via patch de createServer (${patched.join(', ')})`);
}

const config = getDefaultConfig(__dirname);

// --- WASM como asset (Bloqueio 1) ----------------------------------------
//
// node_modules/expo-sqlite/web/worker.ts faz `import wasmModule from
// './wa-sqlite/wa-sqlite.wasm'`. O assetExts default do Expo traz db/heic/avif,
// mas não `wasm`, então o Metro não resolve o import e o bundle web quebra em
// src/lib/database.ts → src/app/_layout.tsx (caminho de boot, não é lazy).
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
