// Configuração pública da loja. A chave abaixo é a "publishable" do Supabase:
// ela é feita pra ficar no navegador. Quem protege os dados são as regras (RLS) do banco.
window.LOJA_CONFIG = {
  SUPABASE_URL: 'https://ncmfxpqwaeugupobmstj.supabase.co',
  SUPABASE_KEY: 'sb_publishable_tKuenQgxgTAXqvD1XY_Ojw_8Xfm8ogT',
  // Arquivos de marca: basta salvar com esses nomes na pasta assets/.
  // Enquanto não existirem, o site mostra o texto "RA NUTRIÇÃO" e um espaço reservado.
  LOGO_URL: 'assets/logo.png',
  FOTO_RAFAEL: 'assets/rafael.jpg',
  // Aparece junto da foto em todo produto cuja escolha se chama "Tamanho"
  TABELA_MEDIDAS: 'assets/produtos/tabela-medidas-camisa.webp',
  BUCKET: 'loja-produtos'
};
