// Web Riddle JS: a chain of JavaScript puzzles solved in pairs.
// Each lock in etapas.json is encrypted with the answer of the previous lock,
// so the page can only show a lock after the right answer is typed.

const CHAVE_ARMAZENAMENTO = "web-riddle-js:v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const el = {
  topoInfo: document.getElementById("app-topo-info"),
  equipe: document.getElementById("app-equipe"),
  tempo: document.getElementById("app-tempo"),
  progresso: document.getElementById("app-progresso"),
  boasVindas: document.getElementById("app-boas-vindas"),
  formEquipe: document.getElementById("app-form-equipe"),
  nomeEquipe: document.getElementById("app-nome-equipe"),
  grade: document.getElementById("app-grade"),
  etapa: document.getElementById("app-etapa"),
  dicas: document.getElementById("app-dicas"),
  formResposta: document.getElementById("app-form-resposta"),
  resposta: document.getElementById("app-resposta"),
  botaoAbrir: document.getElementById("app-botao-abrir"),
  mensagem: document.getElementById("app-mensagem"),
  reiniciarEtapa: document.getElementById("app-reiniciar-etapa"),
  baixar: document.getElementById("app-baixar"),
  recomecar: document.getElementById("app-recomecar"),
  codigo: document.getElementById("app-codigo"),
  executar: document.getElementById("app-executar"),
  limpar: document.getElementById("app-limpar"),
  saida: document.getElementById("app-saida"),
  mochila: document.getElementById("app-mochila"),
  carregando: document.getElementById("app-carregando"),
};

let dados = null;
let estado = estadoVazio();
let etapasAbertas = [];
let atual = 0;

function estadoVazio() {
  return { equipe: "", inicio: null, fim: null, respostas: [], erros: {}, dicas: {}, codigos: {} };
}

// ---------- Storage ----------

function carregarEstado() {
  try {
    const texto = localStorage.getItem(CHAVE_ARMAZENAMENTO);
    if (texto) {
      return { ...estadoVazio(), ...JSON.parse(texto) };
    }
  } catch (erro) {
    // Storage may be blocked; the trail still works without saving.
  }
  return estadoVazio();
}

function salvarEstado() {
  try {
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(estado));
  } catch (erro) {
    // Ignore: progress simply will not survive a reload.
  }
}

// ---------- Crypto ----------

// Must match normalizar() in the build script.
function normalizar(resposta) {
  return String(resposta)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function deBase64(texto) {
  return Uint8Array.from(atob(texto), (letra) => letra.charCodeAt(0));
}

async function decifrar(indice, senha) {
  const bloco = dados.etapas[indice];
  const base = await crypto.subtle.importKey("raw", encoder.encode(senha), "PBKDF2", false, ["deriveKey"]);
  const chave = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: deBase64(bloco.salt), iterations: dados.iteracoes, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  try {
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64(bloco.iv) }, chave, deBase64(bloco.dados));
    return JSON.parse(decoder.decode(claro));
  } catch (erro) {
    return null;
  }
}

async function sha256Hex(texto) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(texto));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ---------- Workbench (bancada) ----------

const logOriginal = console.log.bind(console);

function formatarValor(valor) {
  if (typeof valor === "string") return valor;
  if (valor instanceof Element) {
    return `<${valor.tagName.toLowerCase()}${valor.id ? ` id="${valor.id}"` : ""}>`;
  }
  if (typeof valor === "object" && valor !== null) {
    try {
      return JSON.stringify(valor);
    } catch (erro) {
      return String(valor);
    }
  }
  return String(valor);
}

function escreverSaida(texto, tipo) {
  const linha = document.createElement("div");
  linha.className = `saida-linha saida-${tipo}`;
  linha.textContent = texto;
  el.saida.append(linha);
  el.saida.scrollTop = el.saida.scrollHeight;
}

// Mirror console.log into the workbench output, including logs fired later by event listeners.
console.log = (...valores) => {
  logOriginal(...valores);
  escreverSaida(valores.map(formatarValor).join(" "), "log");
};

function explicarErro(erro) {
  const mensagem = String(erro && erro.message);
  if (erro instanceof SyntaxError) {
    return "Erro de escrita no código: confiram parênteses, chaves, aspas e vírgulas.";
  }
  if (mensagem.includes("constant variable")) {
    return "Vocês tentaram mudar o valor de uma const. Para valores que mudam, usem let.";
  }
  if (mensagem.includes("is not defined")) {
    return "Algo foi usado sem ter sido criado. Confiram o nome da variável ou da função (maiúsculas contam).";
  }
  if (mensagem.includes("Cannot read properties of null") || mensagem.includes("is null")) {
    return "getElementById não encontrou o elemento e devolveu null. Confiram o id.";
  }
  if (mensagem.includes("is not a function")) {
    return "Algo foi chamado como função, mas não é uma função. Confiram o nome e os parênteses.";
  }
  if (mensagem.includes("before initialization")) {
    return "Uma variável foi usada antes da linha em que é criada.";
  }
  return "";
}

