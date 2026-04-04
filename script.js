// =========================================
// CONFIGURAÇÕES GLOBAIS - SUPABASE
// =========================================
const SUPABASE_URL = "https://ddqqtzwaxsgkbrnfjikv.supabase.co"; 
const SUPABASE_KEY = "sb_publishable__-43znJ2AImyNshY5nsTvA_Q5JUvFUV"; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BARBEARIA_ID = "817597d5-9a4b-4c6a-ab3b-9969a2d3999d";
const UUID_DONO = "432083b6-5a4a-4d0a-ae1b-0abec9f8195e";

// Elementos da Interface
const form = document.getElementById('scheduleForm');
const formContainer = document.getElementById('form-container');
const btnAbrirForm = document.getElementById('btnAbrirForm');
const btnSalvar = document.getElementById('btnSalvar');
const statusDiv = document.getElementById('status');
const corpoTabela = document.getElementById('corpoTabela');
const inputDataInicio = document.getElementById('dataInicio');
const inputDataFim = document.getElementById('dataFim');
const selectServico = document.getElementById('servico');

let idSendoEditado = null; 
let listaServicosLocal = []; 

// =========================================
// 1. SISTEMA DE AUTENTICAÇÃO (BLINDAGEM)
// =========================================

/**
 * Verifica se existe uma sessão ativa. Se não houver, mantém a tela de login visível.
 */
let barbeiroLogadoId = null;

// Substitua pelo SEU e-mail de administrador
const EMAIL_DONO = "leonardomaiaarruda@gmail.com"; 

async function verificarAcesso() {
    const { data: { session } } = await _supabase.auth.getSession();
    const loginScreen = document.getElementById('login-screen');
    const btnEquipe = document.getElementById('btn-nav-equipe'); 
    const imgPerfil = document.getElementById('imgPerfil'); 

    if (session) {
        const authUser = session.user;
        const emailUsuario = authUser.email;
        
        // 1. Busca o barbeiro para pegar ID e FOTO_URL
    // Note que agora usamos 'foto_url' (com hífen) para bater com o seu banco
        const { data: barbeiros, error: erroBusca } = await _supabase
            .from('barbeiros')
            .select('id, "foto_url"') 
            .eq('email', emailUsuario);

            if (barbeiros && barbeiros.length > 0) {
                const barbeiro = barbeiros[0];
                
                // 1. VÍNCULO DINÂMICO: Ignora IDs fixos e usa o ID real do banco
                barbeiroLogadoId = barbeiro.id;
                
                // 2. PERSISTÊNCIA: Salva o ID real no navegador para o F5 (essencial para funcionários)
                localStorage.setItem('barbeiro_id', barbeiro.id);

                console.log("Login identificado para o ID:", barbeiroLogadoId);

                const imgPerfil = document.getElementById('imgPerfil');
                if (imgPerfil) {
                    // 3. RECUPERAÇÃO DA FOTO: Usa o nome exato da coluna no Supabase ('foto_url')
                    const urlFoto = barbeiro['foto_url'];

                    if (urlFoto) {
                        // O ?t= força o navegador a ignorar o cache e mostrar a foto nova
                        imgPerfil.src = `${urlFoto}?t=${Date.now()}`;
                    } else {
                        // Fallback: Gera uma inicial colorida se o funcionário não tiver foto
                        const iniciais = emailUsuario.split('@')[0];
                        imgPerfil.src = `https://ui-avatars.com/api/?name=${iniciais}&background=random&color=fff`;
                    }
                }

                // 4. LIMPEZA DE SEGURANÇA (Opcional)
                // Se você tiver uma variável chamada UUID_DONO sendo usada em outros lugares,
                // certifique-se de que as funções de agendamento usem 'barbeiroLogadoId' daqui em diante.
                if (typeof carregarAgenda === "function") {
                    carregarAgenda(); 
                }
            } else {
            // 2. Se não existe na tabela, faz o auto-vínculo usando UPSERT
            console.log("Auto-vinculando novo barbeiro...");
            barbeiroLogadoId = authUser.id;

            const { error: errorAuto } = await _supabase
                .from('barbeiros')
                .upsert([{ 
                    id: barbeiroLogadoId, 
                    email: emailUsuario, 
                    nome: emailUsuario.split('@')[0],
                    barbearia_id: BARBEARIA_ID 
                }], { onConflict: 'id' });
            
            if (errorAuto) console.error("Erro no vínculo:", errorAuto.message);
        }

        // Regra do Botão de Equipe (Apenas para o seu e-mail)
        if (btnEquipe) {
            btnEquipe.style.display = (emailUsuario.toLowerCase() === "leonardomaiaarruda@gmail.com") ? "flex" : "none";
        }

        if (loginScreen) loginScreen.style.display = 'none';
        return true;
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
        return false;
    }
}

/** Executa o login com os dados inseridos na interface **/
async function executarLogin() {
    const emailInput = document.getElementById('email');
    const senhaInput = document.getElementById('login-senha');
    const btnLogin = document.querySelector('#login-screen .btn-primario');

    if (!emailInput || !senhaInput) {
        console.error("IDs não encontrados: Verifique se os campos existem no HTML.");
        return;
    }

    const email = emailInput.value.trim();
    const senha = senhaInput.value.trim();

    if (!email || !senha) {
        alert("⚠️ Por favor, preencha e-mail e senha.");
        return;
    }

    if (btnLogin) {
        btnLogin.disabled = true;
        btnLogin.innerText = "⏳ Autenticando...";
    }

    try {
        // 1. Valida e-mail e senha no Supabase Auth
        const { data, error } = await _supabase.auth.signInWithPassword({
            email: email,
            password: senha
        });

        if (error) throw error;

        // 2. BUSCA O STATUS DO BARBEIRO NO BANCO (A "BLINDAGEM")
        // Verificamos se ele está ativo antes de permitir o acesso ao painel
        const { data: perfil, error: perfilError } = await _supabase
            .from('barbeiros')
            .select('ativo')
            .eq('id', data.user.id)
            .single();

        if (perfilError) throw new Error("Erro ao verificar perfil: " + perfilError.message);

        // 3. VERIFICAÇÃO DE BLOQUEIO
        if (perfil && perfil.ativo === false) {
            // Se estiver desativado, fazemos o logout imediato da sessão que acabou de abrir
            await _supabase.auth.signOut();
            throw new Error("Sua conta está desativada. Entre em contato com o administrador.");
        }

        // 4. Sucesso: Se passou por tudo, recarrega para entrar
        window.location.reload();

    } catch (err) {
        console.error("Erro no login:", err.message);
        
        // Mensagem personalizada caso seja bloqueio ou erro de senha
        const msgErro = err.message.includes("desativada") 
            ? err.message 
            : "❌ Usuário ou senha incorretos.";
            
        alert(msgErro);
        
        if (btnLogin) {
            btnLogin.disabled = false;
            btnLogin.innerText = "Entrar no Painel";
        }
    }
}

