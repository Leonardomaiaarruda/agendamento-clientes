// =========================================
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// =========================================
const URL_WEB_APP = "https://script.google.com/macros/s/AKfycbyWCgK2M0giR42Wr_4oNsCvBmw_r4iLFTyT6bb9ZOGxJ12rQ1pQCCHaB9Qo-QK41-v0ww/exec"; 

let linhaSelecionada = null; 
let horarioSelecionado = "";
let servicosSelecionados = [];
let linhaParaCancelar = null;

// 1. Inicialização ao carregar a página
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

// 3. Lógica de Serviços e Cálculo de Preço
async function carregarServicos() {
    const container = document.getElementById('containerServicos');
    try {
        const response = await fetch(`${URL_WEB_APP}?action=read`);
        const data = await response.json();
        container.innerHTML = data.servicos.map(s => `
            <label class="item-servico" id="label-${s.replace(/\s+/g, '-')}">
                <input type="checkbox" value="${s}" onchange="toggleServico(this, '${s}')">
                <span>${s}</span>
            </label>
        `).join('');
    } catch (e) {
        container.innerHTML = "<p>Erro ao carregar serviços.</p>";
    }
}

function toggleServico(cb, nome) {
    const id = nome.replace(/\s+/g, '-');
    const label = document.getElementById(`label-${id}`);
    if (cb.checked) {
        servicosSelecionados.push(nome);
        if (label) label.classList.add('selecionado');
    } else {
        servicosSelecionados = servicosSelecionados.filter(s => s !== nome);
        if (label) label.classList.remove('selecionado');
    }
    buscarDisponibilidade();
}

