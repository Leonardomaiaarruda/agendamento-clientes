// ATENÇÃO: Use a mesma URL que você gerou no Google Apps Script do Admin
const URL_WEB_APP = "https://script.google.com/macros/s/AKfycbyWCgK2M0giR42Wr_4oNsCvBmw_r4iLFTyT6bb9ZOGxJ12rQ1pQCCHaB9Qo-QK41-v0ww/exec"; 

let horariosCarregados = [];

// Inicia ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    configurarCalendario();
    carregarServicos();
});

// Impede agendar no passado
function configurarCalendario() {
    const inputData = document.getElementById('dataCliente');
    const hoje = new Date().toISOString().split('T')[0];
    inputData.setAttribute('min', hoje);
    inputData.value = hoje;
}

// Busca os serviços que você cadastrou no Admin (Coluna G)
async function carregarServicos() {
    try {
        const response = await fetch(`${URL_WEB_APP}?action=getServicos`);
        const resultado = await response.json(); // Aqui recebemos o objeto completo
        
        // Pegamos apenas a parte de servicos do objeto
        const listaDeServicos = resultado.servicos || []; 

        const select = document.getElementById('servicoCliente');
        
        if (listaDeServicos.length === 0) {
            select.innerHTML = '<option value="">Nenhum serviço disponível</option>';
            return;
        }

        // Agora o .map() vai funcionar na lista correta
        select.innerHTML = '<option value="" disabled selected>Selecione um serviço...</option>' + 
            listaDeServicos.map(s => `<option value="${s}">${s}</option>`).join('');
            
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
        document.getElementById('servicoCliente').innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// Busca horários quando a data muda
async function buscarDisponibilidade() {
    const dataSelecionada = document.getElementById('dataCliente').value;
    const listaHtml = document.getElementById('listaHorarios');
    
    if (!dataSelecionada) return;

    listaHtml.innerHTML = "<p>Buscando vagas...</p>";

    try {
        // Faz a chamada ao Google Apps Script
        const response = await fetch(`${URL_WEB_APP}?action=read`);
        const resultado = await response.json();

        // IMPORTANTE: Acessamos resultado.horarios pois o Apps Script envia um objeto
        const todosHorarios = resultado.horarios || [];

        // Filtra: Mesma data E Status "Disponível"
        const disponiveis = todosHorarios.filter(item => {
            // Garantir que a data está no formato YYYY-MM-DD para comparar
            const dataLimpa = item.data.split('T')[0]; 
            return dataLimpa === dataSelecionada && item.status === "Disponível";
        });

        if (disponiveis.length === 0) {
            listaHtml.innerHTML = "<p class='erro'>Nenhum horário livre para este dia.</p>";
            return;
        }

        // Renderiza os botões
        listaHtml.innerHTML = disponiveis.map(h => `
            <button class="btn-hora" onclick="prepararAgendamento('${h.linha}', '${h.horario}')">
                ${h.horario}
            </button>
        `).join('');

    } catch (error) {
        console.error("Erro detalhes:", error);
        listaHtml.innerHTML = "<p class='erro'>Erro ao carregar horários. Verifique a conexão.</p>";
    }
}

// Prepara o modal de confirmação
function prepararAgendamento(linha, hora) {
    const servico = document.getElementById('servicoCliente').value;
    
    if (!servico) {
        alert("⚠️ Por favor, selecione primeiro o serviço desejado.");
        return;
    }
    
    window.agendamentoFinal = { linha, hora, servico };
    
    // Atualiza o texto de resumo no Modal
    document.getElementById('resumo').innerHTML = `
        <strong>Serviço:</strong> ${servico}<br>
        <strong>Horário:</strong> ${hora}
    `;
    
    document.getElementById('modalConfirmacao').classList.remove('hidden');
}

// Envio final para a planilha
async function confirmarAgendamento() {
    const nome = document.getElementById('nomeCliente').value;
    const tel = document.getElementById('telCliente').value;

    if (!nome || !tel) return alert("Preencha seu nome e contato!");

    const btn = document.getElementById('btnFinalizar');
    btn.disabled = true;
    btn.innerText = "Processando...";

    const payload = {
        action: "agendarCliente",
        linha: window.agendamentoFinal.linha,
        servico: window.agendamentoFinal.servico,
        cliente: nome,
        whatsapp: tel
    };

    try {
        await fetch(URL_WEB_APP, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        });

        alert("✅ Agendamento realizado! Te esperamos lá.");
        location.reload(); // Recarrega para limpar a tela
    } catch (e) {
        alert("Erro ao agendar. Tente novamente.");
        btn.disabled = false;
    }
}

// Função para o cliente consultar o seu próprio histórico
async function consultarHistoricoCliente() {
    const whatsInput = document.getElementById('whatsConsulta').value.replace(/\D/g, '');
    const resultadoDiv = document.getElementById('resultadoConsulta');
    const corpoHistorico = document.getElementById('corpoHistorico');
    const resumoDiv = document.getElementById('resumoCliente');

    if (whatsInput.length < 10) {
        alert("Por favor, digite o seu WhatsApp com DDD.");
        return;
    }

    resumoDiv.innerHTML = "⏳ A procurar os seus dados...";
    resultadoDiv.classList.remove('hidden');

    try {
        const res = await fetch(URL_WEB_APP + "?action=read");
        const data = await res.json();
        const todosHorarios = data.horarios || [];

        // Filtra apenas pelo WhatsApp do cliente
        const historico = todosHorarios.filter(h => {
            const whatsPlanilha = String(h.whatsapp).replace(/\D/g, '');
            return whatsPlanilha === whatsInput && (h.status === "Ocupado" || h.status === "Concluído");
        });

        if (historico.length === 0) {
            resumoDiv.innerHTML = "❌ Nenhum registo encontrado para este número.";
            corpoHistorico.innerHTML = "";
            return;
        }

        // Ordenar: Próximos primeiro, depois Histórico
        historico.sort((a, b) => b.data.localeCompare(a.data));

        resumoDiv.innerHTML = `<div class="card-resumo">Olá, <strong>${historico[0].cliente}</strong>! Aqui estão os seus atendimentos:</div>`;

        corpoHistorico.innerHTML = historico.map(h => {
            const d = h.data.split('T')[0].split('-');
            const dataF = `${d[2]}/${d[1]}/${d[0]}`;
            
            // Troca visual de "Ocupado" para "Agendado"
            const statusExibicao = h.status === "Ocupado" ? "Agendado" : h.status;
            const classeStatus = h.status === "Concluído" ? "status-concluido" : "status-agendado";

            let acaoBotao = "";
            if (h.status === "Ocupado") {
                acaoBotao = `<button class="btn-cancelar-cliente" onclick="cancelarPeloCliente(${h.linha})">Desmarcar</button>`;
            } else {
                acaoBotao = `<span class="txt-off">-</span>`;
            }

            return `
                <tr>
                    <td>${dataF}<br><strong>${h.horario}</strong></td>
                    <td>${h.servico || '---'}</td>
                    <td><span class="badge-status ${classeStatus}">${statusExibicao}</span></td>
                    <td>${acaoBotao}</td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        resumoDiv.innerHTML = "❌ Erro ao ligar ao servidor.";
    }
}

// Função para o cliente cancelar o próprio horário
async function cancelarPeloCliente(linha) {
    if (!confirm("Deseja realmente cancelar este agendamento?")) return;

    const btn = event.target;
    btn.innerText = "⏳...";
    btn.disabled = true;

    try {
        await fetch(URL_WEB_APP, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: "liberarHorario", linha: linha })
        });
        
        alert("✅ Agendamento cancelado com sucesso!");
        consultarHistoricoCliente(); // Atualiza a lista
    } catch (e) {
        alert("Erro ao cancelar. Tente novamente.");
        btn.innerText = "Desmarcar";
        btn.disabled = false;
    }
}