/**
 * Finaliza a sessão do administrador
 */
async function fazerLogout() {
    try {
        // 1. Desloga da sessão do Supabase (Auth)
        await _supabase.auth.signOut();

        // 2. LIMPA O CACHE LOCAL (Essencial para a foto não "assombrar" o próximo login)
        localStorage.removeItem('barbeiro_id');
        
        // Opcional: Limpar tudo se você não quiser resquícios de outros dados
        // localStorage.clear(); 

        // 3. Recarrega a página para voltar à tela de login
        location.reload();
        
    } catch (error) {
        console.error("Erro ao sair:", error);
        // Mesmo com erro no signOut, forçamos o reload para segurança
        location.reload();
    }
}
// =========================================
// 2. INICIALIZAÇÃO UNIFICADA
// =========================================

window.addEventListener('DOMContentLoaded', async () => {
    const logado = await verificarAcesso();
    
    if (logado) {
        configurarCalendario();
        listarHorarios();     
        carregarServicosBD(); 
    }
});

function configurarCalendario() {
    const inputData = document.getElementById('dataCliente');
    if (!inputData) return;
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    
    const dataFormatada = `${ano}-${mes}-${dia}`;
    inputData.setAttribute('min', dataFormatada);
    inputData.value = dataFormatada;
}

// ==========================================
// NAVEGAÇÃO ENTRE TELAS
// ==========================================

function mudarTela(tela) {
    document.querySelectorAll('.tela-content').forEach(t => t.classList.add('hidden'));
    const telaAtiva = document.getElementById(`tela-${tela}`);
    if (telaAtiva) telaAtiva.classList.remove('hidden');

    document.querySelectorAll('.nav-mobile-item, .nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // IDs de navegação desktop e mobile do seu index.html
    const btnMobile = document.getElementById(`btn-nav-${tela}`);
    if (btnMobile) btnMobile.classList.add('active');
    
    const btnDesk = document.getElementById(`btn-nav-${tela}-desk`);
    if (btnDesk) btnDesk.classList.add('active');

    if (tela === 'agenda') listarAgendaClientes();
    if (tela === 'gerar') listarHorarios();
}


async function listarHorarios() {
    const corpoTabela = document.getElementById('corpoTabela');
    const filtroData = document.getElementById('filtroDataAdm');
    
    if (!corpoTabela) return;

    let dataParaFiltrar = filtroData ? filtroData.value : "";
    
    if (!dataParaFiltrar) {
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        dataParaFiltrar = `${ano}-${mes}-${dia}`;
        if (filtroData) filtroData.value = dataParaFiltrar;
    }

    corpoTabela.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">⌛ Carregando grade...</td></tr>';

    try {
        const { data: agendamentos, error } = await _supabase
            .from('agendamentos')
            .select('*')
            .eq('barbeiro_id', barbeiroLogadoId) 
            .eq('data', dataParaFiltrar)
            .order('horario', { ascending: true });

        if (error) throw error;

        if (!agendamentos || agendamentos.length === 0) {
            corpoTabela.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:40px; color:#888;">Nenhuma vaga para este dia.</td></tr>`;
            return;
        }

        corpoTabela.innerHTML = '';

        agendamentos.forEach(vaga => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #eee";
            
            const statusCor = vaga.status === 'disponivel' ? '#2dce89' : '#f5365c';
            const statusTexto = vaga.status === 'disponivel' ? 'Livre' : (vaga.cliente_nome || 'Ocupado');

            tr.innerHTML = `
                <td style="padding: 12px; font-weight: 700; color: #333;">
                    ${vaga.horario.substring(0, 5)}
                </td>
                <td style="padding: 12px;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 11px; font-weight: 700; color: ${statusCor};">
                            ● ${vaga.status === 'disponivel' ? 'DISPONÍVEL' : 'RESERVADO'}
                        </span>
                        <span style="font-size: 13px; color: #555;">
                            ${vaga.status === 'disponivel' ? 'Vaga aberta' : statusTexto}
                        </span>
                    </div>
                </td>
                <td style="padding: 12px; text-align: right; white-space: nowrap;">
                    <button onclick="editarVaga('${vaga.id}')" style="background: #f0f0f0; border: none; padding: 10px; border-radius: 8px; cursor: pointer; margin-right: 5px;">✏️</button>
                    <button onclick="excluirVaga('${vaga.id}')" style="background: #fff0f0; border: none; padding: 10px; border-radius: 8px; cursor: pointer;">🗑️</button>
                </td>
            `;
            corpoTabela.appendChild(tr);
        });

        const statVagas = document.getElementById('stat-vagas');
        if (statVagas) statVagas.innerText = agendamentos.length;

    } catch (err) {
        console.error(err);
        corpoTabela.innerHTML = '<tr><td colspan="3" style="color:red; text-align:center;">Erro ao carregar.</td></tr>';
    }
}

async function deletarVaga(id) {
    if (!confirm("Excluir esta vaga permanentemente?")) return;
    exibirStatus("🗑️ Removendo...");
    const { error } = await _supabase.from('agendamentos').delete().eq('id', id);
    if (!error) {
        exibirStatus("✅ Removido!");
        listarHorarios();
    }
}