function calcularTotalSelecionado() {
    let total = 0;
    servicosSelecionados.forEach(servico => {
        const partes = servico.split('R$');
        if (partes.length > 1) {
            let valorLimpo = partes[1].trim().replace(/\./g, '').replace(',', '.');
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
        listaDiv.innerHTML = '<div class="aviso-selecao"><b>Selecione um serviço primeiro.</b></div>';
        return;
    }

    listaDiv.innerHTML = "<p>Buscando horários...</p>";

    try {
        const res = await fetch(`${URL_WEB_APP}?action=read`);
        const data = await res.json();

        // 1. Pegamos o momento exato de AGORA
        const agora = new Date();
        
        // 2. Definimos a MARGEM DE SEGURANÇA (ex: 30 minutos)
        const margemMinutos = 30;

        const disponiveis = data.horarios.filter(h => {
            // Filtro por data e status disponível
            if (h.data !== dataInput || h.status !== "Disponível") return false;

            // Criamos o objeto de data/hora da vaga
            const [horas, minutos] = h.horario.split(':');
            const [ano, mes, dia] = dataInput.split('-');
            const dataHoraVaga = new Date(ano, mes - 1, dia, horas, minutos);

            // 3. LÓGICA DA MARGEM:
            // Subtraímos os minutos da margem da hora da vaga
            // Se a vaga é 14:00, o limite para agendar é 13:30
            const limiteAgendamento = new Date(dataHoraVaga.getTime() - (margemMinutos * 60000));

            // Só mostra se o horário de AGORA ainda não atingiu o limite
            return agora < limiteAgendamento;
        });

        if (disponiveis.length === 0) {
            listaDiv.innerHTML = '<p style="text-align:center; color:#999;">Nenhum horário disponível para este momento. <br><small>(Agendamentos encerram 30min antes do horário)</small></p>';
        } else {
            listaDiv.innerHTML = disponiveis.map(h => `
                <button class="btn-hora" onclick="abrirConfirmacao('${h.horario}', ${h.linha})">${h.horario}</button>
            `).join('');
        }
    } catch (e) {
        console.error("Erro ao buscar:", e);
        listaDiv.innerHTML = "<p>Erro ao carregar horários.</p>";
    }
}

function abrirConfirmacao(horario, linha) {
    linhaSelecionada = linha;
    horarioSelecionado = horario;
    const modal = document.getElementById('modalConfirmacao');
    const resumo = document.getElementById('resumo');
    resumo.innerHTML = `
        <div style="text-align:left; background:rgba(255,255,255,0.05); padding:15px; border-radius:10px;">
            <p>✂️ <b>Serviços:</b> ${servicosSelecionados.join(' + ')}</p>
            <p>⏰ <b>Horário:</b> ${horario}</p>
            <p style="color:var(--primary); font-size:1.1rem; margin-top:10px;"><b>💰 Total: ${calcularTotalSelecionado()}</b></p>
        </div>
    `;
    modal.classList.remove('hidden');
}

async function confirmarAgendamento() {
    const btn = document.getElementById('btnFinalizar');
    const nome = document.getElementById('nomeCliente').value;
    const whatsapp = document.getElementById('telCliente').value.replace(/\D/g, '');
    const nascimento = document.getElementById('nascCliente').value;

    if (!nome || whatsapp.length < 10 || !nascimento) {
        return alert("Por favor, preencha todos os campos corretamente.");
    }

    const dados = {
        action: "agendarCliente",
        linha: linhaSelecionada,
        cliente: nome,
        whatsapp: whatsapp,
        servico: servicosSelecionados.join(' + '),
        nascimento: nascimento,
        preco: calcularTotalSelecionado()
    };

    btn.innerText = "⏳ Gravando...";
    btn.disabled = true;

    try {
        await fetch(URL_WEB_APP, { method: 'POST', mode: 'no-cors', body: JSON.stringify(dados) });
        fecharModal();
        mostrarSucesso("Agendado!", "O seu horário foi reservado com sucesso.");
        buscarDisponibilidade();
    } catch (e) {
        alert("Erro ao salvar agendamento.");
    } finally {
        btn.innerText = "Finalizar Agendamento";
        btn.disabled = false;
    }
}

// 5. Histórico e Cancelamento Real
async function consultarHistoricoCliente() {
    const whats = document.getElementById('whatsConsulta').value.replace(/\D/g, '');
    const nasc = document.getElementById('nascConsulta').value;
    const corpo = document.getElementById('corpoHistorico');
    const resumo = document.getElementById('resumoCliente');

    if (whats.length < 10 || !nasc) return alert("Preencha WhatsApp e Nascimento.");

    resumo.innerHTML = "⏳ Procurando seus agendamentos...";
    try {
        const res = await fetch(`${URL_WEB_APP}?action=read`);
        const data = await res.json();
        
        // Filtra por WhatsApp e data de nascimento (suporta formatos YYYY-MM-DD e DD/MM/YYYY)
        const filtrados = data.horarios.filter(h => {
            const whatsOk = String(h.whatsapp).replace(/\D/g, '') === whats;
            const nascFormatado = nasc.split('-').reverse().join('/');
            return whatsOk && (h.nascimento === nasc || h.nascimento === nascFormatado);
        });

        document.getElementById('resultadoConsulta').classList.remove('hidden');
        
        if (filtrados.length === 0) {
            resumo.innerHTML = "❌ Nenhum agendamento encontrado.";
            corpo.innerHTML = "";
            return;
        }

        resumo.innerHTML = `✅ Olá, <b>${filtrados[0].cliente}</b>! Aqui estão seus horários:`;
        
        corpo.innerHTML = filtrados.map(h => `
            <tr>
                <td data-label="📅 Data">${h.data}<br><b>${h.horario}</b></td>
                <td data-label="✂️ Serviço">${h.servico}</td>
                <td data-label="💰 Total" style="color:var(--primary); font-weight:bold;">${h.preco || '---'}</td>
                <td data-label="📌 Status"><span class="badge-status ${h.status === 'Ocupado' ? 'status-azul' : 'status-verde'}">${h.status}</span></td>
                <td data-label="⚙️ Ação">
                    ${h.status === 'Ocupado' ? `<button onclick="abrirModalCancelamento(${h.linha})" class="btn-cancelar-cliente">Cancelar</button>` : '-'}
                </td>
            </tr>
        `).join('');
    } catch (e) {
        resumo.innerHTML = "❌ Erro ao conectar com o servidor.";
    }
}

function abrirModalCancelamento(linha) {
    linhaParaCancelar = linha;
    
    // Remove a classe hidden do modal de confirmação
    const modalCancela = document.getElementById('modalConfirmacaoCustom');
    modalCancela.classList.remove('hidden');
    
    // Opcional: Adiciona um efeito extra no modal que ficou atrás
    const modalConsulta = document.querySelector('.modal-full-content');
    if (modalConsulta) {
        modalConsulta.style.opacity = "0.5"; // Escurece o modal de trás
        modalConsulta.style.pointerEvents = "none"; // Bloqueia cliques no fundo
    }
}

async function confirmarCancelamento() {
    const btn = document.getElementById('btnConfirmarCancela');
    btn.innerText = "⏳ Cancelando...";
    btn.disabled = true;

    try {
        // Envia via GET para o Apps Script processar a limpeza da linha
        await fetch(`${URL_WEB_APP}?action=liberarHorario&linha=${linhaParaCancelar}`);
        fecharModalCustom();
        mostrarSucesso("Cancelado!", "O horário foi liberado com sucesso.");
        consultarHistoricoCliente();
        buscarDisponibilidade();
    } catch (e) {
        alert("Erro ao cancelar.");
    } finally {
        btn.innerText = "Sim, Cancelar";
        btn.disabled = false;
    }
}

// 6. Funções de Interface (Modais)
function fecharModal() { document.getElementById('modalConfirmacao').classList.add('hidden'); }
function fecharModalCustom() {
    document.getElementById('modalConfirmacaoCustom').classList.add('hidden');
    
    // Restaura o modal de consulta
    const modalConsulta = document.querySelector('.modal-full-content');
    if (modalConsulta) {
        modalConsulta.style.opacity = "1";
        modalConsulta.style.pointerEvents = "auto";
    }
}
function fecharModalSucesso() { document.getElementById('modalSucesso').classList.add('hidden'); }

function abrirModalConsulta() {
    const modal = document.getElementById('modalConsulta');
    modal.classList.remove('hidden');
    
    // Impede o scroll do corpo da página enquanto o modal estiver aberto
    document.body.style.overflow = 'hidden'; 
    
    // Garante que o modal inicie no topo caso haja muito conteúdo
    const content = modal.querySelector('.modal-full-content');
    if(content) content.scrollTop = 0;
}

function mostrarSucesso(titulo, msg) {
    document.getElementById('tituloSucesso').innerText = titulo;
    document.getElementById('mensagemSucesso').innerText = msg;
    document.getElementById('modalSucesso').classList.remove('hidden');
}

function fecharModalConsulta() {
    const modal = document.getElementById('modalConsulta');
    modal.classList.add('hidden');
    
    // Devolve o scroll para a página
    document.body.style.overflow = 'auto'; 
}