function mostrarErro(erro) {
  escreverSaida(`${erro && erro.name ? erro.name : "Erro"}: ${erro && erro.message ? erro.message : erro}`, "erro");
  const dica = explicarErro(erro);
  if (dica) {
    escreverSaida(`Dica: ${dica}`, "dica");
  }
}

function executarCodigo() {
  salvarCodigo();
  const codigo = el.codigo.value;
  if (codigo.trim() === "") {
    escreverSaida("A bancada está vazia. Escrevam algum código antes de executar.", "info");
    return;
  }
  escreverSaida("> executando...", "info");
  try {
    // Each run gets its own scope, so let/const can be declared again on the next run.
    const resultado = new Function(codigo)();
    if (resultado !== undefined) {
      escreverSaida(`(retorno) ${formatarValor(resultado)}`, "log");
    }
  } catch (erro) {
    mostrarErro(erro);
  }
}

// Errors thrown later, inside event listeners created on the workbench.
window.addEventListener("error", (evento) => {
  mostrarErro(evento.error || evento.message);
});

function salvarCodigo() {
  estado.codigos[atual] = el.codigo.value;
  salvarEstado();
}

// ---------- Rendering ----------

function totalFechaduras() {
  return dados.totalFechaduras;
}

function maiorAberta() {
  return etapasAbertas.length - 1;
}

function formatarTempo(milissegundos) {
  const totalSegundos = Math.max(0, Math.floor(milissegundos / 1000));
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const doisDigitos = (n) => String(n).padStart(2, "0");
  return horas > 0
    ? `${horas}:${doisDigitos(minutos)}:${doisDigitos(segundos)}`
    : `${doisDigitos(minutos)}:${doisDigitos(segundos)}`;
}

function atualizarTempo() {
  if (!estado.inicio) return;
  const fim = estado.fim || Date.now();
  el.tempo.textContent = formatarTempo(fim - estado.inicio);
}

function somarValores(objeto) {
  return Object.values(objeto).reduce((soma, valor) => soma + valor, 0);
}

function renderizarProgresso() {
  el.progresso.innerHTML = "";
  for (let i = 0; i <= totalFechaduras(); i++) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "passo";
    const ehFinal = i === totalFechaduras();
    botao.textContent = ehFinal ? "Fim" : String(i);
    const aberta = i <= maiorAberta();
    const resolvida = i < maiorAberta();
    if (resolvida) botao.classList.add("resolvida");
    if (i === atual) {
      botao.classList.add("atual");
      botao.setAttribute("aria-current", "step");
    }
    botao.disabled = !aberta;
    botao.setAttribute(
      "aria-label",
      ehFinal ? "Tela final" : `Fechadura ${i}${resolvida ? ", aberta" : aberta ? ", atual" : ", trancada"}`,
    );
    botao.addEventListener("click", () => {
      salvarCodigo();
      atual = i;
      renderizar();
    });
    el.progresso.append(botao);
  }
}

function renderizarMochila() {
  el.mochila.innerHTML = "";
  if (estado.respostas.length === 0) {
    const item = document.createElement("li");
    item.className = "vazia";
    item.textContent = "Nenhuma pista ainda.";
    el.mochila.append(item);
    return;
  }
  estado.respostas.forEach((resposta, i) => {
    const item = document.createElement("li");
    item.value = i;
    const rotulo = document.createElement("span");
    rotulo.textContent = `Fechadura ${i}: `;
    const valor = document.createElement("code");
    valor.textContent = resposta;
    item.append(rotulo, valor);
    el.mochila.append(item);
  });
}

function renderizarDicas(etapa) {
  el.dicas.innerHTML = "";
  if (!etapa.dicas || etapa.dicas.length === 0) return;
  const usadas = estado.dicas[atual] || 0;

  etapa.dicas.forEach((dica, i) => {
    if (i < usadas) {
      const bloco = document.createElement("div");
      bloco.className = "dica";
      bloco.innerHTML = `<p class="dica-titulo">Dica ${i + 1}</p>${dica}`;
      el.dicas.append(bloco);
    }
  });

  if (usadas < etapa.dicas.length) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao";
    botao.textContent = `Ver dica ${usadas + 1} de ${etapa.dicas.length}`;
    botao.addEventListener("click", () => {
      estado.dicas[atual] = usadas + 1;
      salvarEstado();
      renderizarDicas(etapa);
    });
    el.dicas.append(botao);
  }
}