// ==========================================
// TELA 2: AGENDA DE CLIENTES (HISTÓRICO)
// ==========================================
async function listarAgendaClientes() {
    const corpoAgenda = document.getElementById('corpoAgenda');
    if (!corpoAgenda) return;

    // Mantemos 4 colunas (Data/Hora, Cliente, Serviço, Contato)
    corpoAgenda.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 25px; color: #666;">⌛ Carregando agenda...</td></tr>';

    try {
        const { data: agendamentos, error } = await _supabase
            .from('agendamentos')
            .select('*')
            .eq('barbeiro_id', barbeiroLogadoId)
            .neq('status', 'disponivel') 
            .order('data', { ascending: true })
            .order('horario', { ascending: true });

        if (error) throw error;

        if (!agendamentos || agendamentos.length === 0) {
            corpoAgenda.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#999;">Nenhum cliente agendado.</td></tr>';
            return;
        }

        corpoAgenda.innerHTML = '';

        agendamentos.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #eee"; // Linha divisória sutil

            const dataBr = item.data.split('-').reverse().join('/');
            
            // Coluna de contato com underscore conforme erro anterior
            const celularBruto = item.cliente_whatsapp || ""; 
            const numeroLimpo = celularBruto.replace(/\D/g, '');
            let linkWhatsapp = numeroLimpo.length >= 10 ? `https://wa.me/55${numeroLimpo.startsWith('55') ? numeroLimpo.substring(2) : numeroLimpo}` : "";

            // --- LÓGICA DE FOTOS ATUALIZADA ---
            let htmlFotos = '';
            if (Array.isArray(item.foto_corte) && item.foto_corte.length > 0) {
                const fotosValidas = item.foto_corte.filter(url => url && url !== "null");
                if (fotosValidas.length > 0) {
                    // Criamos o bloco de fotos com a classe CSS
                    htmlFotos = `<div class="cliente-fotos-bloco">
                        ${fotosValidas.map(url => `
                            <img src="${url}" onclick="window.open('${url}', '_blank')" 
                                 class="foto-corte-agendamento" title="Clique para ampliar">
                        `).join('')}
                    </div>`;
                }
            }

            tr.innerHTML = `
                <td style="padding: 12px 8px; vertical-align: middle; white-space: nowrap;">
                    <div style="font-weight: 800; color: #1a1c1e; font-size: 14px;">${item.horario.substring(0, 5)}</div>
                    <div style="font-size: 11px; color: #888;">${dataBr}</div>
                </td>

                <td style="padding: 12px 8px; vertical-align: middle;">
                    <div class="celula-cliente-container">
                        <div class="cliente-nome-tabela">
                            ${item.cliente_nome || 'Não informado'}
                        </div>
                        ${htmlFotos}
                    </div>
                </td>

                <td style="padding: 12px 8px; vertical-align: middle; font-size: 13px; color: #555;">
                    ${item.servico || 'Corte'}
                </td>

                <td style="padding: 12px 8px; vertical-align: middle;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${linkWhatsapp ? `
                            <a href="${linkWhatsapp}" target="_blank" style="text-decoration: none;">
                                <div style="background: #25D366; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    📞
                                </div>
                            </a>` : '<span style="color:#ccc; font-size:10px;">-</span>'}
                        
                        <label style="background: #f0f0f0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; cursor: pointer; font-size: 16px; border: 1px solid #ddd;" title="Adicionar Foto">
                            📷
                            <input type="file" accept="image/*" style="display: none;" onchange="uploadFotoCorte(event, '${item.id}')">
                        </label>
                    </div>
                </td>
            `;
            corpoAgenda.appendChild(tr);
        });

    } catch (err) {
        console.error("Erro na agenda:", err);
        corpoAgenda.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center; padding: 20px;">Erro ao carregar dados.</td></tr>';
    }
}

async function concluirAtendimento(id) {
    const { error } = await _supabase.from('agendamentos').update({ status: 'concluido' }).eq('id', id);
    if (!error) {
        exibirStatus("✅ Atendimento concluído!");
        listarAgendaClientes();
    }
}

// ==========================================
// TELA 3: GESTÃO DE SERVIÇOS
// ==========================================

async function carregarServicosBD() {
    try {
        const { data, error } = await _supabase
            .from('servicos')
            .select('*')
            .eq('barbearia_id', BARBEARIA_ID)
            .order('nome', { ascending: true });

        if (error) throw error;

        // Atualiza a lista local para o modal
        listaServicosLocal = data.map(s => `${s.nome} - R$ ${parseFloat(s.preco).toFixed(2).replace('.', ',')}`);
        
        // Atualiza o <select> do formulário de criação de vagas
        atualizarSelectServicos();
    } catch (e) { 
        console.error("Erro ao carregar serviços:", e); 
    }
}

function atualizarSelectServicos() {
    if (!selectServico) return;
    let html = `<option value="">-- Deixar em branco (Livre) --</option>`;
    html += listaServicosLocal.map(s => `<option value="${s}">${s}</option>`).join('');
    selectServico.innerHTML = html;
}

async function abrirModalConfig() {
    const modal = document.getElementById('modalConfig');
    if (modal) modal.classList.remove('hidden');
    await carregarServicosBD();
    renderizarListaConfig();
}

function fecharModalConfig() {
    const modal = document.getElementById('modalConfig');
    if (modal) modal.classList.add('hidden');
}

function renderizarListaConfig() {
    const ul = document.getElementById('listaServicosConfig');
    if(!ul) return;
    ul.innerHTML = listaServicosLocal.map((s, index) => `
        <li class="item-servico">
            <span>${s}</span>
            <button onclick="removerServicoLista(${index})" style="background:none; border:none; cursor:pointer;">🗑️</button>
        </li>
    `).join('');
}

