(() => {
  const C = window.LOJA_CONFIG;
  // storageKey próprio pra não misturar com a sessão do CRM
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { storageKey: 'ra-collection-admin' } });
  const $ = (id) => document.getElementById(id);
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBR = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fone = (w) => { const d = String(w).replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : w; };
  const STATUS = { novo: 'Novo', contatado: 'Contatado', confirmado: 'Confirmado', encomendado: 'Encomendado', entregue: 'Entregue', cancelado: 'Cancelado' };

  Object.entries(STATUS).forEach(([k, v]) => $('fStatus').insertAdjacentHTML('beforeend', `<option value="${k}">${v}</option>`));

  let pedidos = [];
  let produtos = [];

  // ---------- Toast ----------
  let tt;
  function toast(msg) { const t = $('toast'); t.innerHTML = `<span>${esc(msg)}</span>`; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3000); }

  // ---------- Autenticação ----------
  function mostrar(view) {
    $('loginView').hidden = view !== 'login';
    $('noAccess').hidden = view !== 'sem';
    $('app').hidden = view !== 'app';
    $('headActions').hidden = view === 'login';
  }
  async function iniciar() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return mostrar('login');
    $('who').textContent = session.user.email;
    const { data: ok } = await sb.rpc('loja_is_admin');
    if (!ok) return mostrar('sem');
    mostrar('app');
    carregarPedidos();
    carregarProdutos();
  }
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginBtn').disabled = true; $('loginErr').hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: $('lEmail').value.trim(), password: $('lSenha').value });
    $('loginBtn').disabled = false;
    if (error) { $('loginErr').textContent = 'E-mail ou senha incorretos.'; $('loginErr').hidden = false; return; }
    $('lSenha').value = '';
    iniciar();
  });
  const sair = async () => { await sb.auth.signOut(); mostrar('login'); };
  $('sair').onclick = sair; $('sair2').onclick = sair;

  // ---------- Abas ----------
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t === b ? 'true' : 'false'));
    document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== b.dataset.tab; });
    if (b.dataset.tab === 'encomenda') carregarConsolidado();
  });

  // ---------- Pedidos ----------
  async function carregarPedidos() {
    const { data, error } = await sb.from('loja_pedidos')
      .select('id,codigo,nome,whatsapp,email,total_estimado,status,observacao_admin,criado_em,loja_pedido_itens(produto_nome,tamanho,quantidade,preco_unitario,subtotal)')
      .order('criado_em', { ascending: false }).limit(1000);
    if (error) { $('lista').innerHTML = `<p class="empty">Erro ao carregar: ${esc(error.message)}</p>`; return; }
    pedidos = data;
    renderKpis(); renderLista();
  }
  function filtrados() {
    const q = $('busca').value.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    const st = $('fStatus').value;
    return pedidos.filter((p) => {
      if (st === 'ativos' && p.status === 'cancelado') return false;
      if (st && st !== 'ativos' && p.status !== st) return false;
      if (!q) return true;
      return p.nome.toLowerCase().includes(q) || (qd && p.whatsapp.includes(qd)) || String(p.codigo) === q || (p.email || '').toLowerCase().includes(q);
    });
  }
  function renderKpis() {
    const at = pedidos.filter((p) => p.status !== 'cancelado');
    const pecas = at.reduce((s, p) => s + p.loja_pedido_itens.reduce((a, i) => a + i.quantidade, 0), 0);
    const valor = at.reduce((s, p) => s + Number(p.total_estimado), 0);
    const novos = pedidos.filter((p) => p.status === 'novo').length;
    $('kpis').innerHTML = [
      ['Pedidos ativos', at.length], ['Novos sem contato', novos], ['Peças na lista', pecas], ['Valor estimado', brl(valor)]
    ].map(([l, v]) => `<div class="kpi"><span>${l}</span><strong>${v}</strong></div>`).join('');
  }
  function renderLista() {
    const l = filtrados();
    if (!l.length) { $('lista').innerHTML = `<p class="empty">${pedidos.length ? 'Nenhum pedido com esse filtro.' : 'Ainda não chegou nenhum pedido.'}</p>`; return; }
    $('lista').innerHTML = l.map((p) => {
      const itens = p.loja_pedido_itens;
      const pecas = itens.reduce((a, i) => a + i.quantidade, 0);
      const primeiro = esc(p.nome.split(' ')[0]);
      const msg = encodeURIComponent(`Olá, ${p.nome.split(' ')[0]}! Aqui é da RA Nutrição, sobre o seu pedido nº ${p.codigo} da Collection.`);
      return `<details class="order" data-id="${p.id}">
        <summary>
          <span class="num">Nº ${p.codigo}</span>
          <span class="who"><strong>${esc(p.nome)}</strong><small>${pecas} ${pecas === 1 ? 'peça' : 'peças'}</small></span>
          <span class="when">${dataBR(p.criado_em)}</span>
          <span class="tot">${brl(p.total_estimado)}</span>
          <span><span class="pill ${p.status}">${STATUS[p.status]}</span></span>
        </summary>
        <div class="order-body">
          <div>
            <table class="items"><thead><tr><th>Produto</th><th>Tam.</th><th>Qtd</th><th>Subtotal</th></tr></thead><tbody>
              ${itens.map((i) => `<tr><td>${esc(i.produto_nome)}</td><td>${esc(i.tamanho || 'Único')}</td><td>${i.quantidade}</td><td>${brl(i.subtotal)}</td></tr>`).join('')}
              <tr><td colspan="3"><strong>Total estimado</strong></td><td><strong>${brl(p.total_estimado)}</strong></td></tr>
            </tbody></table>
          </div>
          <div class="side">
            <div class="contact">
              <a href="https://wa.me/${esc(p.whatsapp)}?text=${msg}" target="_blank" rel="noopener">WhatsApp: ${esc(fone(p.whatsapp))} ↗</a><br>
              ${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '<span style="color:var(--muted);font-size:13px">Sem e-mail</span>'}
            </div>
            <label>Status</label>
            <select class="sel" data-f="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <label>Observação interna</label>
            <textarea class="inp" data-f="obs" placeholder="Ex.: confirmou por WhatsApp, prefere retirar no consultório">${esc(p.observacao_admin)}</textarea>
            <button class="danger" data-f="del">Excluir pedido de ${primeiro}</button>
          </div>
        </div>
      </details>`;
    }).join('');
  }
  $('busca').addEventListener('input', renderLista);
  $('fStatus').addEventListener('change', renderLista);
  $('recarregar').onclick = () => { carregarPedidos(); toast('Pedidos atualizados'); };

  $('lista').addEventListener('change', async (e) => {
    const card = e.target.closest('.order'); if (!card) return;
    const p = pedidos.find((x) => x.id === card.dataset.id);
    if (e.target.dataset.f === 'status') {
      const { error } = await sb.from('loja_pedidos').update({ status: e.target.value }).eq('id', p.id);
      if (error) return toast('Erro ao salvar status');
      p.status = e.target.value;
      card.querySelector('.pill').className = `pill ${p.status}`;
      card.querySelector('.pill').textContent = STATUS[p.status];
      renderKpis(); toast('Status salvo');
    }
    if (e.target.dataset.f === 'obs') {
      const { error } = await sb.from('loja_pedidos').update({ observacao_admin: e.target.value }).eq('id', p.id);
      if (error) return toast('Erro ao salvar observação');
      p.observacao_admin = e.target.value; toast('Observação salva');
    }
  });
  $('lista').addEventListener('click', async (e) => {
    if (e.target.dataset.f !== 'del') return;
    const card = e.target.closest('.order');
    const p = pedidos.find((x) => x.id === card.dataset.id);
    if (!confirm(`Excluir de vez o pedido nº ${p.codigo} de ${p.nome}? Isso não pode ser desfeito. Se a pessoa só desistiu, prefira o status "Cancelado".`)) return;
    const { error } = await sb.from('loja_pedidos').delete().eq('id', p.id);
    if (error) return toast('Erro ao excluir');
    pedidos = pedidos.filter((x) => x.id !== p.id);
    renderKpis(); renderLista(); toast('Pedido excluído');
  });

  // ---------- CSV ----------
  function baixarCSV(nome, linhas) {
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const num = (v) => Number(v).toFixed(2).replace('.', ',');
  $('csvPedidos').onclick = () => {
    const linhas = [['Pedido', 'Data', 'Nome', 'WhatsApp', 'E-mail', 'Status', 'Produto', 'Tamanho', 'Quantidade', 'Preço unitário', 'Subtotal', 'Total do pedido', 'Observação']];
    filtrados().forEach((p) => p.loja_pedido_itens.forEach((i) => linhas.push([p.codigo, dataBR(p.criado_em), p.nome, fone(p.whatsapp), p.email, STATUS[p.status], i.produto_nome, i.tamanho || 'Único', i.quantidade, num(i.preco_unitario), num(i.subtotal), num(p.total_estimado), p.observacao_admin])));
    baixarCSV(`pedidos-ra-collection-${new Date().toISOString().slice(0, 10)}.csv`, linhas);
  };

  // ---------- Encomenda coletiva ----------
  const ORDEM_TAM = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único'];
  let consolidado = [];
  async function carregarConsolidado() {
    $('consolidado').innerHTML = '<p class="loading">Calculando...</p>';
    const { data, error } = await sb.from('loja_consolidado').select('*');
    if (error) { $('consolidado').innerHTML = `<p class="empty">Erro: ${esc(error.message)}</p>`; return; }
    const pos = (t) => { const i = ORDEM_TAM.indexOf(t); return i < 0 ? 99 : i; };
    consolidado = data.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, 'pt-BR') || pos(a.tamanho) - pos(b.tamanho));
    if (!consolidado.length) { $('consolidado').innerHTML = '<p class="empty">Nada para encomendar ainda.</p>'; return; }
    let html = '<table class="cons"><thead><tr><th>Produto</th><th>Tamanho</th><th class="n">Quantidade</th><th class="n">Pedidos</th><th class="n">Valor estimado</th></tr></thead><tbody>';
    const grupos = {};
    consolidado.forEach((r) => (grupos[r.produto_nome] ||= []).push(r));
    let totQ = 0, totV = 0;
    Object.entries(grupos).forEach(([nome, rs]) => {
      const q = rs.reduce((s, r) => s + r.quantidade, 0), v = rs.reduce((s, r) => s + Number(r.valor_estimado), 0);
      totQ += q; totV += v;
      html += `<tr class="grp"><td>${esc(nome)}</td><td></td><td class="n">${q}</td><td></td><td class="n">${brl(v)}</td></tr>`;
      if (rs.length > 1 || rs[0].tamanho !== 'Único') rs.forEach((r) => { html += `<tr><td></td><td>${esc(r.tamanho)}</td><td class="n">${r.quantidade}</td><td class="n">${r.pedidos}</td><td class="n">${brl(r.valor_estimado)}</td></tr>`; });
    });
    html += `<tr class="grp"><td>Total</td><td></td><td class="n">${totQ}</td><td></td><td class="n">${brl(totV)}</td></tr></tbody></table>`;
    $('consolidado').innerHTML = html;
  }
  $('csvEncomenda').onclick = () => {
    const linhas = [['Produto', 'Tamanho', 'Quantidade', 'Pedidos', 'Valor estimado']];
    consolidado.forEach((r) => linhas.push([r.produto_nome, r.tamanho, r.quantidade, r.pedidos, num(r.valor_estimado)]));
    baixarCSV(`encomenda-ra-collection-${new Date().toISOString().slice(0, 10)}.csv`, linhas);
  };

  // ---------- Produtos ----------
  async function carregarProdutos() {
    const { data, error } = await sb.from('loja_produtos').select('*').order('ordem').order('nome');
    if (error) { $('prods').innerHTML = `<p class="empty">Erro: ${esc(error.message)}</p>`; return; }
    produtos = data; renderProdutos();
  }
  function renderProdutos() {
    $('prods').innerHTML = produtos.map((p) => `
      <form class="prod ${p.ativo ? '' : 'off'}" data-id="${p.id}">
        <div>
          <div class="prod-photo">${p.foto_url ? `<img src="${esc(p.foto_url)}" alt="">` : '<div class="ph"><div><span>RA</span>Sem foto</div></div>'}</div>
          <label class="upload">${p.foto_url ? 'Trocar foto' : 'Enviar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" data-f="foto"></label>
        </div>
        <div class="prod-fields">
          <div><label>Nome</label><input class="inp" name="nome" value="${esc(p.nome)}" required maxlength="120"></div>
          <div><label>Preço (R$)</label><input class="inp" name="preco" inputmode="decimal" value="${Number(p.preco).toFixed(2).replace('.', ',')}"></div>
          <div><label>Ordem</label><input class="inp" name="ordem" type="number" value="${p.ordem}"></div>
          <div class="full"><label>Tamanhos</label><input class="inp" name="tamanhos" value="${esc(p.tamanhos.join(', '))}" placeholder="PP, P, M, G, GG, XG"><p class="hint">Separe por vírgula. Deixe vazio para produto sem tamanho.</p></div>
          <div class="full"><label>Descrição</label><textarea class="inp" name="descricao" maxlength="1200">${esc(p.descricao)}</textarea></div>
          <div class="prod-actions">
            <button class="btn sm" type="submit">Salvar</button>
            <label class="toggle"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Visível na loja</label>
            <span class="saved" data-saved></span>
            <button class="danger" type="button" data-f="del" style="margin:0 0 0 auto">Excluir</button>
          </div>
        </div>
      </form>`).join('');
  }
  $('prods').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, id = f.dataset.id, fd = new FormData(f);
    const preco = Number(String(fd.get('preco')).replace(/\./g, '').replace(',', '.'));
    if (!fd.get('nome').trim() || isNaN(preco) || preco < 0) return toast('Confira nome e preço');
    const tam = String(fd.get('tamanhos')).split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    const upd = { nome: fd.get('nome').trim(), preco, ordem: Number(fd.get('ordem')) || 0, tamanhos: [...new Set(tam)], descricao: fd.get('descricao').trim(), ativo: f.ativo.checked };
    const { error } = await sb.from('loja_produtos').update(upd).eq('id', id);
    if (error) return toast('Erro ao salvar: ' + error.message);
    Object.assign(produtos.find((p) => p.id === id), upd);
    f.classList.toggle('off', !upd.ativo);
    f.querySelector('[data-saved]').textContent = 'Salvo';
    setTimeout(() => { f.querySelector('[data-saved]').textContent = ''; }, 2500);
  });
  $('prods').addEventListener('change', async (e) => {
    if (e.target.dataset.f !== 'foto') return;
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast('Foto acima de 8 MB. Envie uma versão menor.');
    const f = e.target.closest('.prod'), id = f.dataset.id;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${id}/${Date.now()}.${ext}`;
    toast('Enviando foto...');
    const { error } = await sb.storage.from(C.BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) return toast('Erro ao enviar: ' + error.message);
    const url = sb.storage.from(C.BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: e2 } = await sb.from('loja_produtos').update({ foto_url: url }).eq('id', id);
    if (e2) return toast('Foto enviada, mas não salvou no produto');
    produtos.find((p) => p.id === id).foto_url = url;
    renderProdutos(); toast('Foto atualizada');
  });
  $('prods').addEventListener('click', async (e) => {
    if (e.target.dataset.f !== 'del') return;
    const id = e.target.closest('.prod').dataset.id;
    const p = produtos.find((x) => x.id === id);
    if (!confirm(`Excluir "${p.nome}"? Os pedidos antigos continuam com o nome do produto. Se for só tirar da loja, desmarque "Visível na loja".`)) return;
    const { error } = await sb.from('loja_produtos').delete().eq('id', id);
    if (error) return toast('Erro ao excluir');
    produtos = produtos.filter((x) => x.id !== id); renderProdutos(); toast('Produto excluído');
  });
  $('novoProd').onclick = async () => {
    const ordem = produtos.reduce((m, p) => Math.max(m, p.ordem), 0) + 1;
    const { data, error } = await sb.from('loja_produtos').insert({ nome: 'Novo produto', preco: 0, ordem, ativo: false }).select().single();
    if (error) return toast('Erro ao criar');
    produtos.push(data); renderProdutos();
    $('prods').lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Produto criado como oculto. Preencha e marque "Visível na loja".');
  };

  iniciar();
})();
