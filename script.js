// ATENÇÃO: Substitua pela sua URL final do Google Apps Script se for diferente
const URL_WEB_APP = "https://script.google.com/macros/s/AKfycbyWCgK2M0giR42Wr_4oNsCvBmw_r4iLFTyT6bb9ZOGxJ12rQ1pQCCHaB9Qo-QK41-v0ww/exec"; 

let linhaSelecionada = null; 

// 1. Inicialização ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    configurarCalendario();
    carregarServicos();
    buscarDisponibilidade(); // Se você quiser que carregue hoje automaticamente

    // Aplica máscara nos dois campos de telefone (agendamento e consulta)
    aplicarMascaraTelefone('telCliente');   
    aplicarMascaraTelefone('whatsConsulta');
});

// 2. Configura a data mínima como hoje
function configurarCalendario() {
    const inputData = document.getElementById('dataCliente');
    if (!inputData) return;

    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const dataIso = `${ano}-${mes}-${dia}`;

    inputData.setAttribute('min', dataIso);
    inputData.value = dataIso; // Garante que o valor inicial seja HOJE
}

// 3. Carrega os serviços do Back-end (Google Sheets)
async function carregarServicos() {
    const select = document.getElementById('servicoCliente');
    if (!select) return;

    try {
        const response = await fetch(`${URL_WEB_APP}?action=getServicos`);
        const resultado = await response.json(); 
        const listaDeServicos = resultado.servicos || []; 

        if (listaDeServicos.length === 0) {
            select.innerHTML = '<option value="">Nenhum serviço disponível</option>';
            return;
        }

        select.innerHTML = '<option value="" disabled selected>Selecione um serviço...</option>' + 
            listaDeServicos.map(s => `<option value="${s}">${s}</option>`).join('');
            
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
        select.innerHTML = '<option value="">Erro ao carregar serviços</option>';
    }
}

// 4. Busca horários e filtra horários passados
async function buscarDisponibilidade() {
    const inputData = document.getElementById('dataCliente');
    const listaHtml = document.getElementById('listaHorarios');
    
    if (!inputData || !inputData.value) return;
    const dataSelecionada = inputData.value;

    listaHtml.innerHTML = `
        <div class="loading-skeleton"></div>
        <div class="loading-skeleton"></div>
        <div class="loading-skeleton"></div>
    `;

    try {
        const response = await fetch(`${URL_WEB_APP}?action=read`);
        const resultado = await response.json();
        const todosHorarios = resultado.horarios || [];

        // --- LÓGICA DE MARGEM DE SEGURANÇA ---
        const agora = new Date();
        const hojeLocal = agora.getFullYear() + "-" + 
                          String(agora.getMonth() + 1).padStart(2, '0') + "-" + 
                          String(agora.getDate()).padStart(2, '0');
        
        // Criamos uma nova data somando 30 minutos ao horário atual
        const tempoComMargem = new Date(agora.getTime() + 20 * 60000); 
        const horaLimite = String(tempoComMargem.getHours()).padStart(2, '0') + ":" + 
                           String(tempoComMargem.getMinutes()).padStart(2, '0');

        const disponiveis = todosHorarios.filter(item => {
            const dataLimpa = item.data.split('T')[0]; 
            const ehDisponivel = item.status === "Disponível";
            const ehMesmaData = dataLimpa === dataSelecionada;

            if (ehMesmaData && ehDisponivel) {
                // Se o cliente quer agendar para HOJE
                if (dataSelecionada === hojeLocal) {
                    // Só mostra se o horário do agendamento for MAIOR que a hora atual + 30min
                    return item.horario > horaLimite;
                }
                return true; // Para outros dias, mostra tudo o que estiver disponível
            }
            return false;
        });

        if (disponiveis.length === 0) {
            listaHtml.innerHTML = "<p class='erro'>Sem horários disponíveis para hoje.</p>";
            return;
        }

        listaHtml.innerHTML = disponiveis.map(h => `
            <button class="btn-hora" onclick="marcarEPreparar(this, '${h.linha}', '${h.horario}')">
                ${h.horario}
            </button>
        `).join('');

    } catch (error) {
        console.error("Erro detalhes:", error);
        listaHtml.innerHTML = "<p class='erro'>Erro ao carregar horários.</p>";
    }
}