async function adicionarServicoLista() {
    const nomeInput = document.getElementById('novoServicoNome');
    const precoInput = document.getElementById('novoServicoPreco');
    
    const nome = nomeInput.value.trim();
    // Limpa o preço para aceitar pontos ou vírgulas e converter para número
    const preco = precoInput.value.replace('R$', '').replace(',', '.').trim();

    if (!nome || !preco) {
        alert("⚠️ Preencha o nome e o preço do serviço.");
        return;
    }

    try {
        // 1. Salva no banco de dados Supabase
        const { error } = await _supabase
            .from('servicos')
            .insert([{ 
                nome: nome, 
                preco: parseFloat(preco), 
                barbearia_id: BARBEARIA_ID 
            }]);

        if (error) throw error;

        // 2. Limpa os campos do modal
        nomeInput.value = '';
        precoInput.value = '';
        
        // 3. ATUALIZAÇÃO EM TEMPO REAL:
        // Recarrega os serviços do banco para a lista local e para o formulário
        await carregarServicosBD(); 
        renderizarListaConfig(); // Atualiza a lista visual dentro do modal
        
        exibirStatus("✅ Serviço adicionado!");
    } catch (e) {
        console.error("Erro ao salvar serviço:", e);
        alert("Erro ao salvar serviço no banco de dados.");
    }
}

async function removerServicoLista(index) {
    const servicoTexto = listaServicosLocal[index];
    const nomeServico = servicoTexto.split(' - R$ ')[0]; // Pega só o nome antes do preço

    if (!confirm(`Deseja excluir o serviço "${nomeServico}"?`)) return;

    try {
        const { error } = await _supabase
            .from('servicos')
            .delete()
            .eq('nome', nomeServico)
            .eq('barbearia_id', BARBEARIA_ID);

        if (error) throw error;

        await carregarServicosBD(); // Recarrega do banco
        renderizarListaConfig();    // Atualiza modal
        exibirStatus("🗑️ Serviço removido!");
    } catch (e) {
        console.error(e);
    }
}

async function salvarServicosNoGoogle() { 
    exibirStatus("💾 Salvando serviços...");
    try {
        await _supabase.from('servicos').delete().eq('barbearia_id', BARBEARIA_ID);
        const novos = listaServicosLocal.map(s => {
            const partes = s.split(' - R$ ');
            return { barbearia_id: BARBEARIA_ID, nome: partes[0], preco: partes[1].replace(',', '.') };
        });
        await _supabase.from('servicos').insert(novos);
        exibirStatus("✅ Serviços atualizados!");
        fecharModalConfig();
    } catch (e) { exibirStatus("❌ Erro ao salvar."); }
}

// ==========================================
// LÓGICA DO FORMULÁRIO (GERAR / EDITAR)
// ==========================================

function toggleFormulario() {
    if (formContainer.classList.contains('hidden')) {
        formContainer.classList.remove('hidden');
        btnAbrirForm.textContent = "✖️ Fechar";
    } else {
        fecharELimparFormulario();
    }
}

function fecharELimparFormulario() {
    idSendoEditado = null; 
    form.reset();
    formContainer.classList.add('hidden');
    btnAbrirForm.textContent = "➕ Criar Vagas";
    btnSalvar.textContent = "Gerar Horários";
}

function prepararEdicao(item) {
    idSendoEditado = item.id;
    if (formContainer.classList.contains('hidden')) toggleFormulario();
    document.getElementById('dataInicio').value = item.data;
    document.getElementById('horaInicio').value = item.horario.substring(0,5);
    document.getElementById('servico').value = item.servico || "";
    btnSalvar.textContent = "Atualizar Horário";
}

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // 1. Bloqueio de segurança
        if (!barbeiroLogadoId) {
            alert("Erro: Seu usuário não está identificado. Faça login novamente.");
            return;
        }

        // 2. Captura de Elementos
        const elDataInicio = document.getElementById('dataInicio');
        const elDataFim = document.getElementById('dataFim');
        const elHoraInicio = document.getElementById('horaInicio');
        const elHoraFim = document.getElementById('horaFim');
        const elIntervalo = document.getElementById('intervalo');
        const elServico = document.getElementById('servico');
        const elAlmocoInicio = document.getElementById('almocoInicio');
        const elAlmocoFim = document.getElementById('almocoFim');

        if (!elDataInicio || !elHoraInicio || !elIntervalo) {
            console.error("Erro: Campos essenciais não encontrados.");
            return;
        }

        btnSalvar.disabled = true;
        btnSalvar.textContent = "🚀 Processando...";

        try {
            if (!idSendoEditado) {
                // MODO: Geração em massa
                const dataInicioInput = elDataInicio.value;
                const dataFimInput = elDataFim ? elDataFim.value : dataInicioInput;
                const hInicio = elHoraInicio.value;
                const hFim = elHoraFim ? elHoraFim.value : hInicio;
                const intervalo = parseInt(elIntervalo.value) || 30;
                
                const almocoInicio = elAlmocoInicio ? elAlmocoInicio.value : null;
                const almocoFim = elAlmocoFim ? elAlmocoFim.value : null;
                const servicoSelecionado = elServico ? elServico.value : null;

                const diasSelecionados = Array.from(document.querySelectorAll('input[name="dia_sem"]:checked')).map(el => parseInt(el.value));
                
                if (diasSelecionados.length === 0) {
                    alert("Selecione pelo menos um dia da semana!");
                    btnSalvar.disabled = false;
                    btnSalvar.textContent = "Gerar Horários";
                    return;
                }

                // --- INÍCIO DA VALIDAÇÃO DE DUPLICIDADE ---
                // Busca todos os horários já existentes para este barbeiro no período selecionado
                const { data: horariosExistentes, error: erroConsulta } = await _supabase
                    .from('agendamentos')
                    .select('data, horario')
                    .eq('barbeiro_id', barbeiroLogadoId)
                    .gte('data', dataInicioInput)
                    .lte('data', dataFimInput);

                if (erroConsulta) throw erroConsulta;

                // Criamos um mapa (Set) para busca rápida de "Data Hora"
                const mapaExistentes = new Set(
                    horariosExistentes.map(h => `${h.data} ${h.horario}`)
                );
                // --- FIM DA VALIDAÇÃO ---

                let dataAtual = new Date(dataInicioInput + 'T12:00:00');
                const dataFinal = new Date(dataFimInput + 'T12:00:00');
                let novasVagas = [];
                let contagemDuplicados = 0;

                while (dataAtual <= dataFinal) {
                    if (diasSelecionados.includes(dataAtual.getDay())) {
                        let [h, m] = hInicio.split(':').map(Number);
                        let [hf, mf] = hFim.split(':').map(Number);
                        let tempoMinutos = h * 60 + m;
                        let tempoFimMinutos = hf * 60 + mf;

                        let minAlmocoIni = -1, minAlmocoFim = -1;
                        if (almocoInicio && almocoFim) {
                            let [haI, maI] = almocoInicio.split(':').map(Number);
                            let [haF, maF] = almocoFim.split(':').map(Number);
                            minAlmocoIni = haI * 60 + maI;
                            minAlmocoFim = haF * 60 + maF;
                        }

                        while (tempoMinutos < tempoFimMinutos) {
                            if (!(tempoMinutos >= minAlmocoIni && tempoMinutos < minAlmocoFim)) {
                                let hh = Math.floor(tempoMinutos / 60).toString().padStart(2, '0');
                                let mm = (tempoMinutos % 60).toString().padStart(2, '0');
                                
                                const dataString = dataAtual.toISOString().split('T')[0];
                                const horaString = `${hh}:${mm}:00`;

                                // Verifica se já existe no mapa antes de adicionar à lista de insert
                                if (mapaExistentes.has(`${dataString} ${horaString}`)) {
                                    contagemDuplicados++;
                                } else {
                                    novasVagas.push({
                                        barbearia_id: BARBEARIA_ID,
                                        barbeiro_id: barbeiroLogadoId,
                                        data: dataString,
                                        horario: horaString,
                                        status: 'disponivel',
                                        servico: servicoSelecionado
                                    });
                                }
                            }
                            tempoMinutos += intervalo;
                        }
                    }
                    dataAtual.setDate(dataAtual.getDate() + 1);
                }

                if (novasVagas.length > 0) {
                    const { error } = await _supabase.from('agendamentos').insert(novasVagas);
                    if (error) {
                        if (error.code === '23503') throw new Error("Usuário não vinculado à tabela barbeiros.");
                        throw error;
                    }
                    
                    let msg = `✅ ${novasVagas.length} horários gerados!`;
                    if (contagemDuplicados > 0) msg += `\n⚠️ ${contagemDuplicados} duplicados ignorados.`;
                    alert(msg);
                } else {
                    alert("⚠️ Nenhum horário novo foi gerado (todos já existem ou estão fora dos dias).");
                }

            } else {
                // MODO: Edição de vaga única
                const { error } = await _supabase
                    .from('agendamentos')
                    .update({
                        horario: elHoraInicio.value + ":00",
                        servico: elServico ? elServico.value : null
                    })
                    .eq('id', idSendoEditado);
                
                if (error) throw error;
                alert("✅ Horário atualizado!");
            }

            fecharELimparFormulario();
            await listarHorarios();

        } catch (error) {
            console.error("Erro ao salvar horários:", error);
            alert(error.message || "Erro ao salvar.");
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = "Gerar Horários";
        }
    });
}