function renderizarResumoFinal() {
  const resumo = document.createElement("dl");
  resumo.className = "resumo-final";
  const linhas = [
    ["Dupla", estado.equipe],
    ["Tempo total", formatarTempo((estado.fim || Date.now()) - estado.inicio)],
    ["Tentativas erradas", String(somarValores(estado.erros))],
    ["Dicas usadas", String(somarValores(estado.dicas))],
  ];
  linhas.forEach(([rotulo, valor]) => {
    const termo = document.createElement("dt");
    termo.textContent = rotulo;
    const descricao = document.createElement("dd");
    // textContent: the team name was typed by the user, so it must never be read as HTML.
    descricao.textContent = valor;
    resumo.append(termo, descricao);
  });
  el.etapa.append(resumo);
}

function rodarSetup(etapa) {
  if (!etapa.setup) return;
  const pistaAnterior = atual > 0 ? estado.respostas[atual - 1] : "";
  try {
    new Function("pista", "raiz", etapa.setup)(pistaAnterior, el.etapa);
  } catch (erro) {
    logOriginal("Falha ao preparar a etapa", erro);
  }
}

function renderizar() {
  const etapa = etapasAbertas[atual];
  const ehFinal = atual === totalFechaduras();
  const resolvida = atual < maiorAberta();

  el.etapa.innerHTML = `
    <p class="rotulo">${ehFinal ? "Trilha concluída" : `Fechadura ${atual} de ${totalFechaduras() - 1}`}</p>
    <h2 id="app-titulo-etapa" tabindex="-1">${etapa.titulo}</h2>
    ${etapa.conceitos.length ? `<ul class="conceitos">${etapa.conceitos.map((c) => `<li>${c}</li>`).join("")}</ul>` : ""}
    <div class="historia">${etapa.historia}</div>
    <div class="desafio">${etapa.desafio}</div>`;

  if (ehFinal) {
    renderizarResumoFinal();
  }

  rodarSetup(etapa);
  renderizarDicas(etapa);

  el.formResposta.hidden = ehFinal;
  el.reiniciarEtapa.hidden = ehFinal;
  el.mensagem.textContent = "";
  el.mensagem.dataset.status = "";
  if (resolvida) {
    el.resposta.value = estado.respostas[atual];
    el.resposta.disabled = true;
    el.botaoAbrir.disabled = true;
    el.mensagem.textContent = "Fechadura já aberta.";
    el.mensagem.dataset.status = "success";
  } else {
    el.resposta.value = "";
    el.resposta.disabled = false;
    el.botaoAbrir.disabled = false;
    el.resposta.placeholder = etapa.formato ? `Formato: ${etapa.formato.toLowerCase()}` : "";
  }

  el.codigo.value = estado.codigos[atual] || "";
  renderizarProgresso();
  renderizarMochila();
}

function mostrarMensagem(texto, status, comoHtml) {
  if (comoHtml) {
    el.mensagem.innerHTML = texto;
  } else {
    el.mensagem.textContent = texto;
  }
  el.mensagem.dataset.status = status;
}

// ---------- Flow ----------

async function tentarAbrir(evento) {
  evento.preventDefault();
  const indice = atual;
  if (indice !== maiorAberta() || indice >= totalFechaduras()) return;

  const tentativa = normalizar(el.resposta.value);
  if (tentativa === "") {
    mostrarMensagem("Digitem a pista antes de tentar abrir.", "error");
    el.resposta.focus();
    return;
  }

  el.botaoAbrir.disabled = true;
  mostrarMensagem("Testando a chave...", "info");
  const proxima = await decifrar(indice + 1, tentativa);
  el.botaoAbrir.disabled = false;

  if (proxima) {
    salvarCodigo();
    estado.respostas[indice] = tentativa;
    etapasAbertas[indice + 1] = proxima;
    if (indice + 1 === totalFechaduras()) {
      estado.fim = Date.now();
    }
    salvarEstado();
    atual = indice + 1;
    renderizar();
    escreverSaida(`Fechadura ${indice} aberta!`, "sucesso");
    document.getElementById("app-titulo-etapa").focus();
    return;
  }

  estado.erros[indice] = (estado.erros[indice] || 0) + 1;
  salvarEstado();

  const etapa = etapasAbertas[indice];
  const hash = await sha256Hex(`${etapa.tag}|${tentativa}`);
  const armadilha = (etapa.armadilhas || []).find((item) => item.h === hash);
  if (armadilha) {
    mostrarMensagem(armadilha.msg, "warning", true);
  } else {
    mostrarMensagem("Essa pista não abre a fechadura. Releiam o enunciado e testem o código de novo.", "error");
  }
}

