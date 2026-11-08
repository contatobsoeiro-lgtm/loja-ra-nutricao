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
    document.querySelectorAll('[data-logo]').forEach((el) => { el.innerHTML = `<img src="${esc(u)}" alt="">`; el.hidden = false; });
  });
  seExistir(C.FOTO_RAFAEL, (u) => { $('authorPhoto').innerHTML = `<img src="${esc(u)}" alt="Nutricionista Rafael Albergaria">`; });

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
    return `<div class="ph"><div><span>RA</span>Foto em breve</div></div>`;
  }

  // ---------- Catálogo ----------
  async function carregar() {
    const { data, error } = await sb.from('loja_produtos').select('id,nome,descricao,preco,tamanhos,foto_url,ordem').eq('ativo', true).order('ordem').order('nome');
    if (error) { $('grid').innerHTML = '<p class="empty">Não foi possível carregar a coleção agora. Atualize a página em instantes.</p>'; return; }
    produtos = data.map((p) => ({ ...p, tamanhos: p.tamanhos || [] }));
    sincronizarSacola();
    $('catCount').textContent = `${produtos.length} ${produtos.length === 1 ? 'peça' : 'peças'}`;
    if (!produtos.length) { $('grid').innerHTML = '<p class="empty">A coleção está sendo preparada. Volte em breve.</p>'; return; }
    $('grid').innerHTML = produtos.map((p) => `
      <button class="card" data-id="${p.id}">
        <div class="card-media">${midia(p)}</div>
        <div class="card-info"><span class="card-name">${esc(p.nome)}</span><span class="card-price">${brl(p.preco)}</span></div>
        <p class="card-meta">${p.tamanhos.length ? p.tamanhos.join(' · ') : 'Tamanho único'}</p>
      </button>`).join('');
  }
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
    $('pmMedia').innerHTML = midia(atual);
    $('pmName').textContent = atual.nome;
    $('pmPrice').innerHTML = `${brl(atual.preco)}<small>Valor estimado por unidade</small>`;
    $('pmDesc').textContent = atual.descricao || '';
    $('pmDesc').hidden = !atual.descricao;
    $('pmSizesWrap').hidden = !atual.tamanhos.length;
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
  $('pmMedia').addEventListener('click', () => { if (!atual?.foto_url) return; $('zoom').innerHTML = `<img src="${esc(atual.foto_url)}" alt="${esc(atual.nome)}">`; $('zoom').classList.add('open'); });
  $('zoom').addEventListener('click', () => $('zoom').classList.remove('open'));
  $('pmAdd').addEventListener('click', () => {
    if (atual.tamanhos.length && !tamanho) { $('pmSizeHint').textContent = 'Escolha um tamanho para continuar.'; return; }
    adicionar(atual, tamanho, qtd);
    fechar('pm');
    toast(`${atual.nome}${tamanho ? ' · ' + tamanho : ''} adicionado à sacola`, 'Ver sacola', abrirSacola);
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
            <div class="li-top"><span class="li-name">${esc(p.nome)}</span><span class="li-sub">${brl(i.quantidade * p.preco)}</span></div>
            <p class="li-meta">${i.tamanho ? 'Tamanho ' + esc(i.tamanho) + ' · ' : ''}${brl(p.preco)} cada</p>
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
        <button class="btn block" id="toDados">Continuar</button>
        <button class="btn ghost block" data-close="drawer" style="margin-top:10px">Continuar escolhendo</button>`;
      $('toDados').onclick = () => { etapa = 'dados'; renderSacola(); $('drawerBody').scrollTop = 0; };
    } else if (etapa === 'dados') {
      $('drawerTitle').textContent = 'Lista de espera';
      const salvo = lerDados();
      body.innerHTML = `
        <button class="back" id="voltar">← Voltar para a sacola</button>
        <h3 class="form-title">Confira seus produtos</h3>
        <div class="review">
          ${sacola.map((i) => { const p = prod(i.produto_id); return `<div class="review-row"><span>${i.quantidade}× ${esc(p.nome)}${i.tamanho ? ' · ' + esc(i.tamanho) : ''}</span><span>${brl(i.quantidade * p.preco)}</span></div>`; }).join('')}
          <div class="review-total"><span>Total estimado</span><span>${brl(totalSacola())}</span></div>
        </div>
        <h3 class="form-title">Seus dados</h3>
        <p class="form-lead">Usamos só para falar com você sobre esta encomenda.</p>
        <form id="form" novalidate>
          <div class="field"><label for="fNome">Nome completo</label><input id="fNome" name="nome" autocomplete="name" required maxlength="120" value="${esc(salvo.nome)}"><p class="err" id="eNome"></p></div>
          <div class="field"><label for="fWhats">WhatsApp com DDD</label><input id="fWhats" name="whatsapp" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="(27) 99999-9999" required value="${esc(salvo.whatsapp)}"><p class="err" id="eWhats"></p></div>
          <div class="field"><label for="fEmail">E-mail <em>(opcional)</em></label><input id="fEmail" name="email" type="email" autocomplete="email" maxlength="160" value="${esc(salvo.email)}"><p class="err" id="eEmail"></p></div>
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
    try { sessionStorage.setItem(DADOS_KEY, JSON.stringify({ nome: $('fNome')?.value || '', whatsapp: $('fWhats')?.value || '', email: $('fEmail')?.value || '' })); } catch {}
  }
  function mascara(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  function erro(campo, msg) {
    const map = { nome: ['fNome', 'eNome'], whats: ['fWhats', 'eWhats'], email: ['fEmail', 'eEmail'], consent: ['fConsent', 'eConsent'] };
    const [inp, er] = map[campo];
    $(er).textContent = msg || '';
    if (campo !== 'consent') $(inp).setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !!msg;
  }

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
    ruim = erro('consent', !$('fConsent').checked ? 'Marque a autorização para continuar.' : '') || ruim;
    if (ruim) { document.querySelector('[aria-invalid="true"]')?.focus(); return; }
    if ($('fHp').value) return; // robô

    enviando = true;
    const btn = $('confirmar'); btn.disabled = true; btn.textContent = 'Registrando seu interesse...';
    $('formErr').hidden = true;
    guardarDados();
    const { data, error } = await sb.rpc('loja_criar_pedido', {
      p_nome: nome, p_whatsapp: whats, p_email: email || null, p_consentimento: true,
      p_itens: sacola.map((i) => ({ produto_id: i.produto_id, tamanho: i.tamanho, quantidade: i.quantidade }))
    });
    enviando = false;
    if (error) {
      btn.disabled = false; btn.textContent = 'Confirmar interesse e entrar na lista de espera';
      const m = /aguarde/i.test(error.message) ? 'Seu pedido já foi recebido. Se quiser enviar outro, aguarde alguns segundos.'
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
      <p>Recebemos o seu interesse. Assim que reunirmos os pedidos, organizaremos a produção e entraremos em contato pelo WhatsApp.</p>
      <p>Nenhum pagamento foi feito.</p>
      <span class="code">PEDIDO Nº ${esc(data?.codigo)}</span>
    </div>`;
    $('drawerFoot').innerHTML = `<button class="btn ghost block" data-close="drawer">Voltar para a coleção</button>`;
  }

  atualizarContador();
  carregar();
})();