function exibirStatus(msg) {
    if (!statusDiv) return;
    statusDiv.innerText = msg;
    statusDiv.style.display = 'block';
    setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
}

// Abrir e Fechar Modal
function abrirModalBarbeiros() {
    const modal = document.getElementById('modalBarbeiros');
    if (modal) {
        modal.classList.remove('hidden');
        // USAR SEMPRE A VERSÃO 'Config' que é a mais atualizada que fizemos
        listarBarbeirosConfig(); 
    }
}

function fecharModalBarbeiros() {
    document.getElementById('modalBarbeiros').classList.add('hidden');
}

// Listar Barbeiros Cadastrados


// Adicionar Novo Barbeiro
async function adicionarBarbeiro() {
    const nome = document.getElementById('novoBarbeiroNome').value;
    const email = document.getElementById('novoBarbeiroEmail').value.toLowerCase().trim();

    if (!nome || !email) return alert("Preencha nome e e-mail.");

    exibirStatus("⌛ Sincronizando...");

    // Se for o dono, usa o UUID fixo. Para outros, deixamos o banco lidar ou o upsert resolver.
    const objeto = { 
        nome: nome, 
        email: email, 
        barbearia_id: BARBEARIA_ID 
    };
    
    if (email === "leonardomaiaarruda@gmail.com") {
        objeto.id = "432083b6-5a4a-4d0a-ae1b-0abec9f8195e";
    }

    const { error } = await _supabase
        .from('barbeiros')
        .upsert([objeto], { onConflict: 'email' });

    if (error) {
        console.error(error);
        alert("Erro ao cadastrar: " + error.message);
    } else {
        exibirStatus("✅ Barbeiro sincronizado!");
        document.getElementById('novoBarbeiroNome').value = "";
        document.getElementById('novoBarbeiroEmail').value = "";
        listarBarbeiros();
    }
}

async function removerBarbeiro(id) {
    if (!confirm("Remover este barbeiro da equipe?")) return;
    await _supabase.from('barbeiros').delete().eq('id', id);
    listarBarbeiros();
}

/**
 * Realiza o upload da foto para o Storage e salva a URL no perfil do barbeiro
 */
async function uploadFotoPerfil(event) {
    const file = event.target.files[0];
    const idUsuario = barbeiroLogadoId || localStorage.getItem('barbeiro_id');

    if (!file || !idUsuario || idUsuario === "undefined") {
        alert("Erro: Usuário não identificado. Tente fazer login novamente.");
        return;
    }

    try {
        const fileName = `avatar_${idUsuario}_${Date.now()}`;
        
        // 1. Upload Storage
        const { data: uploadData, error: uploadError } = await _supabase.storage
            .from('barbearia-files')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 2. URL Pública
        const { data: { publicUrl } } = _supabase.storage
            .from('barbearia-files')
            .getPublicUrl(fileName);

        // 3. Update no Banco (Onde dava erro 400)
       const { error: updateError } = await _supabase
        .from('barbeiros')
        .update({ foto_url: publicUrl }) 
        .eq('id', barbeiroLogadoId); // <--- Esse ID tem que ser o do funcionário!

        if (updateError) throw updateError;

        // 4. Sucesso Visual
        const imgPreview = document.getElementById('imgPerfil');
        if (imgPreview) imgPreview.src = `${publicUrl}?t=${Date.now()}`;
        m ,  
        alert("Foto atualizada!");

    } catch (err) {
       
    }
}

