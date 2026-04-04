    // =========================================
    // CONFIGURAÇÕES GLOBAIS - SUPABASE
    // =========================================
    const SUPABASE_URL = "https://ddqqtzwaxsgkbrnfjikv.supabase.co"; 
    const SUPABASE_KEY = "sb_publishable__-43znJ2AImyNshY5nsTvA_Q5JUvFUV"; 
    const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const BARBEARIA_ID = "817597d5-9a4b-4c6a-ab3b-9969a2d3999d"; 

    // Variáveis de Estado
    let idAgendamentoSelecionado = null; 
    let horarioSelecionado = "";
    let servicosSelecionados = [];
    let barbeiroSelecionadoId = null;
    let nomeBarbeiroSelecionado = "";
    let idParaCancelar = null;
    let estaProcessando = false;

    // 1. Inicialização
    window.addEventListener('DOMContentLoaded', () => {
        configurarCalendario();
        carregarServicos();
        aplicarMascaraTelefone('telCliente');   
        aplicarMascaraTelefone('whatsConsulta');
        carregarDadosDoCache();
    });

    // =========================================
    // CAMADA DE PERSISTÊNCIA (CACHE LOCAL)
    // =========================================
    function salvarDadosNoCache(nome, whatsapp, nascimento) {
        const dados = { nome, whatsapp, nascimento };
        localStorage.setItem('dados_cliente_barbearia', JSON.stringify(dados));
    }

    function carregarDadosDoCache() {
        const dadosSalvos = localStorage.getItem('dados_cliente_barbearia');
        if (dadosSalvos) {
            try {
                const { nome, whatsapp, nascimento } = JSON.parse(dadosSalvos);
                if (document.getElementById('nomeCliente')) document.getElementById('nomeCliente').value = nome;
                if (document.getElementById('telCliente')) document.getElementById('telCliente').value = whatsapp;
                if (document.getElementById('nascCliente')) document.getElementById('nascCliente').value = nascimento;
                if (document.getElementById('whatsConsulta')) document.getElementById('whatsConsulta').value = whatsapp;
                if (document.getElementById('nascConsulta')) document.getElementById('nascConsulta').value = nascimento;
            } catch (e) {
                console.error("Erro ao ler cache", e);
            }
        }
    }

    // =========================================
    // SEGURANÇA E UTILITÁRIOS
    // =========================================
    function sanitizar(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML.trim();
    }

    function aplicarMascaraTelefone(id) {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, "");
            if (v.length > 11) v = v.slice(0, 11);
            v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
            v = v.replace(/(\d{5})(\d)/, "$1-$2");
            e.target.value = v;
        });
    }

   function configurarCalendario() {
    const inputData = document.getElementById('dataCliente');
    if (!inputData) return;
    
    const hoje = new Date();
    // Ajuste para fuso horário local ao converter para ISO
    const offset = hoje.getTimezoneOffset();
    const dataLocal = new Date(hoje.getTime() - (offset * 60 * 1000));
    const dataIso = dataLocal.toISOString().split('T')[0];
    
    inputData.setAttribute('min', dataIso);
    inputData.value = dataIso;
    
    // Mostra os barbeiros assim que o calendário é definido
    mostrarBarbeirosDisponiveis(); 
}

    // =========================================
    // LÓGICA DE SERVIÇOS E PREÇOS
    // =========================================
  async function carregarServicos() {
    const containerServicos = document.getElementById('containerServicos');
    if (!containerServicos) return;

    try {
        // Buscamos TODOS os serviços vinculados à sua BARBEARIA_ID
        // Certifique-se de que sua tabela 'servicos' tenha a coluna 'barbearia_id'
        const { data, error } = await _supabase
            .from('servicos')
            .select('*')
            .eq('barbearia_id', BARBEARIA_ID); 

        if (error) throw error;

        containerServicos.innerHTML = ""; 

        if (data && data.length > 0) {
            data.forEach(servico => {
                const div = document.createElement('div');
                div.className = "servico-item";
                div.innerHTML = `
                    <label class="checkbox-container">
                        <input type="checkbox" data-nome="${servico.nome}" data-preco="${servico.preco}" onchange="atualizarPreco()">
                        <span class="checkmark"></span>
                        <div class="servico-info">
                            <span class="servico-nome">${servico.nome}</span>
                            <span class="servico-preco">R$ ${servico.preco.toFixed(2).replace('.', ',')}</span>
                        </div>
                    </label>
                `;
                containerServicos.appendChild(div);
            });
        } else {
            containerServicos.innerHTML = "<p>Nenhum serviço disponível.</p>";
        }
    } catch (err) {
        console.error("Erro ao carregar serviços:", err);
    }
}

    function atualizarPreco() {
        servicosSelecionados = [];
        let total = 0;
        const checkboxes = document.querySelectorAll('#containerServicos input[type="checkbox"]:checked');
        
        checkboxes.forEach(cb => {
            const nome = cb.getAttribute('data-nome');
            const preco = parseFloat(cb.getAttribute('data-preco'));
            servicosSelecionados.push({ nome, preco });
            total += preco;
        });

        // Se o usuário mudar o serviço após selecionar o barbeiro, atualiza a lista de horários
        if (barbeiroSelecionadoId) {
            buscarHorarios(barbeiroSelecionadoId, nomeBarbeiroSelecionado);
        }
    }

    function obterTotalFormatado() {
        const total = servicosSelecionados.reduce((acc, s) => acc + s.preco, 0);
        return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // =========================================
    // LÓGICA DE BARBEIROS E HORÁRIOS
    // =========================================
    async function mostrarBarbeirosDisponiveis() {
        const secaoBarbeiros = document.getElementById('secaoBarbeiros');
        const container = document.querySelector('#secaoBarbeiros .container-barbeiros-flex');
        
        if (!secaoBarbeiros || !container) {
            console.error("Elementos de barbeiros não encontrados no HTML.");
            return;
        }

        secaoBarbeiros.classList.remove('hidden');
        container.innerHTML = "<p style='color: var(--text-muted);'>Buscando profissionais...</p>";

        try {
            const { data: barbeiros, error } = await _supabase
                .from('barbeiros')
                .select('id, nome, foto_url, ativo')
                .eq('barbearia_id', BARBEARIA_ID)
                .eq('ativo', true);

            if (error) throw error;

            if (!barbeiros || barbeiros.length === 0) {
                container.innerHTML = "<p>Nenhum barbeiro disponível no momento.</p>";
                return;
            }

            container.innerHTML = "";

            barbeiros.forEach(b => {
                const fotoFinal = (b.foto_url && b.foto_url.trim() !== "") 
                    ? b.foto_url 
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(b.nome)}&background=random&color=fff`;
                
                const card = document.createElement('div');
                card.className = "card-barbeiro-cliente";
                
                card.innerHTML = `
                    <img src="${fotoFinal}" 
                        class="avatar-cliente" 
                        alt="${b.nome}" 
                        onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(b.nome)}'">
                    <span class="nome-barbeiro-label">${b.nome.split(' ')[0]}</span>
                `;
                
                card.onclick = () => {
                    // Remove seleção de todos e adiciona no clicado
                    document.querySelectorAll('.card-barbeiro-cliente').forEach(c => c.classList.remove('selecionado'));
                    card.classList.add('selecionado');
                    
                    // Atualiza o estado global
                    barbeiroSelecionadoId = b.id;
                    nomeBarbeiroSelecionado = b.nome;
                    
                    // Chama a busca de horários (garanta que essa função exista no seu script.js)
                    if (typeof buscarHorarios === "function") {
                        buscarHorarios(b.id, b.nome);
                    } else {
                        console.error("Função buscarHorarios não encontrada.");
                    }
                };
                
                container.appendChild(card);
            });

        } catch (err) {
            console.error("Erro ao carregar barbeiros:", err);
            container.innerHTML = "<p style='color: var(--danger);'>Erro ao carregar barbeiros.</p>";
        }
    }

   async function buscarHorarios(barbeiroId, nomeBarbeiro) {
    const listaDiv = document.getElementById('listaHorarios');
    const secaoHorarios = document.getElementById('secaoHorarios');
    const dataInput = document.getElementById('dataCliente').value;
    
    if (servicosSelecionados.length === 0) {
        alert("Por favor, selecione ao menos um serviço primeiro.");
        return;
    }

    secaoHorarios.classList.remove('hidden');
    listaDiv.innerHTML = "<p>Buscando vagas...</p>";

    // --- LÓGICA DE FILTRO DE HORÁRIO ATUAL ---
    const agora = new Date();
    // Obtém a data de hoje no formato YYYY-MM-DD (usando fuso local)
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    const dataHoje = `${ano}-${mes}-${dia}`;
    
    // Obtém a hora atual no formato HH:MM:SS
    const horaAtual = agora.toTimeString().split(' ')[0]; 

    try {
        let query = _supabase
            .from('agendamentos')
            .select('id, horario')
            .eq('barbearia_id', BARBEARIA_ID)
            .eq('barbeiro_id', barbeiroId)
            .eq('data', dataInput)
            .eq('status', 'disponivel');

        // Se a data selecionada for HOJE, filtra para não mostrar horários que já passaram
        if (dataInput === dataHoje) {
            query = query.gt('horario', horaAtual);
        }

        const { data: horarios, error } = await query;

        if (error) throw error;

        // Ordenação manual dos horários
        horarios.sort((a, b) => a.horario.localeCompare(b.horario));

        if (horarios.length === 0) {
            listaDiv.innerHTML = `<p style="grid-column: 1/-1; text-align:center;">Não há mais vagas disponíveis para ${nomeBarbeiro} nesta data.</p>`;
        } else {
            listaDiv.innerHTML = horarios.map(h => `
                <button class="btn-hora" onclick="abrirConfirmacao('${h.horario.substring(0,5)}', '${h.id}')">
                    ${h.horario.substring(0,5)}
                </button>
            `).join('');
        }
    } catch (e) {
        console.error("Erro ao buscar horários:", e);
        listaDiv.innerHTML = "<p>Erro ao carregar horários.</p>";
    }
}
    function abrirConfirmacao(horario, id) {
        idAgendamentoSelecionado = id;
        horarioSelecionado = horario;
        
        const listaNomes = servicosSelecionados.map(s => s.nome).join(', ');
        
        document.getElementById('resumo').innerHTML = `
            <div style="text-align:left; background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; color: white;">
                <p>💈 <b>Barbeiro:</b> ${nomeBarbeiroSelecionado}</p>
                <p>✂️ <b>Serviços:</b> ${listaNomes}</p>
                <p>⏰ <b>Horário:</b> ${horario}</p>
                <p style="color:var(--primary); font-size:1.1rem; margin-top:10px;"><b>💰 Total: ${obterTotalFormatado()}</b></p>
            </div>
        `;
        document.getElementById('modalConfirmacao').classList.remove('hidden');
    }

    // =========================================
    // FINALIZAÇÃO E CANCELAMENTO
    // =========================================
    async function confirmarAgendamento() {
        if (estaProcessando) return;

        const nome = sanitizar(document.getElementById('nomeCliente').value);
        const whatsapp = document.getElementById('telCliente').value.replace(/\D/g, '');
        const nascimento = document.getElementById('nascCliente').value;

        if (!nome || whatsapp.length < 10 || !nascimento) {
            return alert("Preencha todos os campos corretamente.");
        }

        const btn = document.getElementById('btnFinalizar');
        btn.innerText = "🔒 Reservando...";
        btn.disabled = true;
        estaProcessando = true;

        try {
            const totalNumerico = servicosSelecionados.reduce((acc, s) => acc + s.preco, 0);
            const servicosTexto = servicosSelecionados.map(s => s.nome).join(' + ');
            
            const { data: sucesso, error } = await _supabase.rpc('realizar_agendamento_blindado', {
                vaga_id: idAgendamentoSelecionado,
                nome_cliente: nome,
                whats_cliente: whatsapp,
                nasc_cliente: nascimento,
                servicos_texto: servicosTexto,
                valor_total: totalNumerico
            });

            if (error) throw error;

            if (!sucesso) {
                alert("⚠️ Este horário foi preenchido agora mesmo. Escolha outro.");
                fecharModal();
                buscarHorarios(barbeiroSelecionadoId, nomeBarbeiroSelecionado);
                return;
            }

            salvarDadosNoCache(nome, whatsapp, nascimento);
            fecharModal();
            mostrarSucesso("Agendado!", "Te esperamos na barbearia!");
            buscarHorarios(barbeiroSelecionadoId, nomeBarbeiroSelecionado);
            
        } catch (e) {
            alert("Falha ao conectar com o servidor.");
        } finally {
            btn.innerText = "Confirmar Agendamento";
            btn.disabled = false;
            estaProcessando = false;
        }
    }

async function consultarHistoricoCliente() {
    const whats = document.getElementById('whatsConsulta').value.replace(/\D/g, '');
    const nasc = document.getElementById('nascConsulta').value;
    const corpo = document.getElementById('corpoHistorico');
    const resumo = document.getElementById('resumoCliente');

    if (whats.length < 10 || !nasc) return alert("Preencha seus dados.");

    resumo.innerHTML = "🔍 Buscando seu histórico...";
    try {
        const { data: filtrados, error } = await _supabase
            .from('agendamentos')
            .select('*, barbeiros(nome)') // Busca o nome na tabela de barbeiros
            .eq('cliente_whatsapp', whats) 
            .eq('nascimento', nasc)
            .eq('barbearia_id', BARBEARIA_ID)
            .order('data', { ascending: false });

        if (error) throw error;

        document.getElementById('resultadoConsulta').classList.remove('hidden');
        
        if (filtrados.length === 0) {
            resumo.innerHTML = "Nenhum histórico encontrado.";
            corpo.innerHTML = "";
            return;
        }

        resumo.innerHTML = `Olá, <b>${filtrados[0].cliente_nome}</b>!`;
        
      corpo.innerHTML = filtrados.map(h => {
            const [ano, mes, dia] = h.data.split('-');
            const nomeBarbeiro = h.barbeiros ? h.barbeiros.nome : "Profissional";

            let htmlFotos = '';
            if (Array.isArray(h.foto_corte) && h.foto_corte.length > 0) {
                const fotosValidas = h.foto_corte.filter(url => url && url !== "null");
                htmlFotos = `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px;">
                    ${fotosValidas.map(url => `<img src="${url}" onclick="window.open('${url}','_blank')" style="width: 45px; height: 45px; border-radius: 6px; object-fit: cover; border: 1px solid #eee;">`).join('')}
                </div>`;
            }

            return `
                <tr>
                    <td data-label="📅 Data/Hora">
                        <div style="text-align: right;">
                            <div style="font-weight: bold;">${dia}/${mes}</div>
                            <div style="font-size: 11px; color: #777;">${h.horario.substring(0,5)}</div>
                        </div>
                    </td>

                    <td data-label="✂️ Serviço">
                        <div style="text-align: right;">
                            <div style="font-weight: 600;">${h.servico}</div>
                            ${htmlFotos}
                        </div>
                    </td>

                    <td data-label="💈 Barbeiro">
                        <div style="color: #d4a373; font-weight: 500;">${nomeBarbeiro}</div>
                    </td>

                    <td data-label="💰 Total">
                        <div style="font-weight: bold;">R$ ${h.preco_final ? h.preco_final.toFixed(2).replace('.',',') : '0,00'}</div>
                    </td>

                    <td data-label="📌 Status">
                        <span class="badge-status ${h.status === 'ocupado' ? 'status-azul' : 'status-verde'}">
                            ${h.status}
                        </span>
                    </td>

                    <td data-label="⚙️ Ação">
                        ${h.status === 'ocupado' ? 
                            `<button onclick="abrirModalCancelamento('${h.id}')" class="btn-cancelar-cliente" style="width: 100%; padding: 10px; margin-top: 5px;">Cancelar Agendamento</button>` 
                            : '<span style="color:#ccc;">Sem ações</span>'}
                    </td>
                </tr>`;
        }).join('');
    } catch (e) {
        console.error(e);
        resumo.innerHTML = "Erro ao buscar dados.";
    }
}

    async function confirmarCancelamento() {
        if (estaProcessando) return;
        const btn = document.getElementById('btnConfirmarCancela');
        const whatsConsulta = document.getElementById('whatsConsulta').value.replace(/\D/g, '');
        const nascConsulta = document.getElementById('nascConsulta').value;

        btn.innerText = "Aguarde...";
        btn.disabled = true;
        estaProcessando = true;

        try {
            const { error } = await _supabase
                .from('agendamentos')
                .update({
                    cliente_nome: null,
                    cliente_whatsapp: null,
                    nascimento: null,
                    servico: null,
                    status: 'disponivel',
                    preco_final: null
                })
                .eq('id', idParaCancelar)
                .eq('cliente_whatsapp', whatsConsulta)
                .eq('nascimento', nascConsulta);

            if (error) throw error;

            fecharModalCustom();
            mostrarSucesso("Cancelado!", "A vaga está disponível novamente.");
            consultarHistoricoCliente();
            if (barbeiroSelecionadoId) buscarHorarios(barbeiroSelecionadoId, nomeBarbeiroSelecionado);

        } catch (e) {
            alert("Erro no cancelamento.");
        } finally {
            btn.innerText = "Sim, Cancelar";
            btn.disabled = false;
            estaProcessando = false;
        }
    }

    // Helpers de Interface
    function fecharModal() { document.getElementById('modalConfirmacao').classList.add('hidden'); }
    function fecharModalCustom() { document.getElementById('modalConfirmacaoCustom').classList.add('hidden'); }
    function fecharModalSucesso() { document.getElementById('modalSucesso').classList.add('hidden'); }
    function abrirModalConsulta() { document.getElementById('modalConsulta').classList.remove('hidden'); }
    function fecharModalConsulta() { document.getElementById('modalConsulta').classList.add('hidden'); }
    function abrirModalCancelamento(id) {
        idParaCancelar = id;
        document.getElementById('modalConfirmacaoCustom').classList.remove('hidden');
    }
    function mostrarSucesso(titulo, msg) {
        document.getElementById('tituloSucesso').innerText = titulo;
        document.getElementById('mensagemSucesso').innerText = msg;
        document.getElementById('modalSucesso').classList.remove('hidden');
    }