// 5. Seleção visual do horário
function marcarEPreparar(btn, linha, horario) {
    document.querySelectorAll('.btn-hora').forEach(b => b.classList.remove('selecionado'));
    btn.classList.add('selecionado');
    linhaSelecionada = linha; 
    prepararAgendamento(linha, horario);
}

// 6. Prepara o modal de agendamento
function prepararAgendamento(linha, hora) {
    const campoServico = document.getElementById('servicoCliente');
    if (!campoServico || !campoServico.value) {
        alert("⚠️ Por favor, selecione primeiro o serviço desejado.");
        document.querySelectorAll('.btn-hora').forEach(b => b.classList.remove('selecionado'));
        return;
    }
    
    const resumoDiv = document.getElementById('resumo');
    if (resumoDiv) {
        resumoDiv.innerHTML = `
            <strong>Serviço:</strong> ${campoServico.value}<br>
            <strong>Horário:</strong> ${hora}
        `;
    }
    
    const modal = document.getElementById('modalConfirmacao');
    if (modal) modal.classList.remove('hidden');
}

// 7. Envia o agendamento (Limpando o WhatsApp)
async function confirmarAgendamento() {
    const nome = document.getElementById('nomeCliente').value;
    const telComMascara = document.getElementById('telCliente').value;
    const servico = document.getElementById('servicoCliente').value;
    const nascimento = document.getElementById('nascCliente').value; // Novo campo de segurança
    const btn = document.getElementById('btnFinalizar');

    const telLimpo = telComMascara.replace(/\D/g, "");

    // Validação rigorosa
    if (!nome || telLimpo.length < 10 || !servico || !nascimento) {
        alert("Por favor, preencha todos os campos, incluindo a sua Data de Nascimento para segurança.");
        return;
    }

    btn.innerText = "⏳ Finalizando...";
    btn.disabled = true;

    const dados = {
        action: "agendarCliente",
        linha: linhaSelecionada,
        cliente: nome,
        whatsapp: telLimpo,
        servico: servico,
        nascimento: nascimento // Enviado para a nova coluna na planilha
    };

    try {
        await fetch(URL_WEB_APP, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(dados)
        });

        const dataInput = document.getElementById('dataCliente').value;
        const [ano, mes, dia] = dataInput.split('-');
        const dataFormatada = `${dia}/${mes}/${ano}`;
        const resumoTexto = document.getElementById('resumo').innerText; 
        const horaAgendada = resumoTexto.split('Horário:')[1]?.trim() || "";

        alert("✅ Agendamento realizado com sucesso!");

        // Sugestão de Calendário
        if (confirm("Deseja salvar este horário na agenda do seu telemóvel?")) {
            gerarLinkCalendario(nome, servico, dataInput, horaAgendada);
        }

        // WhatsApp
        const textoMsg = `✅ *AGENDAMENTO CONFIRMADO*\n\n👤 *Cliente:* ${nome}\n✂️ *Serviço:* ${servico}\n📅 *Data:* ${dataFormatada}\n⏰ *Horário:* ${horaAgendada}\n\n_Segurança: Acesso à consulta via Data de Nascimento._`;
        const linkWhats = `https://wa.me/55${telLimpo}?text=${encodeURIComponent(textoMsg)}`;
        window.open(linkWhats, '_blank');

        fecharModal();
        buscarDisponibilidade();

    } catch (e) {
        alert("Erro ao gravar dados. Tente novamente.");
    } finally {
        btn.innerText = "Confirmar Agendamento";
        btn.disabled = false;
    }
}