/**
 * Carrega a foto atual do barbeiro ao iniciar
 */
// No seu arquivo script.js (Parte do Painel ADM)
async function carregarFotoPerfil() {
    // Tenta pegar o ID da memória ou do localStorage
    const idParaConsulta = barbeiroLogadoId || localStorage.getItem('barbeiro_id');

    // Se continuar undefined, para aqui e evita o erro 400
    if (!idParaConsulta || idParaConsulta === "undefined") {
        console.warn("Cancelando carregarFotoPerfil: ID não encontrado.");
        return;
    }

    try {
        const { data, error } = await _supabase
            .from('barbeiros')
            .select('"foto_url"') // Aspas duplas internas para colunas com hífen
            .eq('id', idParaConsulta)
            .maybeSingle();

        if (error) throw error;

        if (data && data['foto_url']) {
            const imgPreview = document.getElementById('imgPerfil');
            if (imgPreview) {
                imgPreview.src = `${data['foto_url']}?t=${Date.now()}`;
            }
        }
    } catch (err) {
        console.error("Erro ao carregar foto:", err);
    }
}

async function cadastrarBarbeiroCompleto(email, senha, nome) {
    try {
        // PASSO 1: Criar o usuário no Supabase Auth
        // Isso gera o ID oficial na tabela auth.users
        const { data: authData, error: authError } = await _supabase.auth.signUp({
            email: email,
            password: senha
        });

        if (authError) throw authError;

        // O ID que o Supabase acabou de criar para esse novo login
        const novoIdAutenticado = authData.user.id;

        // PASSO 2: Agora sim, inserir na sua tabela pública usando o ID gerado
        const { error: dbError } = await _supabase
            .from('barbeiros')
            .insert([{
                id: novoIdAutenticado, // Vínculo perfeito com o Auth
                nome: nome,
                email: email,
                barbearia_id: BARBEARIA_ID,
                "foto-url": null
            }]);

        if (dbError) {
            // Se der erro aqui, o usuário foi criado no Auth mas não na tabela.
            // É raro, mas importante tratar.
            console.error("Erro ao salvar dados extras:", dbError);
            throw dbError;
        }

        alert("Sucesso! Barbeiro autenticado e cadastrado.");

    } catch (err) {
        console.error("Erro no processo:", err.message);
        alert("Falha no cadastro: " + err.message);
    }
}

// =========================================
// GESTÃO DE EQUIPE (CADASTRO ADM)
// =========================================

async function realizarCadastroCompleto() {
    // 1. Referências dos elementos
    const nomeInput = document.getElementById('novoBarbeiroNome');
    const emailInput = document.getElementById('novoBarbeiroEmail');
    const senhaInput = document.getElementById('novoBarbeiroSenha');
    const btn = document.getElementById('btnCadastrarEquipe');
    const status = document.getElementById('statusCadastro');

    // 2. Captura e Limpeza
    const nome = typeof sanitizar === "function" ? sanitizar(nomeInput.value) : nomeInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const senha = senhaInput.value.trim();

    if (!nome || !email || !senha) return alert("⚠️ Preencha todos os campos.");
    if (senha.length < 6) return alert("⚠️ A senha deve ter no mínimo 6 caracteres.");

    // 3. Interface de Carregamento
    btn.disabled = true;
    const textoOriginal = btn.innerText;
    btn.innerText = "⏳ Processando...";
    status.style.display = 'block';
    status.innerText = "Criando credenciais...";

    try {
        // --- O PULO DO GATO ---
        // Criamos um cliente temporário que NÃO PERSISTE sessão. 
        // Isso impede que o Supabase sobrescreva seu login de ADM.
        const supabaseCadastro = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });

        // PASSO 1: Criar o usuário usando o cliente ISOLADO
        const { data: authData, error: authError } = await supabaseCadastro.auth.signUp({
            email: email,
            password: senha,
            options: {
                data: { 
                    display_name: nome,
                    role: 'barbeiro' 
                }
            }
        });

        if (authError) throw new Error(`Erro no Auth: ${authError.message}`);
        const novoUsuarioId = authData.user.id;

        // PASSO 2: Inserir na tabela usando o cliente ORIGINAL (_supabase)
        // Usamos o seu login de ADM para ter permissão de escrita no banco
        const { error: dbError } = await _supabase
            .from('barbeiros')
            .insert([{
                id: novoUsuarioId,
                nome: nome,
                email: email,
                barbearia_id: BARBEARIA_ID,
                foto_url: null
            }]);

        if (dbError) throw new Error(`Erro no Banco: ${dbError.message}`);

        // 5. Sucesso
        status.innerText = "🎉 Barbeiro cadastrado com sucesso!";
        status.style.color = "green";
        btn.innerText = "✔️ Cadastrado";
        
        // Limpeza
        nomeInput.value = "";
        emailInput.value = "";
        senhaInput.value = "";

        if (typeof listarBarbeirosConfig === "function") listarBarbeirosConfig();

        setTimeout(() => {
            btn.disabled = false;
            btn.innerText = textoOriginal;
            status.style.display = 'none';
        }, 3000);

    } catch (err) {
        console.error("Falha no cadastro:", err);
        alert(err.message);
        btn.disabled = false;
        btn.innerText = "Tentar Novamente";
        status.innerText = "❌ Erro ao cadastrar.";
        status.style.color = "red";
    }
}

