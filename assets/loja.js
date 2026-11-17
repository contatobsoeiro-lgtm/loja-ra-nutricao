(() => {
  const C = window.LOJA_CONFIG;
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: false } });
  const $ = (id) => document.getElementById(id);
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BAG_KEY = 'ra_collection_sacola_v1';
  const MAX_QTD = 50;

  let produtos = [];
  let atual = null;      // produto aberto
  let tamanho = null;    // tamanho escolhido
  let qtd = 1;
  let etapa = 'sacola';  // sacola | dados | sucesso

  // Logomarca e foto do Rafael: só aparecem se o arquivo existir
  function seExistir(url, ok) { if (!url) return; const i = new Image(); i.onload = () => ok(url); i.src = url; }
  seExistir(C.LOGO_URL, (u) => {
    $('logo').innerHTML = `<img src="${esc(u)}" alt="RA Nutrição">`;
  });
  seExistir(C.FOTO_RAFAEL, (u) => { $('authorPhoto').innerHTML = `<img src="${esc(u)}" alt="Encontros da comunidade com o nutricionista Rafael Albergaria">`; $('authorPhoto').classList.add('loaded'); });

  // ---------- Prazo da lista ----------
  // A lista vale até o fim do dia configurado em DATA_FECHAMENTO.
  const fimLista = C.DATA_FECHAMENTO ? new Date(C.DATA_FECHAMENTO + 'T23:59:59') : null;
  const prazoValido = fimLista && !isNaN(fimLista);
  const encerrada = () => prazoValido && new Date() > fimLista;
  const dataPrazo = () => fimLista.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  if (prazoValido) $('prazo').innerHTML = encerrada() ? `Lista encerrada em <b>${esc(dataPrazo())}</b>` : `Lista de espera aberta até <b>${esc(dataPrazo())}</b>`;
  if (encerrada()) $('aviso').lastElementChild.textContent = 'Avisaremos quando abrir a próxima';

  // ---------- Sacola (persistida no navegador) ----------
  const lerSacola = () => { try { return JSON.parse(localStorage.getItem(BAG_KEY)) || []; } catch { return []; } };
  let sacola = lerSacola();
  const salvar = () => { try { localStorage.setItem(BAG_KEY, JSON.stringify(sacola)); } catch {} atualizarContador(); };
  const chave = (pid, t) => `${pid}::${t || ''}`;
  const prod = (id) => produtos.find((p) => p.id === id);

  function atualizarContador() {
    const n = sacola.reduce((s, i) => s + i.quantidade, 0);
    $('bagCount').textContent = n;
    $('bagCount').hidden = n === 0;
    $('bagBtn').setAttribute('aria-label', n ? `Abrir sacola, ${n} ${n === 1 ? 'item' : 'itens'}` : 'Abrir sacola');
    // no celular, a sacola vira uma barra fixa no rodapé assim que tem algo dentro
    $('mobBar').hidden = n === 0;
    $('mobBar').innerHTML = `<span>Ver sacola (${n})</span><span>${produtos.length ? brl(totalSacola()) : ''}</span>`;
  }

  // Remove itens de produtos que saíram do catálogo e atualiza nome e preço
  function sincronizarSacola() {
    sacola = sacola.filter((i) => {
      const p = prod(i.produto_id);
      if (!p) return false;
      if (p.tamanhos.length && !p.tamanhos.includes(i.tamanho)) return false;
      return true;
    });
    salvar();
  }

  const totalSacola = () => sacola.reduce((s, i) => s + i.quantidade * Number(prod(i.produto_id)?.preco || 0), 0);

  function adicionar(p, t, q) {
    const k = chave(p.id, t);
    const ex = sacola.find((i) => chave(i.produto_id, i.tamanho) === k);
    if (ex) ex.quantidade = Math.min(MAX_QTD, ex.quantidade + q);
    else sacola.push({ produto_id: p.id, tamanho: t || null, quantidade: q });
    salvar();
  }

  // ---------- Mídia ----------
  function midia(p, cls = '') {
    if (p.foto_url) return `<img src="${esc(p.foto_url)}" alt="${esc(p.nome)}" loading="lazy" class="${cls}">`;
    return `<div class="ph">${icone(p.nome)}<span>Foto em breve</span></div>`;
  }
  // Desenho simples para produto ainda sem foto, escolhido pelo nome
  function icone(nome) {
    const n = String(nome || '').toLowerCase();
    const d = /garrafa|squeeze|copo/.test(n) ? '<path d="M9.5 3h5v3l1.5 2.5V20a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8.5L9.5 6V3Z"/><path d="M8 12h8"/>'
      : /bolsa|sacola|bag/.test(n) ? '<path d="M5 9h14l-1 11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 9Z"/><path d="M9 9V6.5a3 3 0 0 1 6 0V9M5.4 13h13.2"/>'
      : /camis|blusa|regata/.test(n) ? '<path d="M8.5 4 4 6.5 6 10l2-1v11h8V9l2 1 2-3.5L15.5 4a3.5 3.5 0 0 1-7 0Z"/>'
      : '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="m4 15 4-4 4 4 3-3 5 5"/>';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${d}</svg>`;
  }
  // "Camisa Nexus Club | Modelo 01" vira título "Camisa Nexus Club" e linha de apoio "Modelo 01"
  const partes = (nome) => { const [t, ...r] = String(nome).split('|'); return [t.trim(), r.join('|').trim()]; };
  const nomeLimpo = (nome) => partes(nome).filter(Boolean).join(', ');
  const faixaTam = (p) => (!p.tamanhos.length ? 'Tamanho único' : p.rotulo.toLowerCase() === 'tamanho' && p.tamanhos.length > 2 ? `${p.tamanhos[0]} ao ${p.tamanhos[p.tamanhos.length - 1]}` : p.tamanhos.join(', '));

  // ---------- Catálogo ----------
  async function carregar() {
    const { data, error } = await sb.from('loja_produtos').select('id,nome,descricao,preco,tamanhos,rotulo_opcoes,foto_url,ordem').eq('ativo', true).order('ordem').order('nome');
    if (error) { $('grid').innerHTML = '<p class="empty">Não foi possível carregar a coleção agora. Atualize a página em instantes.</p>'; return; }
    produtos = data.map((p) => ({ ...p, tamanhos: p.tamanhos || [], rotulo: p.rotulo_opcoes || 'Tamanho' }));
    sincronizarSacola();
    $('catCount').textContent = `${produtos.length} ${produtos.length === 1 ? 'peça' : 'peças'}`;
    if (!produtos.length) { $('grid').innerHTML = '<p class="empty">A coleção está sendo preparada. Volte em breve.</p>'; return; }
    $('grid').innerHTML = produtos.map((p) => {
      const [titulo, apoio] = partes(p.nome);
      return `
      <button class="card" data-id="${p.id}" aria-label="${esc(p.nome)}, ${brl(p.preco)}">
        <div class="card-media">${midia(p)}</div>
        <div class="card-body">
          <span class="card-name">${esc(titulo)}</span>
          <span class="card-meta">${esc([apoio, faixaTam(p)].filter(Boolean).join(', '))}</span>
          <div class="card-foot"><span class="card-price">${brl(p.preco)}</span><span class="card-cta">${p.tamanhos.length ? 'Escolher ' + esc(p.rotulo.toLowerCase()) : 'Adicionar'}</span></div>
        </div>
      </button>`;
    }).join('');
    // destaque da abertura: o primeiro produto com foto
    const d = produtos.find((p) => p.foto_url);
    if (d) {
      $('heroFoto').innerHTML = `<img src="${esc(d.foto_url)}" alt="${esc(d.nome)}"><span class="selo">${esc(partes(d.nome)[0])}<b>${brl(d.preco)}</b></span>`;
      $('heroFoto').onclick = () => abrirProduto(d.id);
    } else { $('heroFoto').hidden = true; }
    atualizarContador();
  }
  $('mobBar').addEventListener('click', () => abrirSacola());
  $('grid').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) abrirProduto(c.dataset.id); });

  // ---------- Painéis ----------
  let ultimoFoco = null;
  function abrir(id) {
    ultimoFoco = document.activeElement;
    const el = $(id); el.hidden = false;
    requestAnimationFrame(() => { el.classList.add('open'); $('overlay').classList.add('open'); });
    document.body.classList.add('lock');
    setTimeout(() => el.querySelector('button, input')?.focus(), 50);
  }
  function fechar(id) {
    const el = $(id); el.classList.remove('open');
    if (!document.querySelector('.product-modal.open, .drawer.open')) { $('overlay').classList.remove('open'); document.body.classList.remove('lock'); }
    setTimeout(() => { if (!el.classList.contains('open')) el.hidden = true; }, 400);
    ultimoFoco?.focus?.();
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-close]'); if (b) fechar(b.dataset.close); });
  $('overlay').addEventListener('click', () => { ['pm', 'drawer'].forEach((id) => $(id).classList.contains('open') && fechar(id)); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('zoom').classList.contains('open')) return $('zoom').classList.remove('open');
    if ($('pm').classList.contains('open')) return fechar('pm');
    if ($('drawer').classList.contains('open')) return fechar('drawer');
  });

  // ---------- Produto ----------
  function abrirProduto(id) {
    atual = prod(id); if (!atual) return;
    tamanho = null; qtd = 1;
    // galeria: foto do produto e, nas peças com tamanho, a tabela de medidas
    imagens = [];
    if (atual.foto_url) imagens.push({ url: atual.foto_url, rot: 'Foto', alt: atual.nome });
    const temTabela = !!(C.TABELA_MEDIDAS && atual.tamanhos.length && atual.rotulo.toLowerCase() === 'tamanho');
    if (temTabela) imagens.push({ url: C.TABELA_MEDIDAS, rot: 'Medidas', alt: 'Tabela de medidas da camisa' });
    $('pmMedidas').hidden = !temTabela;
    $('pmThumbs').hidden = imagens.length < 2;
    $('pmThumbs').innerHTML = imagens.map((im, i) => `<button type="button" class="pm-thumb" data-img="${i}" aria-pressed="${i === 0}"><span><img src="${esc(im.url)}" alt=""></span>${esc(im.rot)}</button>`).join('');
    mostrarImagem(0);
    $('pmName').textContent = nomeLimpo(atual.nome);
    $('pmPrice').innerHTML = `${brl(atual.preco)}<small>Valor estimado por unidade</small>`;
    $('pmDesc').textContent = atual.descricao || '';
    $('pmDesc').hidden = !atual.descricao;
    $('pmSizesWrap').hidden = !atual.tamanhos.length;
    $('pmSizeLabel').textContent = atual.rotulo;
    $('pmSizes').setAttribute('aria-label', atual.rotulo);
    $('pmSizes').innerHTML = atual.tamanhos.map((t) => `<button type="button" class="size" aria-pressed="false" data-t="${esc(t)}">${esc(t)}</button>`).join('');
    $('pmSizeHint').textContent = '';
    renderQtd();
    abrir('pm');
  }
  $('pmSizes').addEventListener('click', (e) => {
    const b = e.target.closest('.size'); if (!b) return;
    tamanho = b.dataset.t;
    $('pmSizes').querySelectorAll('.size').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    $('pmSizeHint').textContent = '';
  });
  function renderQtd() {
    $('pmQtyVal').textContent = qtd;
    $('pmQty').querySelector('[data-q="-1"]').disabled = qtd <= 1;
    $('pmQty').querySelector('[data-q="1"]').disabled = qtd >= MAX_QTD;
  }
  $('pmQty').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; qtd = Math.max(1, Math.min(MAX_QTD, qtd + Number(b.dataset.q))); renderQtd(); });
  let imagens = [], imgIdx = 0;
  function mostrarImagem(i) {
    imgIdx = i;
    const im = imagens[i];
    $('pmMedia').innerHTML = im ? `<img src="${esc(im.url)}" alt="${esc(im.alt)}">` : midia(atual);
    $('pmThumbs').querySelectorAll('.pm-thumb').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.img) === i)));
  }
  function ampliar(im) { if (!im) return; $('zoom').innerHTML = `<img src="${esc(im.url)}" alt="${esc(im.alt)}">`; $('zoom').classList.add('open'); }
  $('pmThumbs').addEventListener('click', (e) => { const b = e.target.closest('.pm-thumb'); if (b) mostrarImagem(Number(b.dataset.img)); });
  $('pmMedidas').addEventListener('click', () => { const i = imagens.findIndex((im) => im.rot === 'Medidas'); mostrarImagem(i); ampliar(imagens[i]); });
  $('pmMedia').addEventListener('click', () => ampliar(imagens[imgIdx]));
  $('zoom').addEventListener('click', () => $('zoom').classList.remove('open'));
  $('pmAdd').addEventListener('click', () => {
    if (atual.tamanhos.length && !tamanho) { $('pmSizeHint').textContent = `Escolha uma opção de ${atual.rotulo.toLowerCase()} para continuar.`; return; }
    adicionar(atual, tamanho, qtd);
    fechar('pm');
    toast(`${partes(atual.nome)[0]}${tamanho ? ', tamanho ' + tamanho : ''} na sacola`, 'Ver sacola', abrirSacola);
  });

  // ---------- Toast ----------
  let toastT;
  function toast(msg, acao, fn) {
    const t = $('toast');
    t.innerHTML = `<span>${esc(msg)}</span>${acao ? `<button type="button">${esc(acao)}</button>` : ''}`;
    if (acao) t.querySelector('button').onclick = () => { t.classList.remove('show'); fn(); };
    t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4200);
  }

  // ---------- Sacola: telas ----------
  function abrirSacola() { if (etapa === 'sucesso') etapa = 'sacola'; renderSacola(); abrir('drawer'); }
  $('bagBtn').addEventListener('click', abrirSacola);

  function renderSacola() {
    const body = $('drawerBody'), foot = $('drawerFoot');
    if (etapa === 'sucesso') return;
    if (!sacola.length) {
      etapa = 'sacola';
      $('drawerTitle').textContent = 'Sua sacola';
      body.innerHTML = `<div class="bag-empty"><p>Sua sacola está vazia.</p><button class="btn ghost" data-close="drawer">Ver a coleção</button></div>`;
      foot.innerHTML = ''; foot.hidden = true; return;
    }
    foot.hidden = false;
    if (etapa === 'sacola') {
      $('drawerTitle').textContent = 'Sua sacola';
      body.innerHTML = sacola.map((i, idx) => {
        const p = prod(i.produto_id); if (!p) return '';
        return `<div class="line-item">
          <div class="li-media">${midia(p)}</div>
          <div>
            <div class="li-top"><span class="li-name">${esc(nomeLimpo(p.nome))}</span><span class="li-sub">${brl(i.quantidade * p.preco)}</span></div>
            <p class="li-meta">${i.tamanho ? esc(p.rotulo) + ' ' + esc(i.tamanho) + ', ' : ''}${brl(p.preco)} cada</p>
            <div class="li-bottom">
              <div class="qty sm"><button type="button" data-a="menos" data-i="${idx}" aria-label="Diminuir" ${i.quantidade <= 1 ? 'disabled' : ''}>−</button><output>${i.quantidade}</output><button type="button" data-a="mais" data-i="${idx}" aria-label="Aumentar" ${i.quantidade >= MAX_QTD ? 'disabled' : ''}>+</button></div>
              <button type="button" class="li-remove" data-a="remover" data-i="${idx}">Remover</button>
            </div>
          </div>
        </div>`;
      }).join('');
      foot.innerHTML = `
        <div class="totals"><span>Total estimado</span><strong>${brl(totalSacola())}</strong></div>
        <p class="totals-note">Sem pagamento agora. O valor final é confirmado quando fecharmos a encomenda.</p>
        ${encerrada() ? `<p class="closed-note">A lista de espera encerrou em ${esc(dataPrazo())}. Avisaremos a comunidade quando abrir a próxima.</p>` : '<button class="btn block" id="toDados">Continuar</button>'}
        <button class="btn ghost block" data-close="drawer" style="margin-top:10px">Continuar escolhendo</button>`;
      if ($('toDados')) $('toDados').onclick = () => { etapa = 'dados'; renderSacola(); $('drawerBody').scrollTop = 0; };
    } else if (etapa === 'dados') {
      $('drawerTitle').textContent = 'Lista de espera';
      const salvo = lerDados();
      body.innerHTML = `
        <button class="back" id="voltar">← Voltar para a sacola</button>
        <h3 class="form-title">Confira seus produtos</h3>
        <div class="review">
          ${sacola.map((i) => { const p = prod(i.produto_id); return `<div class="review-row"><span>${i.quantidade}× ${esc(nomeLimpo(p.nome))}${i.tamanho ? ', ' + esc(i.tamanho) : ''}</span><span>${brl(i.quantidade * p.preco)}</span></div>`; }).join('')}
          <div class="review-total"><span>Total estimado</span><span>${brl(totalSacola())}</span></div>
        </div>
        <h3 class="form-title">Seus dados</h3>
        <p class="form-lead">Usamos só para falar com você sobre esta encomenda.</p>
        <form id="form" novalidate>
          <div class="field"><label for="fNome">Nome completo</label><input id="fNome" name="nome" autocomplete="name" required maxlength="120" value="${esc(salvo.nome)}"><p class="err" id="eNome"></p></div>
          <div class="field"><label for="fWhats">WhatsApp com DDD</label><input id="fWhats" name="whatsapp" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="(27) 99999-9999" required value="${esc(salvo.whatsapp)}"><p class="err" id="eWhats"></p></div>
          <div class="field"><label for="fEmail">E-mail <em>(opcional)</em></label><input id="fEmail" name="email" type="email" autocomplete="email" maxlength="160" value="${esc(salvo.email)}"><p class="err" id="eEmail"></p></div>
          <div class="field">
            <label id="lReceb">Como você prefere receber?</label>
            <div class="sizes" id="fReceb" role="group" aria-labelledby="lReceb">
              <button type="button" class="size" data-r="envio" aria-pressed="${salvo.recebimento === 'envio'}">Receber em casa</button>
              <button type="button" class="size" data-r="retirada" aria-pressed="${salvo.recebimento === 'retirada'}">Retirar pessoalmente</button>
            </div>
            <p class="field-hint" id="hReceb"></p>
            <p class="err" id="eReceb"></p>
          </div>
          <div id="envioWrap" hidden>
            <div class="field"><label for="fCep">CEP de entrega</label><input id="fCep" name="cep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" value="${esc(salvo.cep)}"><p class="err" id="eCep"></p></div>
            <div class="field-row">
              <div class="field"><label for="fCidade">Cidade</label><input id="fCidade" name="cidade" autocomplete="address-level2" maxlength="80" value="${esc(salvo.cidade)}"><p class="err" id="eCidade"></p></div>
              <div class="field"><label for="fUf">UF</label><input id="fUf" name="uf" autocomplete="address-level1" maxlength="2" value="${esc(salvo.uf)}"><p class="err" id="eUf"></p></div>
            </div>
          </div>
          <input class="hp" name="empresa" id="fHp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <label class="consent"><input type="checkbox" id="fConsent"><span>Concordo que meus dados sejam usados exclusivamente para organizar a lista de interesse e para que a equipe RA Nutrição entre em contato comigo sobre esta encomenda, conforme a Lei Geral de Proteção de Dados (LGPD).</span></label>
          <p class="err" id="eConsent" style="color:var(--err);font-size:12px;margin-top:6px"></p>
        </form>`;
      foot.innerHTML = `<p class="form-error" id="formErr" hidden></p>
        <button class="btn block tall" id="confirmar">Confirmar interesse e entrar na lista de espera</button>
        <p class="totals-note" style="margin:10px 0 0;text-align:center">Nenhuma cobrança será feita agora.</p>`;
      $('voltar').onclick = () => { guardarDados(); etapa = 'sacola'; renderSacola(); };
      $('fWhats').addEventListener('input', (e) => { e.target.value = mascara(e.target.value); });
      $('fWhats').value = mascara($('fWhats').value);
      recebimento = salvo.recebimento || null;
      renderReceb();
      $('fReceb').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; recebimento = b.dataset.r; erro('receb', ''); renderReceb(); });
      $('fCep').value = mascaraCep($('fCep').value);
      $('fCep').addEventListener('input', (e) => { e.target.value = mascaraCep(e.target.value); if (e.target.value.length === 9) { erro('cep', ''); buscarCep(e.target.value); } });
      $('fCidade').addEventListener('input', () => erro('cidade', ''));
      $('fUf').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2); erro('uf', ''); });
      $('confirmar').onclick = enviar;
      $('form').addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
    }
  }

  $('drawerBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const i = sacola[Number(b.dataset.i)]; if (!i) return;
    if (b.dataset.a === 'mais') i.quantidade = Math.min(MAX_QTD, i.quantidade + 1);
    if (b.dataset.a === 'menos') i.quantidade = Math.max(1, i.quantidade - 1);
    if (b.dataset.a === 'remover') sacola.splice(Number(b.dataset.i), 1);
    salvar(); renderSacola();
  });

  // ---------- Dados do paciente ----------
  const DADOS_KEY = 'ra_collection_dados_v1';
  function lerDados() { try { return JSON.parse(sessionStorage.getItem(DADOS_KEY)) || {}; } catch { return {}; } }
  function guardarDados() {
    try { sessionStorage.setItem(DADOS_KEY, JSON.stringify({ nome: $('fNome')?.value || '', whatsapp: $('fWhats')?.value || '', email: $('fEmail')?.value || '', recebimento, cep: $('fCep')?.value || '', cidade: $('fCidade')?.value || '', uf: $('fUf')?.value || '' })); } catch {}
  }

  // ---------- Recebimento ----------
  let recebimento = null; // envio | retirada
  function renderReceb() {
    $('fReceb').querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === recebimento)));
    $('envioWrap').hidden = recebimento !== 'envio';
    $('hReceb').textContent = recebimento === 'envio' ? 'O frete é calculado pelo seu CEP e informado junto com o valor final, antes de qualquer pagamento.'
      : recebimento === 'retirada' ? 'Combinamos o local e o dia da retirada pelo WhatsApp quando os produtos chegarem.' : '';
  }
  function mascaraCep(v) { const d = String(v || '').replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; }
  // Preenche cidade e UF pelo CEP. Se a consulta falhar, a pessoa digita normalmente.
  async function buscarCep(v) {
    const d = v.replace(/\D/g, '');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro || $('fCep')?.value.replace(/\D/g, '') !== d) return;
      if (j.localidade) { $('fCidade').value = j.localidade; erro('cidade', ''); }
      if (j.uf) { $('fUf').value = j.uf; erro('uf', ''); }
    } catch {}
  }
  function mascara(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  function erro(campo, msg) {
    const map = { nome: ['fNome', 'eNome'], whats: ['fWhats', 'eWhats'], email: ['fEmail', 'eEmail'], consent: ['fConsent', 'eConsent'], receb: ['fReceb', 'eReceb'], cep: ['fCep', 'eCep'], cidade: ['fCidade', 'eCidade'], uf: ['fUf', 'eUf'] };
    const [inp, er] = map[campo];
    $(er).textContent = msg || '';
    if (campo !== 'consent' && campo !== 'receb') $(inp).setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !!msg;
  }

  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  let enviando = false;
  async function enviar() {
    if (enviando) return;
    const nome = $('fNome').value.trim().replace(/\s+/g, ' ');
    const whats = $('fWhats').value.replace(/\D/g, '');
    const email = $('fEmail').value.trim();
    let ruim = false;
    ruim = erro('nome', nome.length < 3 || !nome.includes(' ') ? 'Informe seu nome completo.' : '') || ruim;
    ruim = erro('whats', whats.length < 10 || whats.length > 11 ? 'Informe o WhatsApp com DDD, só números.' : '') || ruim;
    ruim = erro('email', email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'Confira o e-mail ou deixe em branco.' : '') || ruim;
    const envio = recebimento === 'envio';
    const cep = envio ? $('fCep').value.replace(/\D/g, '') : '';
    const cidade = envio ? $('fCidade').value.trim().replace(/\s+/g, ' ') : '';
    const uf = envio ? $('fUf').value.trim().toUpperCase() : '';
    ruim = erro('receb', !recebimento ? 'Escolha como prefere receber.' : '') || ruim;
    ruim = erro('cep', envio && cep.length !== 8 ? 'Informe o CEP com 8 números.' : '') || ruim;
    ruim = erro('cidade', envio && cidade.length < 2 ? 'Informe a cidade.' : '') || ruim;
    ruim = erro('uf', envio && !UFS.includes(uf) ? 'Informe a sigla do estado.' : '') || ruim;
    ruim = erro('consent', !$('fConsent').checked ? 'Marque a autorização para continuar.' : '') || ruim;
    if (ruim) { (document.querySelector('[aria-invalid="true"]') || (!recebimento && $('fReceb').querySelector('button')))?.focus(); return; }
    if (encerrada()) { $('formErr').textContent = 'A lista de espera já encerrou.'; $('formErr').hidden = false; return; }
    if ($('fHp').value) return; // robô

    enviando = true;
    const btn = $('confirmar'); btn.disabled = true; btn.textContent = 'Registrando seu interesse...';
    $('formErr').hidden = true;
    guardarDados();
    const { data, error } = await sb.rpc('loja_criar_pedido', {
      p_nome: nome, p_whatsapp: whats, p_email: email || null, p_consentimento: true,
      p_recebimento: recebimento, p_cep: cep || null, p_cidade: cidade || null, p_uf: uf || null,
      p_itens: sacola.map((i) => ({ produto_id: i.produto_id, tamanho: i.tamanho, quantidade: i.quantidade }))
    });
    enviando = false;
    if (error) {
      btn.disabled = false; btn.textContent = 'Confirmar interesse e entrar na lista de espera';
      const m = /aguarde/i.test(error.message) ? 'Seu pedido já foi recebido. Se quiser enviar outro, aguarde alguns segundos.'
        : /encerrad/i.test(error.message) ? 'A lista de espera já encerrou.'
        : /CEP|recebimento|cidade|estado/i.test(error.message) ? 'Confira a forma de recebimento, o CEP, a cidade e o estado.'
        : /indispon|inválido/i.test(error.message) ? 'Um dos produtos mudou. Atualize a página e confira a sacola.'
        : 'Não foi possível registrar agora. Confira sua internet e tente de novo.';
      $('formErr').textContent = m; $('formErr').hidden = false;
      return;
    }
    const primeiro = nome.split(' ')[0];
    sacola = []; salvar();
    try { sessionStorage.removeItem(DADOS_KEY); } catch {}
    etapa = 'sucesso';
    $('drawerTitle').textContent = 'Tudo certo';
    $('drawerBody').innerHTML = `<div class="success">
      <div class="check"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h3>Você está na lista de espera, ${esc(primeiro)}.</h3>
      <p>Recebemos o seu interesse. Assim que ${prazoValido ? 'a lista fechar, em ' + esc(dataPrazo()) + ',' : 'reunirmos os pedidos,'} organizaremos a produção e entraremos em contato pelo WhatsApp com o valor final${recebimento === 'envio' ? ' e o frete' : ''}.</p>
      <p>Nenhum pagamento foi feito.</p>
      <span class="code">PEDIDO Nº ${esc(data?.codigo)}</span>
    </div>`;
    $('drawerFoot').innerHTML = `<button class="btn ghost block" data-close="drawer">Voltar para a coleção</button>`;
  }

  atualizarContador();
  carregar();
})();