// 8. Consulta de histórico (Comparação sem caracteres especiais)
async function consultarHistoricoCliente() {
    const whatsField = document.getElementById('whatsConsulta');
    const nascField = document.getElementById('nascConsulta');
    const resultadoDiv = document.getElementById('resultadoConsulta');
    const corpoHistorico = document.getElementById('corpoHistorico');
    const resumoDiv = document.getElementById('resumoCliente');

    // Limpa o número para comparar apenas dígitos
    const whatsLimpo = whatsField.value.replace(/\D/g, '');
    const nascValor = nascField.value; // Formato YYYY-MM-DD

    if (whatsLimpo.length < 10 || !nascValor) {
        alert("⚠️ Informe o WhatsApp e a Data de Nascimento para acessar.");
        return;
    }

    resumoDiv.innerHTML = "⏳ Verificando identidade...";
    resultadoDiv.classList.remove('hidden');
    corpoHistorico.innerHTML = "";

    try {
        const response = await fetch(`${URL_WEB_APP}?action=read`);
        const data = await response.json();
        const todos = data.horarios || [];

        // Filtro Seguro: WhatsApp E Nascimento
        const meusAgendamentos = todos.filter(h => {
            const whatsPlanilha = String(h.whatsapp).replace(/\D/g, '');
            const nascPlanilha = h.nascimento ? h.nascimento.split('T')[0] : "";
            return whatsPlanilha === whatsLimpo && nascPlanilha === nascValor;
        });

        if (meusAgendamentos.length === 0) {
            resumoDiv.innerHTML = "❌ Dados não conferem ou nenhum registro encontrado.";
            return;
        }

        resumoDiv.innerHTML = `<div class="card-resumo">Olá, <b>${meusAgendamentos[0].cliente}</b>! Aqui está seu histórico:</div>`;

        corpoHistorico.innerHTML = meusAgendamentos.map(h => {
            const dataF = h.data.split('T')[0].split('-').reverse().join('/');
            const statusClasse = h.status === "Ocupado" ? "status-azul" : "status-verde";
            const acao = h.status === "Ocupado" ? 
                `<button class="btn-cancelar-cliente" onclick="cancelarPeloCliente(${h.linha})">Desmarcar</button>` : "-";

            return `
                <tr>
                    <td>${dataF}<br><b>${h.horario}</b></td>
                    <td>${h.servico || '---'}</td>
                    <td><span class="badge-status ${statusClasse}">${h.status === 'Ocupado' ? 'Agendado' : h.status}</span></td>
                    <td>${acao}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error(error);
        resumoDiv.innerHTML = "❌ Erro ao conectar com o servidor.";
    }
}

// 9. Cancela o horário (Botão Desmarcar)
async function cancelarPeloCliente(linha) {
    if (!confirm("Deseja desmarcar este horário?")) return;

    try {
        await fetch(URL_WEB_APP, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: "liberarHorario", linha: linha })
        });
        
        alert("✅ Cancelado!");
        consultarHistoricoCliente(); 
    } catch (e) {
        alert("Erro ao cancelar.");
    }
}

// 10. Função de Máscara (00) 00000-0000
function aplicarMascaraTelefone(id) {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, "");
        if (v.length > 11) v = v.slice(0, 11);

        if (v.length > 10) {
            v = v.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
        } else if (v.length > 5) {
            v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
        } else if (v.length > 2) {
            v = v.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
        } else if (v.length > 0) {
            v = v.replace(/^(\d*)/, "($1");
        }
        e.target.value = v;
    });
}

// Auxiliar para fechar modal
function fecharModal() {
    const m = document.getElementById('modalConfirmacao');
    if (m) m.classList.add('hidden');
}


function gerarLinkCalendario(nome, servico, dataISO, hora) {
    // dataISO vem como "2024-10-25"
    // hora vem como "14:30"
    const dataInicio = dataISO.replace(/-/g, '') + 'T' + hora.replace(':', '') + '00';
    
    // Define o fim do evento (ex: 1 hora depois)
    const [h, m] = hora.split(':');
    const horaFimNum = parseInt(h) + 1;
    const horaFimStr = String(horaFimNum).padStart(2, '0') + m + '00';
    const dataFim = dataISO.replace(/-/g, '') + 'T' + horaFimStr;

    const titulo = encodeURIComponent(`✂️ Barbearia: ${servico}`);
    const detalhes = encodeURIComponent(`Cliente: ${nome}\nServiço: ${servico}\nLocal: Barbearia Premium`);

    // 1. Link para Google Calendar (Android/Web)
    const googleUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${dataInicio}/${dataFim}&details=${detalhes}&location=Barbearia+Premium&sf=true&output=xml`;

    // 2. Formato iCal para Apple/Outlook (iOS)
    const icalData = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        `DTSTART:${dataInicio}`,
        `DTEND:${dataFim}`,
        `SUMMARY:${decodeURIComponent(titulo)}`,
        `DESCRIPTION:${decodeURIComponent(detalhes)}`,
        "LOCATION:Barbearia Premium",
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\n");

    // Detecta se é iOS/Apple
    const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

    if (isApple) {
        const blob = new Blob([icalData], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = "agendamento.ics";
        link.click();
    } else {
        window.open(googleUrl, '_blank');
    }
}