async function listarBarbeirosConfig() {
    const listaUl = document.getElementById('listaBarbeirosConfig');
    if (!listaUl) return;

    // Feedback visual de carregamento
    listaUl.innerHTML = '<li style="text-align:center; padding:20px; color:#666;">⌛ Carregando equipe...</li>';

    try {
        // Busca todos os barbeiros (incluindo a coluna 'ativo')
        const { data: barbeiros, error } = await _supabase
            .from('barbeiros')
            .select('*')
            .eq('barbearia_id', BARBEARIA_ID)
            .order('ativo', { ascending: false }) // Mostra os ativos primeiro
            .order('nome', { ascending: true });

        if (error) throw error;

        if (!barbeiros || barbeiros.length === 0) {
            listaUl.innerHTML = '<li style="text-align:center; padding:20px; color:#666;">Nenhum barbeiro cadastrado.</li>';
            return;
        }

        listaUl.innerHTML = '';
        
        barbeiros.forEach(barbeiro => {
            const li = document.createElement('li');
            const estaAtivo = barbeiro.ativo === true;

            // Estilização base do item
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.gap = '12px';
            li.style.padding = '12px';
            li.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
            li.style.background = estaAtivo ? 'white' : '#f8f9fa'; // Fundo cinza se inativo
            li.style.borderRadius = '8px';
            li.style.marginBottom = '8px';
            li.style.transition = 'opacity 0.3s ease';
            
            // Se estiver inativo, deixamos o item meio transparente
            if (!estaAtivo) {
                li.style.opacity = '0.6';
            }

            const fotoUrl = barbeiro.foto_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

            li.innerHTML = `
                <img src="${fotoUrl}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #eee; filter: ${estaAtivo ? 'none' : 'grayscale(100%)'};">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: ${estaAtivo ? '#333' : '#888'};">
                        ${barbeiro.nome} ${estaAtivo ? '' : '<span style="font-size: 0.6rem; background: #ddd; padding: 2px 5px; border-radius: 4px; margin-left: 5px;">DESATIVADO</span>'}
                    </strong>
                    <span style="font-size: 0.75rem; color: #888;">${barbeiro.email}</span>
                </div>
                
                <button onclick="alternarStatusBarbeiro('${barbeiro.id}', ${estaAtivo})" 
                        style="background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 5px; transition: transform 0.2s;" 
                        title="${estaAtivo ? 'Desativar Acesso' : 'Reativar Acesso'}"
                        onmouseover="this.style.transform='scale(1.2)'" 
                        onmouseout="this.style.transform='scale(1)'">
                    ${estaAtivo ? '🚫' : '✅'}
                </button>
            `;
            listaUl.appendChild(li);
        });

    } catch (err) {
        console.error("Erro ao listar equipe:", err);
        listaUl.innerHTML = '<li style="text-align:center; padding:20px; color:red;">Erro ao carregar lista.</li>';
    }
}

async function removerBarbeiroDaEquipe(id, nome) {
    if (!confirm(`Tem certeza que deseja remover ${nome} da equipe?\nIsso não deletará a conta de login, apenas o vínculo com a barbearia.`)) return;

    try {
        const { error } = await _supabase
            .from('barbeiros')
            .delete()
            .eq('id', id);

        if (error) throw error;

        alert("Barbeiro removido com sucesso!");
        listarBarbeirosConfig(); // Atualiza a lista na tela

    } catch (err) {
        alert("Erro ao remover: " + err.message);
    }
}

function abrirModalSenha() {
    document.getElementById('modalSenha').classList.remove('hidden');
    document.getElementById('novaSenhaInput').focus(); // Dá foco automático ao abrir
}

function fecharModalSenha() {
    document.getElementById('modalSenha').classList.add('hidden');
    // Limpa os campos ao fechar
    document.getElementById('novaSenhaInput').value = "";
    document.getElementById('confirmarSenhaInput').value = "";
}

async function executarTrocaSenha() {
    const novaSenha = document.getElementById('novaSenhaInput').value.trim();
    const confirma = document.getElementById('confirmarSenhaInput').value.trim();
    const btn = document.getElementById('btnConfirmarSenha');
    const status = document.getElementById('statusSenha');

    if (novaSenha.length < 6) return alert("A senha deve ter 6+ caracteres.");
    if (novaSenha !== confirma) return alert("As senhas não coincidem.");

    btn.disabled = true;
    btn.innerText = "⏳ Processando...";

    try {
        const { error } = await _supabase.auth.updateUser({ password: novaSenha });
        if (error) throw error;

        // FEEDBACK DE SUCESSO
        status.style.display = "block";
        status.innerText = "✅ Senha alterada com sucesso!";
        status.style.color = "green";

        // FECHAMENTO AUTOMÁTICO APÓS 1.5 SEGUNDOS
        setTimeout(() => {
            fecharModalSenha();
            btn.disabled = false;
            btn.innerText = "Atualizar Senha";
            status.style.display = "none";
        }, 1500);

    } catch (err) {
        alert("Erro: " + err.message);
        btn.disabled = false;
        btn.innerText = "Atualizar Senha";
    }
}


async function solicitarRecuperacaoSenha() {
    const emailInput = document.getElementById('email'); 
    
    if (!emailInput) {
        alert("Erro técnico: Campo de e-mail não encontrado.");
        return;
    }

    const email = emailInput.value.trim();

    if (!email) {
        alert("⚠️ Por favor, digite seu e-mail no campo de login para receber o link de recuperação.");
        emailInput.focus();
        return;
    }

    // 3. Feedback visual no link/botão
    const btnLink = event.target;
    const textoOriginal = btnLink.innerText;
    
    try {
        btnLink.innerText = "⏳ Enviando...";
        btnLink.style.pointerEvents = "none";

        const { error } = await _supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname,
        });

        if (error) throw error;

        alert("✅ Link enviado! Verifique sua caixa de entrada (e o Spam).");

    } catch (err) {
        alert("❌ Erro: " + err.message);
    } finally {
        btnLink.innerText = textoOriginal;
        btnLink.style.pointerEvents = "auto";
    }
}

