// Com Stack.Protected, uma rota fora do guard sai da árvore e o router cai aqui.
// Sem este arquivo, `/scan` deslogado renderiza "unmatched route" (AC #3).
// Mesma decisão de destino da entrada em `index.tsx`.
export { default } from './index'