async function iniciarTrilha() {
  el.boasVindas.hidden = true;
  el.carregando.hidden = false;
  el.carregando.textContent = "Abrindo as fechaduras já resolvidas...";

  etapasAbertas = [];
  const primeira = await decifrar(0, "");
  etapasAbertas.push(primeira);

  // Replay saved answers; stop at the first one that no longer opens a lock.
  for (let i = 0; i < estado.respostas.length; i++) {
    const proxima = await decifrar(i + 1, estado.respostas[i]);
    if (!proxima) {
      estado.respostas = estado.respostas.slice(0, i);
      salvarEstado();
      break;
    }
    etapasAbertas.push(proxima);
  }

  atual = maiorAberta();
  el.equipe.textContent = estado.equipe;
  el.carregando.hidden = true;
  el.topoInfo.hidden = false;
  el.progresso.hidden = false;
  el.grade.hidden = false;
  renderizar();
  atualizarTempo();
}

function baixarCodigo() {
  salvarCodigo();
  let arquivo = `// Web Riddle JS - soluções da dupla ${estado.equipe}\n`;
  for (let i = 0; i < etapasAbertas.length; i++) {
    const codigo = estado.codigos[i];
    if (!codigo || codigo.trim() === "") continue;
    arquivo += `\n// ===== ${etapasAbertas[i].titulo} =====\n`;
    if (estado.respostas[i]) {
      arquivo += `// Pista encontrada: ${estado.respostas[i]}\n`;
    }
    arquivo += `${codigo.trim()}\n`;
  }
  const nome = normalizar(estado.equipe).replace(/[^a-z0-9-]/g, "") || "dupla";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([arquivo], { type: "text/javascript" }));
  link.download = `trilha-${nome}.js`;
  link.click();
  URL.revokeObjectURL(link.href);
}

let confirmarRecomeco = null;

function recomecar() {
  if (!confirmarRecomeco) {
    el.recomecar.textContent = "Clique de novo para apagar tudo";
    confirmarRecomeco = setTimeout(() => {
      el.recomecar.textContent = "Recomeçar a trilha";
      confirmarRecomeco = null;
    }, 4000);
    return;
  }
  clearTimeout(confirmarRecomeco);
  try {
    localStorage.removeItem(CHAVE_ARMAZENAMENTO);
  } catch (erro) {
    // Nothing to remove.
  }
  location.reload();
}

// ---------- Events ----------

el.formEquipe.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const nome = el.nomeEquipe.value.trim();
  if (nome === "") {
    el.nomeEquipe.focus();
    return;
  }
  estado = estadoVazio();
  estado.equipe = nome;
  estado.inicio = Date.now();
  salvarEstado();
  iniciarTrilha();
});

el.formResposta.addEventListener("submit", tentarAbrir);
el.executar.addEventListener("click", executarCodigo);
el.limpar.addEventListener("click", () => {
  el.saida.innerHTML = "";
});
el.reiniciarEtapa.addEventListener("click", () => {
  salvarCodigo();
  renderizar();
  escreverSaida("Etapa reiniciada: a página da fechadura foi recriada, sem ouvintes antigos.", "info");
});
el.baixar.addEventListener("click", baixarCodigo);
el.recomecar.addEventListener("click", recomecar);

el.codigo.addEventListener("input", () => {
  estado.codigos[atual] = el.codigo.value;
});
el.codigo.addEventListener("blur", salvarCodigo);
el.codigo.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
    evento.preventDefault();
    executarCodigo();
    return;
  }
  // Tab inserts two spaces instead of leaving the editor. Esc then Tab leaves it.
  if (evento.key === "Tab" && !evento.shiftKey && !el.codigo.dataset.sair) {
    evento.preventDefault();
    const inicio = el.codigo.selectionStart;
    const fim = el.codigo.selectionEnd;
    el.codigo.setRangeText("  ", inicio, fim, "end");
  }
  if (evento.key === "Escape") {
    el.codigo.dataset.sair = "1";
  } else if (evento.key !== "Tab") {
    delete el.codigo.dataset.sair;
  }
});

setInterval(atualizarTempo, 1000);

// ---------- Start ----------

async function iniciar() {
  if (!window.crypto || !crypto.subtle) {
    el.carregando.textContent = "Este navegador não liberou a criptografia da página. Abram a trilha pelo endereço https publicado.";
    return;
  }
  try {
    const resposta = await fetch("etapas.json", { cache: "no-store" });
    dados = await resposta.json();
  } catch (erro) {
    el.carregando.textContent = "Não foi possível carregar a trilha. Abram a página pelo endereço publicado (https), não pelo arquivo local.";
    return;
  }

  estado = carregarEstado();
  if (estado.equipe) {
    await iniciarTrilha();
  } else {
    el.carregando.hidden = true;
    el.boasVindas.hidden = false;
    el.nomeEquipe.focus();
  }
}

iniciar();