async function alternarStatusBarbeiro(id, statusAtual) {
    const novoStatus = !statusAtual; 
    const acao = novoStatus ? "reativar" : "desativar";

    if (!confirm(`Tem certeza que deseja ${acao} este funcionário?`)) return;

    try {
        console.log("Iniciando Update - ID:", id, "Novo Status:", novoStatus);

        const { data, error } = await _supabase
            .from('barbeiros')
            .update({ ativo: novoStatus })
            .eq('id', id) // Verifique se no banco a coluna chama 'id' ou 'usuario_id'
            .select();

        if (error) {
            console.error("Erro retornado pelo Supabase:", error);
            throw new Error(error.message);
        }

        if (!data || data.length === 0) {
            // Se cair aqui após você criar a Policy, o problema é o ID que não existe na tabela
            console.error("Dados retornados vazios. O ID existe na tabela barbeiros?");
            throw new Error("ID não encontrado ou bloqueado pela RLS.");
        }

        alert(`✅ Sucesso! Funcionário ${novoStatus ? 'Ativo' : 'Desativado'}.`);
        
        // Recarrega a lista para atualizar a interface
        if (typeof listarBarbeirosConfig === "function") {
            await listarBarbeirosConfig();
        }

    } catch (err) {
        console.error("Erro detalhado:", err);
        alert("❌ Falha na operação: " + err.message);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    const telaLogin = document.getElementById('login-screen');
    
    // 1. Obtém a sessão atual
    const { data: { session } } = await _supabase.auth.getSession();

    // 2. Verifica se o usuário veio por um link de recuperação (Esqueci Senha)
    // O Supabase pode enviar os dados via Hash (#) ou Query (?)
    const urlParams = new URLSearchParams(window.location.hash.replace('#', '?'));
    const isRecovery = urlParams.get('type') === 'recovery' || window.location.hash.includes('access_token');

    if (session || isRecovery) {
        // Se houver sessão, define o ID do barbeiro
        if (session) {
            barbeiroLogadoId = session.user.id;
        }
        
        // Esconde a tela de login
        if (telaLogin) telaLogin.style.display = 'none';

        // Inicializações padrão
        await verificarPermissoes();
        if (typeof carregarFotoPerfil === "function") carregarFotoPerfil();
        if (typeof configurarCalendario === "function") configurarCalendario();
        
        if (typeof carregarServicosBD === "function") {
            await carregarServicosBD();
        } else if (typeof carregarServicos === "function") {
            carregarServicos();
        }

        if (typeof listarHorarios === "function") listarHorarios();

        // 3. Gatilho específico para Redefinição de Senha
        if (isRecovery) {
            setTimeout(() => {
                // Abre o modal centralizado que criamos
                if (typeof abrirModalSenha === "function") {
                    abrirModalSenha();
                    // Opcional: um aviso mais amigável que o alert
                    console.log("Modo de recuperação de senha ativado.");
                }
            }, 1200); // Um pouco mais de tempo para garantir que o Supabase validou o token
        }

    } else {
        // Se não houver sessão nem recuperação, mostra o login
        if (telaLogin) telaLogin.style.display = 'flex';
    }



    // ESCUTADOR EM TEMPO REAL PARA DESLOGAR QUEM FOR DESATIVADO
const canalBarbeiros = _supabase
  .channel('mudancas-status')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'barbeiros'
    },
    (payload) => {
      // 1. Verifica se a mudança foi na coluna 'ativo' e se agora é 'false'
      // 2. Verifica se o barbeiro alterado é exatamente o que está logado agora
      if (payload.new.id === barbeiroLogadoId && payload.new.ativo === false) {
          
          alert("🚨 Sua conta foi desativada pelo administrador. Você será deslogado agora.");
          
          // Executa o logout
          _supabase.auth.signOut().then(() => {
              window.location.reload(); // Recarrega para voltar à tela de login
          });
      }
    }
  )
  .subscribe();
});

async function verificarPermissoes() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    const btnEquipeDesk = document.getElementById('btn-nav-equipe-desk');
    const btnEquipeMobile = document.getElementById('btn-nav-equipe-mobile');

    // Verifica se é você pelo email ou pelo role nos metadados
    const ehAdmin = user.email === "leonardomaiaarruda@gmail.com" || 
                    (user.user_metadata && user.user_metadata.role === 'admin');

    if (ehAdmin) {
        if (btnEquipeDesk) btnEquipeDesk.style.display = 'block';
        if (btnEquipeMobile) btnEquipeMobile.style.display = 'flex';
        console.log("Nível de acesso: Administrador");
    } else {
        if (btnEquipeDesk) btnEquipeDesk.style.display = 'none';
        if (btnEquipeMobile) btnEquipeMobile.style.display = 'none';
        console.log("Nível de acesso: Barbeiro");
    }
}


async function uploadFotoCorte(event, agendamentoId) {
    const file = event.target.files[0];
    if (!file) return;

    exibirStatus("⏳ Enviando foto...");

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${agendamentoId}_${Date.now()}.${fileExt}`;
        const filePath = `cortes/${fileName}`;

        // 1. Envia o arquivo para o Storage
        const { error: uploadError } = await _supabase.storage
            .from('fotos_cortes')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Pega a URL pública
        const { data: { publicUrl } } = _supabase.storage
            .from('fotos_cortes')
            .getPublicUrl(filePath);

        // 3. Busca a lista atual de fotos do agendamento
        const { data: agendamento, error: selectError } = await _supabase
            .from('agendamentos')
            .select('foto_corte')
            .eq('id', agendamentoId)
            .single();

        if (selectError) throw selectError;

        // Garante que fotosAtuais seja um array (pode vir null do banco)
        let fotosAtuais = agendamento.foto_corte || [];
        
        // Adiciona a nova URL à lista
        fotosAtuais.push(publicUrl);

        // 4. Atualiza o banco com a lista completa
        const { error: updateError } = await _supabase
            .from('agendamentos')
            .update({ foto_corte: fotosAtuais }) // Envia o array atualizado
            .eq('id', agendamentoId);

        if (updateError) throw updateError;

        exibirStatus("✅ Foto adicionada!");
        listarAgendaClientes(); // Recarrega para mostrar a nova foto

    } catch (e) {
        console.error("Erro no upload múltiplo:", e);
        alert("Erro ao enviar foto. Verifique o console.");
    }
}
