// =========================================
// CONFIGURAÇÕES GLOBAIS - SUPABASE
// =========================================
const SUPABASE_URL = "https://ddqqtzwaxsgkbrnfjikv.supabase.co"; 
const SUPABASE_KEY = "sb_publishable__-43znJ2AImyNshY5nsTvA_Q5JUvFUV"; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BARBEARIA_ID = "817597d5-9a4b-4c6a-ab3b-9969a2d3999d"; 

let idAgendamentoSelecionado = null; 
let horarioSelecionado = "";
let servicosSelecionados = [];
let idParaCancelar = null;

// 1. Inicialização
window.addEventListener('DOMContentLoaded', () => {
    configurarCalendario();
    carregarServicos();
    buscarDisponibilidade(); 
    aplicarMascaraTelefone('telCliente');   
    aplicarMascaraTelefone('whatsConsulta');
});

// 2. Configurações de Data e Máscaras
function configurarCalendario() {
    const inputData = document.getElementById('dataCliente');
    if (!inputData) return;
    const hoje = new Date();
    const dataIso = hoje.toISOString().split('T')[0];
    inputData.setAttribute('min', dataIso);
    inputData.value = dataIso;
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

// 3. Lógica de Serviços
async function carregarServicos() {
    const container = document.getElementById('containerServicos');
    try {
        const { data: servicos, error } = await _supabase
            .from('servicos')
            .select('nome, preco')
            .eq('barbearia_id', BARBEARIA_ID);

        if (error) throw error;

        container.innerHTML = servicos.map(s => `
            <label class="item-servico" id="label-${s.nome.replace(/\s+/g, '-')}">
                <input type="checkbox" value="${s.nome} R$ ${s.preco}" onchange="toggleServico(this, '${s.nome} R$ ${s.preco}')">
                <span>${s.nome}</span>
                <span class="preco-tag">R$ ${parseFloat(s.preco).toFixed(2).replace('.', ',')}</span>
            </label>
        `).join('');
    } catch (e) {
        container.innerHTML = "<p>Erro ao carregar serviços.</p>";
    }
}

function toggleServico(cb, textoCompleto) {
    const nomeApenas = textoCompleto.split(' R$')[0];
    const id = nomeApenas.replace(/\s+/g, '-');
    const label = document.getElementById(`label-${id}`);
    
    if (cb.checked) {
        servicosSelecionados.push(textoCompleto);
        if (label) label.classList.add('selecionado');
    } else {
        servicosSelecionados = servicosSelecionados.filter(s => s !== textoCompleto);
        if (label) label.classList.remove('selecionado');
    }
    buscarDisponibilidade();
}

function calcularTotalSelecionado() {
    let total = 0;
    servicosSelecionados.forEach(servico => {
        const partes = servico.split('R$');
        if (partes.length > 1) {
            let valorLimpo = partes[1].trim().replace(',', '.');
            const valorNum = parseFloat(valorLimpo);
            if (!isNaN(valorNum)) total += valorNum;
        }
    });
    return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// 4. Disponibilidade e Agendamento
async function buscarDisponibilidade() {
    const listaDiv = document.getElementById('listaHorarios');
    const dataInput = document.getElementById('dataCliente').value;
    
    if (servicosSelecionados.length === 0) {
        listaDiv.innerHTML = '<div class="aviso-selecao" style="grid-column: 1/-1; text-align:center;"><b>Selecione um serviço primeiro.</b></div>';
        return;
    }

    try {
        const { data: horarios, error } = await _supabase
            .from('agendamentos')
            .select('*')
            .eq('barbearia_id', BARBEARIA_ID)
            .eq('data', dataInput)
            .eq('status', 'disponivel');

        if (error) throw error;

        // Ordenar por hora manualmente para garantir
        horarios.sort((a, b) => a.horario.localeCompare(b.horario));

        if (horarios.length === 0) {
            listaDiv.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Nenhum horário disponível.</p>';
        } else {
            listaDiv.innerHTML = horarios.map(h => `
                <button class="btn-hora" onclick="abrirConfirmacao('${h.horario.substring(0,5)}', '${h.id}')">
                    ${h.horario.substring(0,5)}
                </button>
            `).join('');
        }
    } catch (e) {
        console.error("Erro Supabase:", e);
        listaDiv.innerHTML = "<p>Erro ao carregar.</p>";
    }
}

function abrirConfirmacao(horario, id) {
    idAgendamentoSelecionado = id;
    horarioSelecionado = horario;
    const modal = document.getElementById('modalConfirmacao');
    const resumo = document.getElementById('resumo');
    resumo.innerHTML = `
        <div style="text-align:left; background:rgba(255,255,255,0.05); padding:15px; border-radius:10px;">
            <p>✂️ <b>Serviços:</b> ${servicosSelecionados.map(s => s.split(' R$')[0]).join(', ')}</p>
            <p>⏰ <b>Horário:</b> ${horario.substring(0,5)}</p>
            <p style="color:var(--primary); font-size:1.1rem; margin-top:10px;"><b>💰 Total: ${calcularTotalSelecionado()}</b></p>
        </div>
    `;
    modal.classList.remove('hidden');
}

async function confirmarAgendamento() {
    const btn = document.getElementById('btnFinalizar');
    const nome = document.getElementById('nomeCliente').value.trim();
    const whatsapp = document.getElementById('telCliente').value.replace(/\D/g, '');
    const nascimento = document.getElementById('nascCliente').value;

    if (!nome || whatsapp.length < 10 || !nascimento) {
        return alert("Por favor, preencha nome, whatsapp e data de nascimento.");
    }

    btn.innerText = "⏳ Verificando disponibilidade...";
    btn.disabled = true;

    try {
        const valorNumerico = parseFloat(calcularTotalSelecionado().replace(/[^\d,]/g, '').replace(',', '.'));
        
        // --- A TRAVA DE SEGURANÇA ACONTECE AQUI ---
        // Adicionamos o .select() para confirmar se houve alteração real
        const { data, error } = await _supabase
            .from('agendamentos')
            .update({
                cliente_nome: nome,
                cliente_whatsapp: whatsapp,
                nascimento: nascimento,
                servico: servicosSelecionados.map(s => s.split(' R$')[0]).join(' + '),
                status: 'ocupado',
                preco_final: valorNumerico
            })
            .eq('id', idAgendamentoSelecionado)
            .eq('status', 'disponivel') // SÓ ATUALIZA SE AINDA ESTIVER DISPONÍVEL
            .select(); // Retorna o registro atualizado para conferência

        if (error) throw error;

        // Se o 'data' estiver vazio, significa que o .eq('status', 'disponivel') não encontrou a linha
        // Ou seja: alguém agendou primeiro.
        if (!data || data.length === 0) {
            alert("⚠️ Ops! Este horário acabou de ser preenchido por outra pessoa. Por favor, escolha um novo horário.");
            fecharModal();
            buscarDisponibilidade(); // Atualiza a lista para mostrar a realidade
            return;
        }

        // Se passou daqui, o agendamento foi garantido!
        fecharModal();
        mostrarSucesso("Agendado!", "Te esperamos em breve!");
        buscarDisponibilidade();
        
    } catch (e) {
        console.error("Erro no agendamento:", e);
        alert("Erro ao salvar agendamento. Tente novamente.");
    } finally {
        btn.innerText = "Confirmar Agendamento";
        btn.disabled = false;
    }
}

// 5. Histórico e Cancelamento
async function consultarHistoricoCliente() {
    const whats = document.getElementById('whatsConsulta').value.replace(/\D/g, '');
    const nasc = document.getElementById('nascConsulta').value;
    const corpo = document.getElementById('corpoHistorico');
    const resumo = document.getElementById('resumoCliente');

    if (whats.length < 10 || !nasc) return alert("Preencha WhatsApp e Nascimento.");

    resumo.innerHTML = "⏳ Buscando seus dados...";
    try {
        const { data: filtrados, error } = await _supabase
            .from('agendamentos')
            .select('*')
            .eq('cliente_whatsapp', whats)
            .eq('nascimento', nasc)
            .eq('barbearia_id', BARBEARIA_ID)
            .order('data', { ascending: false });

        if (error) throw error;

        document.getElementById('resultadoConsulta').classList.remove('hidden');
        
        if (filtrados.length === 0) {
            resumo.innerHTML = "❌ Nenhum agendamento encontrado para esses dados.";
            corpo.innerHTML = "";
            return;
        }

        resumo.innerHTML = `✅ Olá, <b>${filtrados[0].cliente_nome}</b>! Confira seus horários:`;
        
        corpo.innerHTML = filtrados.map(h => {
            const [ano, mes, dia] = h.data.split('-');
            return `
            <tr>
                <td data-label="📅 Data">${dia}/${mes}/${ano}<br><b>${h.horario.substring(0,5)}</b></td>
                <td data-label="✂️ Serviço">${h.servico}</td>
                <td data-label="💰 Total" style="color:var(--primary); font-weight:bold;">R$ ${h.preco_final ? h.preco_final.toFixed(2).replace('.',',') : '---'}</td>
                <td data-label="📌 Status"><span class="badge-status ${h.status === 'ocupado' ? 'status-azul' : 'status-verde'}">${h.status}</span></td>
                <td data-label="⚙️ Ação">
                    ${h.status === 'ocupado' ? `<button onclick="abrirModalCancelamento('${h.id}')" class="btn-cancelar-cliente">Cancelar</button>` : '-'}
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        resumo.innerHTML = "❌ Erro ao conectar com o banco de dados.";
    }
}

// Funções de Interface
function fecharModal() { document.getElementById('modalConfirmacao').classList.add('hidden'); }
function fecharModalCustom() {
    document.getElementById('modalConfirmacaoCustom').classList.add('hidden');
    const modalConsulta = document.querySelector('.modal-full-content');
    if (modalConsulta) {
        modalConsulta.style.opacity = "1";
        modalConsulta.style.pointerEvents = "auto";
    }
}
function fecharModalSucesso() { document.getElementById('modalSucesso').classList.add('hidden'); }
function abrirModalConsulta() {
    document.getElementById('modalConsulta').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; 
}
function fecharModalConsulta() {
    document.getElementById('modalConsulta').classList.add('hidden');
    document.body.style.overflow = 'auto'; 
}
function mostrarSucesso(titulo, msg) {
    document.getElementById('tituloSucesso').innerText = titulo;
    document.getElementById('mensagemSucesso').innerText = msg;
    document.getElementById('modalSucesso').classList.remove('hidden');
}

function abrirModalCancelamento(id) {
    idParaCancelar = id;
    document.getElementById('modalConfirmacaoCustom').classList.remove('hidden');
    const modalConsulta = document.querySelector('.modal-full-content');
    if (modalConsulta) {
        modalConsulta.style.opacity = "0.5";
        modalConsulta.style.pointerEvents = "none";
    }
}

async function confirmarCancelamento() {
    const btn = document.getElementById('btnConfirmarCancela');
    btn.innerText = "⏳ Cancelando...";
    btn.disabled = true;

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
            .eq('id', idParaCancelar);

        if (error) throw error;

        fecharModalCustom();
        mostrarSucesso("Cancelado!", "O horário está livre novamente.");
        consultarHistoricoCliente();
        buscarDisponibilidade();
    } catch (e) {
        alert("Erro ao cancelar.");
    } finally {
        btn.innerText = "Sim, Cancelar";
        btn.disabled = false;
    }
}
