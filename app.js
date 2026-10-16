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
  cartaoEtapa: document.getElementById("app-cartao-etapa"),
  linhaResposta: document.getElementById("app-linha-resposta"),
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
  formRestaurar: document.getElementById("app-form-restaurar"),
  codigoRestaurar: document.getElementById("app-codigo-restaurar"),
  mensagemRestaurar: document.getElementById("app-mensagem-restaurar"),
  gerarCodigo: document.getElementById("app-gerar-codigo"),
  painelCodigo: document.getElementById("app-painel-codigo"),
  textoPainelCodigo: document.getElementById("app-texto-painel-codigo"),
  codigoProgresso: document.getElementById("app-codigo-progresso"),
  copiarCodigo: document.getElementById("app-copiar-codigo"),
  statusCopia: document.getElementById("app-status-copia"),
};

let dados = null;
let estado = estadoVazio();
let etapasAbertas = [];
let atual = 0;

function estadoVazio() {
  return { equipe: "", inicio: null, fim: null, respostas: [], aberturas: {}, erros: {}, dicas: {}, codigos: {} };
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

// ---------- Progress code ----------
// A portable snapshot of the trail: team, times, answers, errors, hints and
// workbench code. It restores progress on another browser and is what the
// pair sends to the teacher. Format: "WRJS1." + base64url(flag + seal + body).
// The seal only catches accidental edits; anyone reading this file can forge
// one. The teacher page checks the answers themselves, which cannot be faked
// without solving the locks. Keep this block in sync with professor/placar.html.

const PREFIXO_CODIGO = "WRJS1.";
const PIMENTA_SELO = "web-riddle-js|selo|v1";
const TAMANHO_SELO = 12;
const LIMITE_CODIGO_BANCADA = 4000;

function paraBase64Url(bytes) {
  let binario = "";
  bytes.forEach((byte) => {
    binario += String.fromCharCode(byte);
  });
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto) {
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  return deBase64(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
}

async function transformar(bytes, fluxo) {
  const resposta = new Response(new Blob([bytes]).stream().pipeThrough(fluxo));
  return new Uint8Array(await resposta.arrayBuffer());
}

async function calcularSelo(json) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(`${PIMENTA_SELO}|${json}`));
  return new Uint8Array(hash).slice(0, TAMANHO_SELO);
}

function segundosDesdeInicio(momento) {
  return typeof momento === "number" ? Math.round((momento - estado.inicio) / 1000) : null;
}

function montarRegistro() {
  const total = totalFechaduras();
  const porFechadura = (objeto) => Array.from({ length: total }, (_, i) => objeto[i] || 0);
  return {
    v: 1,
    e: estado.equipe,
    i: estado.inicio,
    f: segundosDesdeInicio(estado.fim),
    g: segundosDesdeInicio(Date.now()),
    r: estado.respostas,
    a: estado.respostas.map((_, i) => segundosDesdeInicio(estado.aberturas[i])),
    x: porFechadura(estado.erros),
    d: porFechadura(estado.dicas),
    c: Array.from({ length: total + 1 }, (_, i) => String(estado.codigos[i] || "").slice(0, LIMITE_CODIGO_BANCADA)),
  };
}

async function gerarCodigoProgresso() {
  const json = JSON.stringify(montarRegistro());
  const corpo = encoder.encode(json);
  const compactar = typeof CompressionStream === "function";
  const conteudo = compactar ? await transformar(corpo, new CompressionStream("deflate-raw")) : corpo;
  const pacote = new Uint8Array(1 + TAMANHO_SELO + conteudo.length);
  pacote[0] = compactar ? 1 : 0;
  pacote.set(await calcularSelo(json), 1);
  pacote.set(conteudo, 1 + TAMANHO_SELO);
  return PREFIXO_CODIGO + paraBase64Url(pacote);
}

// Returns the decoded record, or throws an Error with a message for the pair.
async function lerCodigoProgresso(texto) {
  const limpo = String(texto).replace(/\s+/g, "");
  if (!limpo.startsWith(PREFIXO_CODIGO)) {
    throw new Error("Este não é um código de progresso.");
  }
  let pacote;
  try {
    pacote = deBase64Url(limpo.slice(PREFIXO_CODIGO.length));
  } catch (erro) {
    throw new Error("Código inválido. Copiem de novo, completo.");
  }
  let json;
  try {
    const conteudo = pacote.slice(1 + TAMANHO_SELO);
    const corpo = pacote[0] === 1 ? await transformar(conteudo, new DecompressionStream("deflate-raw")) : conteudo;
    json = decoder.decode(corpo);
  } catch (erro) {
    throw new Error("Código incompleto. Copiem de novo, completo.");
  }
  const selo = await calcularSelo(json);
  const seloRecebido = pacote.slice(1, 1 + TAMANHO_SELO);
  if (!selo.every((byte, i) => byte === seloRecebido[i])) {
    throw new Error("Código alterado ou incompleto.");
  }
  return JSON.parse(json);
}

function estadoDoRegistro(registro) {
  const novo = estadoVazio();
  const momento = (segundos) => (typeof segundos === "number" ? registro.i + segundos * 1000 : null);
  novo.equipe = String(registro.e || "").slice(0, 30);
  novo.inicio = registro.i;
  novo.fim = momento(registro.f);
  novo.respostas = (registro.r || []).map(String);
  (registro.a || []).forEach((segundos, i) => {
    if (typeof segundos === "number") novo.aberturas[i] = momento(segundos);
  });
  (registro.x || []).forEach((valor, i) => {
    if (valor) novo.erros[i] = valor;
  });
  (registro.d || []).forEach((valor, i) => {
    if (valor) novo.dicas[i] = valor;
  });
  (registro.c || []).forEach((codigo, i) => {
    if (codigo) novo.codigos[i] = codigo;
  });
  return novo;
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
  if (erro && erro.name === NOME_ERRO_LACO) {
    return "A condição do laço nunca ficou falsa. Confiram se a variável testada na condição muda dentro do laço: em while (x !== 1), x precisa mudar a cada volta.";
  }
  return "";
}

// ---------- Infinite-loop guard ----------
// The workbench runs on the page's own thread, so an endless loop would freeze the tab.
// Before running, every while/for condition gets a call to __guarda(), which throws once
// the current synchronous run has looped for longer than LIMITE_LACO_MS.

const LIMITE_LACO_MS = 2000;
const NOME_ERRO_LACO = "Laço sem fim";

function criarGuarda() {
  let inicio = null;
  let voltas = 0;
  return function __guarda() {
    if (inicio === null) {
      inicio = Date.now();
      // Reset after the current synchronous chunk, so loops inside later click handlers get their own budget.
      queueMicrotask(() => {
        inicio = null;
      });
    }
    voltas++;
    if (voltas % 1000 === 0 && Date.now() - inicio > LIMITE_LACO_MS) {
      inicio = null;
      const erro = new Error(`a bancada interrompeu o código depois de ${LIMITE_LACO_MS / 1000} segundos.`);
      erro.name = NOME_ERRO_LACO;
      throw erro;
    }
    return true;
  };
}

// Returns the index right after the string, template or comment starting at i, or -1.
function pularLiteral(codigo, i) {
  const c = codigo[i];
  if (c === "/" && codigo[i + 1] === "/") {
    const fim = codigo.indexOf("\n", i);
    return fim === -1 ? codigo.length : fim;
  }
  if (c === "/" && codigo[i + 1] === "*") {
    const fim = codigo.indexOf("*/", i + 2);
    return fim === -1 ? codigo.length : fim + 2;
  }
  if (c === '"' || c === "'" || c === "`") {
    let j = i + 1;
    while (j < codigo.length && codigo[j] !== c) {
      j += codigo[j] === "\\" ? 2 : 1;
    }
    return j + 1;
  }
  return -1;
}

// Finds the ")" matching the "(" at abre; also collects the top-level ";" inside it.
function fecharParenteses(codigo, abre) {
  const separadores = [];
  let profundidade = 0;
  let i = abre;
  while (i < codigo.length) {
    const depois = pularLiteral(codigo, i);
    if (depois !== -1) {
      i = depois;
      continue;
    }
    const c = codigo[i];
    if (c === "(" || c === "[" || c === "{") {
      profundidade++;
    } else if (c === ")" || c === "]" || c === "}") {
      profundidade--;
      if (profundidade === 0) {
        return { fecha: i, separadores };
      }
    } else if (c === ";" && profundidade === 1) {
      separadores.push(i);
    }
    i++;
  }
  return null;
}

function instrumentarLacos(codigo) {
  const insercoes = [];
  let i = 0;
  while (i < codigo.length) {
    const depois = pularLiteral(codigo, i);
    if (depois !== -1) {
      i = depois;
      continue;
    }
    const palavra = /^(while|for)\b/.exec(codigo.slice(i, i + 6));
    const anterior = codigo[i - 1] || "";
    if (palavra && !/[\w$.]/.test(anterior)) {
      const abre = codigo.slice(i + palavra[1].length).search(/\S/) + i + palavra[1].length;
      const parenteses = codigo[abre] === "(" ? fecharParenteses(codigo, abre) : null;
      if (parenteses && palavra[1] === "while") {
        insercoes.push([abre + 1, "__guarda() && ("], [parenteses.fecha, ")"]);
      } else if (parenteses && parenteses.separadores.length === 2) {
        // for (inicio; condicao; passo): for...of and for...in have no ";" and stay untouched.
        const [primeiro, segundo] = parenteses.separadores;
        if (codigo.slice(primeiro + 1, segundo).trim() === "") {
          insercoes.push([segundo, "__guarda()"]);
        } else {
          insercoes.push([primeiro + 1, "__guarda() && ("], [segundo, ")"]);
        }
      }
      i += palavra[1].length;
      continue;
    }
    i++;
  }
  let resultado = codigo;
  for (const [posicao, texto] of insercoes.sort((a, b) => b[0] - a[0])) {
    resultado = resultado.slice(0, posicao) + texto + resultado.slice(posicao);
  }
  return resultado;
}

// Compiles the student's code with the guard; falls back to the original code if instrumenting fails.
function compilarComGuarda(codigo) {
  try {
    const funcao = new Function("__guarda", instrumentarLacos(codigo));
    const guarda = criarGuarda();
    return () => funcao(guarda);
  } catch (erro) {
    return new Function(codigo);
  }
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
    escreverSaida("A bancada está vazia.", "info");
    return;
  }
  escreverSaida("> executando...", "info");
  try {
    // Each run gets its own scope, so let/const can be declared again on the next run.
    const resultado = compilarComGuarda(codigo)();
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

// Icon per lock index (Tabler sprite in index.html); the last entry is the final screen.
const ICONES_FECHADURA = ["door", "settings", "route", "gauge", "note", "calculator", "robot", "shield-lock", "trophy"];

function icone(nome) {
  return `<svg class="icone" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
}

// Index of a lock opened a moment ago, so the next render can animate it once.
let recemAberta = null;

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
    const ehFinal = i === totalFechaduras();
    const aberta = i <= maiorAberta();
    const resolvida = i < maiorAberta();
    if (i > 0) {
      const elo = document.createElement("span");
      elo.className = aberta ? "elo feito" : "elo";
      elo.setAttribute("aria-hidden", "true");
      el.progresso.append(elo);
    }
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "passo";
    let nomeIcone = resolvida ? "lock-open" : aberta ? "key" : "lock";
    if (ehFinal) nomeIcone = aberta ? "trophy" : "flag";
    botao.innerHTML = `<span class="passo-anel">${icone(nomeIcone)}</span><span class="passo-num">${ehFinal ? "Fim" : i}</span>`;
    if (resolvida) botao.classList.add("resolvida");
    if (recemAberta !== null && i === recemAberta) botao.classList.add("estalo");
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
    item.innerHTML = icone("key");
    const rotulo = document.createElement("span");
    rotulo.textContent = `Fechadura ${i}`;
    const valor = document.createElement("code");
    valor.textContent = resposta;
    item.append(rotulo, valor);
    el.mochila.append(item);
  });
}

function renderizarDicas(etapa, revelada) {
  el.dicas.innerHTML = "";
  if (!etapa.dicas || etapa.dicas.length === 0) return;
  const usadas = estado.dicas[atual] || 0;

  etapa.dicas.forEach((dica, i) => {
    if (i < usadas) {
      const bloco = document.createElement("div");
      bloco.className = i === revelada ? "dica nova" : "dica";
      bloco.innerHTML = `<p class="dica-titulo">${icone("bulb")}Dica ${i + 1}</p>${dica}`;
      el.dicas.append(bloco);
    }
  });
  soltarBalaoOrfao();
  aplicarGlossario(el.dicas);

  if (usadas < etapa.dicas.length) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao";
    botao.innerHTML = `${icone("bulb")}<span>Ver dica ${usadas + 1} de ${etapa.dicas.length}</span>`;
    botao.addEventListener("click", () => {
      estado.dicas[atual] = usadas + 1;
      salvarEstado();
      renderizarDicas(etapa, usadas);
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

  fecharBalao();
  el.etapa.innerHTML = `
    <div class="etapa-cabeca">
      <span class="placa" aria-hidden="true">${icone(ICONES_FECHADURA[atual] || "lock")}${ehFinal ? "" : `<span class="placa-num">${atual}</span>`}</span>
      <div>
        <p class="rotulo">${ehFinal ? "Trilha concluída" : `Fechadura ${atual} de ${totalFechaduras() - 1}`}</p>
        <h2 id="app-titulo-etapa" tabindex="-1">${etapa.titulo}</h2>
      </div>
    </div>
    ${etapa.conceitos.length ? `<ul class="conceitos">${etapa.conceitos.map((c) => `<li>${c}</li>`).join("")}</ul>` : ""}
    <div class="historia">${etapa.historia}</div>
    <div class="desafio">${etapa.desafio}</div>`;

  if (ehFinal) {
    renderizarResumoFinal();
  }

  rodarSetup(etapa);
  aplicarGlossario(el.etapa);
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

  el.cartaoEtapa.classList.toggle("recem-aberta", recemAberta !== null);
  recemAberta = null;

  // The final screen always shows the code to send; elsewhere it stays open
  // only if the pair asked for it, and is refreshed so it is never stale.
  if (ehFinal || !el.painelCodigo.hidden) {
    mostrarPainelCodigo();
  }
}

async function mostrarPainelCodigo() {
  salvarCodigo();
  const ehFinal = atual === totalFechaduras();
  el.textoPainelCodigo.textContent = ehFinal
    ? "Enviem este código ao professor."
    : `${estado.respostas.length} de ${totalFechaduras()} fechaduras. Usem para continuar em outro computador ou para entregar ao professor.`;
  el.statusCopia.textContent = "";
  el.painelCodigo.hidden = false;
  el.gerarCodigo.hidden = true;
  el.codigoProgresso.value = "Gerando...";
  try {
    el.codigoProgresso.value = await gerarCodigoProgresso();
  } catch (erro) {
    logOriginal("Falha ao gerar o código", erro);
    el.codigoProgresso.value = "";
    el.statusCopia.textContent = "Não foi possível gerar o código. Avisem o professor.";
  }
}

async function copiarCodigoProgresso() {
  const codigo = el.codigoProgresso.value;
  try {
    await navigator.clipboard.writeText(codigo);
    el.statusCopia.textContent = "Copiado.";
  } catch (erro) {
    // Clipboard may be blocked: select the text so Ctrl + C works.
    el.codigoProgresso.focus();
    el.codigoProgresso.select();
    el.statusCopia.textContent = "Usem Ctrl + C para copiar.";
  }
}

async function restaurarProgresso(evento) {
  evento.preventDefault();
  const texto = el.codigoRestaurar.value;
  const avisar = (mensagem, status) => {
    el.mensagemRestaurar.textContent = mensagem;
    el.mensagemRestaurar.dataset.status = status;
  };
  if (texto.trim() === "") {
    avisar("Colem o código primeiro.", "error");
    el.codigoRestaurar.focus();
    return;
  }
  let registro;
  try {
    registro = await lerCodigoProgresso(texto);
  } catch (erro) {
    avisar(erro.message, "error");
    return;
  }
  if (registro.v !== 1 || !registro.e || typeof registro.i !== "number") {
    avisar("Este código é de outra versão da trilha.", "error");
    return;
  }
  avisar("Carregando...", "info");
  estado = estadoDoRegistro(registro);
  salvarEstado();
  await iniciarTrilha();
  escreverSaida(`Bem-vindos de volta, ${estado.equipe}.`, "sucesso");
}

function mostrarMensagem(texto, status, comoHtml) {
  if (comoHtml) {
    el.mensagem.innerHTML = texto;
    soltarBalaoOrfao();
    aplicarGlossario(el.mensagem);
  } else {
    el.mensagem.textContent = texto;
  }
  el.mensagem.dataset.status = status;
}

// ---------- Glossary ----------

// Plain-language explanations for the JavaScript terms used in the locks.
// Public on purpose: nothing here reveals an answer.
const MDN = "https://developer.mozilla.org/pt-BR/docs/";
const MDN_JS = MDN + "Web/JavaScript/Reference/";
const MDN_OPERADORES = MDN + "Web/JavaScript/Guide/Expressions_and_operators";
const GLOSSARIO = {
  getElementById: {
    oQue: "Um método do document que encontra um elemento da página pelo seu id.",
    serve: "Pegar um elemento do HTML para ler ou mudar o que ele mostra.",
    url: MDN + "Web/API/Document/getElementById",
  },
  textContent: {
    oQue: "Propriedade com o texto de um elemento, sem as tags HTML.",
    serve: "Ler ou trocar só o texto. Tags e comentários HTML ficam de fora.",
    url: MDN + "Web/API/Node/textContent",
  },
  innerHTML: {
    oQue: "Propriedade com o conteúdo HTML de um elemento, com tags e comentários.",
    serve: "Ler o HTML completo ou inserir HTML novo. Nunca coloque nele texto digitado pelo usuário.",
    url: MDN + "Web/API/Element/innerHTML",
  },
  "console.log": {
    oQue: "Função que escreve uma mensagem no console (a saída da bancada).",
    serve: "Ver valores enquanto o código roda e descobrir onde está o erro.",
    url: MDN + "Web/API/console/log_static",
  },
  let: {
    oQue: "Palavra que cria uma variável cujo valor pode mudar depois.",
    serve: "Guardar valores que vão mudar, como um contador.",
    url: MDN_JS + "Statements/let",
  },
  const: {
    oQue: "Palavra que cria uma constante: o nome não pode receber outro valor.",
    serve: "Guardar o que não muda, como um elemento encontrado com getElementById.",
    url: MDN_JS + "Statements/const",
  },
  for: {
    oQue: "Laço de repetição com início, condição e passo: for (let i = 0; i < 10; i++).",
    serve: "Repetir um bloco de código um número conhecido de vezes.",
    url: MDN_JS + "Statements/for",
  },
  while: {
    oQue: "Laço que repete enquanto a condição for verdadeira.",
    serve: "Repetir quando não se sabe quantas voltas serão. Algo precisa mudar dentro dele para o laço parar.",
    url: MDN_JS + "Statements/while",
  },
  if: {
    oQue: "Estrutura de decisão: if (se), else if (senão, se) e else (senão).",
    serve: "Executar um bloco só quando a condição é verdadeira, e outro quando não é.",
    url: MDN_JS + "Statements/if...else",
  },
  switch: {
    oQue: "Estrutura que compara um valor com várias opções (case).",
    serve: "Escolher entre muitas opções sem uma fila de if.",
    url: MDN_JS + "Statements/switch",
  },
  case: {
    oQue: "Uma opção dentro do switch.",
    serve: "Dizer o que fazer quando o valor é igual ao do case. Sem break, o código continua no case seguinte.",
    url: MDN_JS + "Statements/switch",
  },
  default: {
    oQue: "A opção do switch usada quando nenhum case combina.",
    serve: "Tratar valores inesperados.",
    url: MDN_JS + "Statements/switch",
  },
  break: {
    oQue: "Comando que interrompe o switch ou o laço em que está.",
    serve: "Sair do case depois de executá-lo, ou parar um laço antes do fim.",
    url: MDN_JS + "Statements/break",
  },
  "%": {
    oQue: "Operador resto da divisão: 7 % 2 é 1.",
    serve: "Saber se um número é par (n % 2 === 0) ou fazer algo a cada N voltas.",
    url: MDN_OPERADORES,
  },
  "===": {
    oQue: "Igualdade estrita: compara valor e tipo. \"5\" === 5 é false.",
    serve: "Testar se dois valores são iguais sem conversão automática.",
    url: MDN_OPERADORES,
  },
  "!==": {
    oQue: "Diferença estrita: é true quando o valor ou o tipo são diferentes.",
    serve: "Escrever condições do tipo \"enquanto for diferente de\".",
    url: MDN_OPERADORES,
  },
  "&&": {
    oQue: "E lógico: só é true quando os dois lados são true.",
    serve: "Exigir duas condições ao mesmo tempo.",
    url: MDN_JS + "Operators/Logical_AND",
  },
  "<": {
    oQue: "Operador menor que: 3 < 5 é true.",
    serve: "Comparar números, como na condição de um for (i < 10).",
    url: MDN_OPERADORES,
  },
  "<=": {
    oQue: "Operador menor ou igual: 5 <= 5 é true.",
    serve: "Comparar números incluindo o próprio limite.",
    url: MDN_OPERADORES,
  },
  "=>": {
    oQue: "Arrow function: uma forma curta de escrever uma função.",
    serve: "Escrever funções pequenas, por exemplo para passar como parâmetro.",
    url: MDN_JS + "Functions/Arrow_functions",
  },
  Number: {
    oQue: "Função que converte um valor em número: Number(\"42\") é 42.",
    serve: "Transformar o texto de um campo (.value) em número antes de fazer contas.",
    url: MDN_JS + "Global_Objects/Number",
  },
  value: {
    oQue: "Propriedade com o que está escrito em um campo de formulário (input).",
    serve: "Ler o que o usuário digitou. O valor sempre chega como texto.",
    url: MDN + "Web/API/HTMLInputElement",
  },
  length: {
    oQue: "Propriedade com o tamanho de um texto (quantos caracteres) ou de uma lista.",
    serve: "Saber o tamanho e percorrer um texto com for, letra por letra.",
    url: MDN_JS + "Global_Objects/String/length",
  },
  "Math.sqrt": {
    oQue: "Função que calcula a raiz quadrada: Math.sqrt(9) é 3.",
    serve: "Contas com raiz, como distâncias.",
    url: MDN_JS + "Global_Objects/Math/sqrt",
  },
  "Math.floor": {
    oQue: "Função que arredonda para baixo: Math.floor(4.9) é 4.",
    serve: "Pegar só a parte inteira de um número.",
    url: MDN_JS + "Global_Objects/Math/floor",
  },
  "Math.round": {
    oQue: "Função que arredonda para o inteiro mais próximo: Math.round(4.5) é 5.",
    serve: "Arredondar resultados de contas.",
    url: MDN_JS + "Global_Objects/Math/round",
  },
  "Math.abs": {
    oQue: "Função que devolve o valor absoluto, sem sinal: Math.abs(-3) é 3.",
    serve: "Calcular distâncias e diferenças que não podem ser negativas.",
    url: MDN_JS + "Global_Objects/Math/abs",
  },
  function: {
    oQue: "Palavra que cria uma função: um bloco de código com nome que pode ser chamado várias vezes.",
    serve: "Organizar e reaproveitar código.",
    url: MDN_JS + "Statements/function",
  },
  return: {
    oQue: "Comando que devolve um valor de dentro da função e encerra a função.",
    serve: "Entregar o resultado da função para quem a chamou.",
    url: MDN_JS + "Statements/return",
  },
  addEventListener: {
    oQue: "Método que faz um elemento esperar um evento e chamar uma função quando ele acontece.",
    serve: "Reagir a cliques e teclas. Passe o nome da função, sem parênteses.",
    url: MDN + "Web/API/EventTarget/addEventListener",
  },
  click: {
    oQue: "Evento disparado quando o elemento é clicado ou tocado.",
    serve: "É o nome do evento usado em addEventListener(\"click\", ...).",
    url: MDN + "Web/API/Element/click_event",
  },
  callback: {
    oQue: "Função passada como parâmetro para outra função, que a chama depois.",
    serve: "O addEventListener guarda a sua função e só a chama quando o evento acontece.",
    url: MDN + "Glossary/Callback_function",
  },
  null: {
    oQue: "Valor que significa \"nenhum objeto\". getElementById devolve null quando não encontra o id.",
    serve: "Indicar ausência. O erro \"Cannot read properties of null\" quase sempre é um id errado.",
    url: MDN_JS + "Operators/null",
  },
  undefined: {
    oQue: "Valor de algo que ainda não recebeu valor.",
    serve: "Aparece em variável sem valor ou em função sem return.",
    url: MDN_JS + "Global_Objects/undefined",
  },
};

// Other spellings that point to the same entry (inline code and concept chips).
const APELIDOS_GLOSSARIO = {
  else: "if",
  "if/else": "if",
  "else if": "if",
  "operador %": "%",
  "Number()": "Number",
  ".value": "value",
  ".length": "length",
  '"click"': "click",
  "'click'": "click",
  "evento de clique": "click",
  "função como parâmetro": "callback",
};

// Only exact tokens are wrapped, so the text of the page stays the same.
// Operators need spaces around them, which keeps "<li>" and "x%" untouched.
const PADRAO_TERMOS = new RegExp(
  [
    String.raw`(?<![\w$])(?:getElementById|textContent|innerHTML|addEventListener|console\.log|Math\.(?:sqrt|floor|round|abs)|Number|let|const|for|while|if|else|switch|case|default|break|function|return|null|undefined)(?![\w$])`,
    String.raw`(?<=\.)(?:value|length)(?![\w$])`,
    String.raw`"click"|'click'`,
    String.raw`(?<=^|\s)(?:===|!==|&&|<=|<|%|=>)(?=\s|$)`,
  ].join("|"),
  "g",
);

function entradaGlossario(texto) {
  const chave = APELIDOS_GLOSSARIO[texto] || texto;
  return Object.hasOwn(GLOSSARIO, chave) ? chave : null;
}

function criarGatilhoTermo(texto, chave) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "termo";
  botao.textContent = texto;
  botao.dataset.termo = chave;
  botao.setAttribute("aria-expanded", "false");
  return botao;
}

// Code the pair must read with their own code (anything inside an element
// with an id, like #comandos or #mural) is left exactly as written.
function codigoProtegido(codigo, raiz) {
  for (let no = codigo; no && no !== raiz; no = no.parentElement) {
    if (no.id || no.classList.contains("cofre")) return true;
  }
  return false;
}

function envolverTermos(codigo) {
  const textos = [];
  const andarilho = document.createTreeWalker(codigo, NodeFilter.SHOW_TEXT);
  while (andarilho.nextNode()) textos.push(andarilho.currentNode);
  textos.forEach((noTexto) => {
    if (noTexto.parentElement.closest(".termo")) return;
    const texto = noTexto.nodeValue;
    const pedacos = [];
    let ultimo = 0;
    for (const achado of texto.matchAll(PADRAO_TERMOS)) {
      const chave = entradaGlossario(achado[0]);
      if (!chave) continue;
      if (achado.index > ultimo) pedacos.push(texto.slice(ultimo, achado.index));
      pedacos.push(criarGatilhoTermo(achado[0], chave));
      ultimo = achado.index + achado[0].length;
    }
    if (pedacos.length === 0) return;
    if (ultimo < texto.length) pedacos.push(texto.slice(ultimo));
    noTexto.replaceWith(...pedacos);
  });
}

function aplicarGlossario(raiz) {
  raiz.querySelectorAll("code").forEach((codigo) => {
    if (codigo.closest("pre") || codigoProtegido(codigo, raiz)) return;
    envolverTermos(codigo);
  });
  raiz.querySelectorAll(".conceitos li").forEach((chip) => {
    const texto = chip.textContent.trim();
    const chave = entradaGlossario(texto);
    if (!chave || chip.querySelector(".termo")) return;
    chip.replaceChildren(criarGatilhoTermo(texto, chave));
  });
}

// One balloon at a time. It is created on open and removed on close, so it
// never shows up in the textContent the pair reads with their code.
const balao = { gatilho: null, elemento: null, fixo: false, abrir: 0, fechar: 0, calado: null };
const suportaPopover = typeof HTMLElement.prototype.showPopover === "function";

function montarBalao(chave, texto) {
  const entrada = GLOSSARIO[chave];
  const caixa = document.createElement("span");
  caixa.className = "balao";
  caixa.id = "app-balao-termo";
  caixa.setAttribute("role", "group");
  caixa.setAttribute("aria-label", `Glossário: ${texto}`);
  const titulo = document.createElement("span");
  titulo.className = "balao-titulo";
  titulo.textContent = texto;
  const linha = (rotulo, conteudo) => {
    const p = document.createElement("span");
    p.className = "balao-linha";
    const forte = document.createElement("strong");
    forte.textContent = `${rotulo} `;
    p.append(forte, conteudo);
    return p;
  };
  const link = document.createElement("a");
  link.href = entrada.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Ler no MDN";
  const aviso = document.createElement("span");
  aviso.className = "visualmente-oculto";
  aviso.textContent = " (abre em nova aba)";
  link.append(aviso);
  caixa.append(titulo, linha("O que é:", entrada.oQue), linha("Para que serve:", entrada.serve), link);
  caixa.addEventListener("pointerenter", () => clearTimeout(balao.fechar));
  caixa.addEventListener("pointerleave", (evento) => {
    if (evento.pointerType === "mouse") agendarFecharBalao();
  });
  caixa.addEventListener("focusout", aoSairDoFoco);
  return caixa;
}

function posicionarBalao() {
  const { gatilho, elemento } = balao;
  if (!gatilho || !elemento) return;
  const margem = 16;
  const distancia = 8;
  const alvo = gatilho.getBoundingClientRect();
  const largura = elemento.offsetWidth;
  const altura = elemento.offsetHeight;
  let topo = alvo.bottom + distancia;
  if (topo + altura > window.innerHeight - margem && alvo.top - distancia - altura >= margem) {
    topo = alvo.top - distancia - altura;
    elemento.dataset.lado = "cima";
  } else {
    elemento.dataset.lado = "baixo";
  }
  const maximo = document.documentElement.clientWidth - margem - largura;
  const esquerda = Math.max(margem, Math.min(alvo.left, maximo));
  elemento.style.top = `${Math.round(topo)}px`;
  elemento.style.left = `${Math.round(esquerda)}px`;
}

function abrirBalao(gatilho, fixo) {
  clearTimeout(balao.abrir);
  clearTimeout(balao.fechar);
  if (balao.gatilho === gatilho) {
    balao.fixo = balao.fixo || fixo;
    return;
  }
  fecharBalao();
  const caixa = montarBalao(gatilho.dataset.termo, gatilho.textContent);
  gatilho.after(caixa);
  if (suportaPopover) {
    caixa.popover = "manual";
    caixa.showPopover();
  }
  balao.gatilho = gatilho;
  balao.elemento = caixa;
  balao.fixo = fixo;
  gatilho.setAttribute("aria-expanded", "true");
  gatilho.setAttribute("aria-controls", caixa.id);
  posicionarBalao();
  requestAnimationFrame(() => caixa.classList.add("visivel"));
}

function fecharBalao(devolverFoco) {
  clearTimeout(balao.abrir);
  clearTimeout(balao.fechar);
  const { gatilho, elemento } = balao;
  if (!gatilho) return;
  balao.gatilho = null;
  balao.elemento = null;
  balao.fixo = false;
  gatilho.setAttribute("aria-expanded", "false");
  gatilho.removeAttribute("aria-controls");
  elemento.remove();
  if (devolverFoco && gatilho.isConnected) {
    // Esc returns focus to the term; that focus must not reopen the balloon.
    balao.calado = gatilho;
    gatilho.focus();
  }
}

// The trigger was replaced by a re-render: forget the balloon that went with it.
function soltarBalaoOrfao() {
  if (balao.gatilho && !balao.gatilho.isConnected) fecharBalao();
}

function agendarFecharBalao() {
  clearTimeout(balao.abrir);
  if (balao.fixo) return;
  clearTimeout(balao.fechar);
  balao.fechar = setTimeout(() => fecharBalao(), 200);
}

function dentroDoBalao(no) {
  return Boolean(no && (balao.gatilho?.contains(no) || balao.elemento?.contains(no)));
}

function aoSairDoFoco(evento) {
  if (balao.gatilho && !dentroDoBalao(evento.relatedTarget)) fecharBalao();
}

document.addEventListener("pointerover", (evento) => {
  if (evento.pointerType !== "mouse") return;
  const gatilho = evento.target.closest?.(".termo");
  if (!gatilho || gatilho === balao.gatilho) return;
  clearTimeout(balao.abrir);
  balao.abrir = setTimeout(() => abrirBalao(gatilho, false), 100);
});
document.addEventListener("pointerout", (evento) => {
  if (evento.pointerType !== "mouse") return;
  const gatilho = evento.target.closest?.(".termo");
  if (!gatilho || gatilho.contains(evento.relatedTarget)) return;
  if (gatilho === balao.gatilho) agendarFecharBalao();
  else clearTimeout(balao.abrir);
});
document.addEventListener("focusin", (evento) => {
  const gatilho = evento.target.closest?.(".termo");
  if (gatilho && gatilho !== balao.calado) abrirBalao(gatilho, false);
});
document.addEventListener("focusout", (evento) => {
  if (!evento.target.closest?.(".termo")) return;
  balao.calado = null;
  aoSairDoFoco(evento);
});
document.addEventListener("click", (evento) => {
  const gatilho = evento.target.closest?.(".termo");
  if (!gatilho) return;
  // A click (or tap) pins the balloon; a second click on a pinned one closes it.
  if (balao.gatilho === gatilho && balao.fixo) fecharBalao();
  else abrirBalao(gatilho, true);
});
document.addEventListener("pointerdown", (evento) => {
  if (balao.gatilho && !dentroDoBalao(evento.target)) fecharBalao();
});
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && balao.gatilho) {
    evento.stopPropagation();
    fecharBalao(true);
  }
});
window.addEventListener("resize", posicionarBalao);
window.addEventListener("scroll", posicionarBalao, { capture: true, passive: true });

// Restart the CSS shake even when two wrong answers come in a row.
function tremer(elemento) {
  elemento.classList.remove("treme");
  void elemento.offsetWidth;
  elemento.classList.add("treme");
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
    estado.aberturas[indice] = Date.now();
    etapasAbertas[indice + 1] = proxima;
    if (indice + 1 === totalFechaduras()) {
      estado.fim = Date.now();
    }
    salvarEstado();
    atual = indice + 1;
    recemAberta = indice;
    renderizar();
    escreverSaida(`Fechadura ${indice} aberta!`, "sucesso");
    document.getElementById("app-titulo-etapa").focus();
    return;
  }

  estado.erros[indice] = (estado.erros[indice] || 0) + 1;
  salvarEstado();
  tremer(el.linhaResposta);

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
  el.carregando.textContent = "Carregando a trilha...";

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
  const texto = el.recomecar.querySelector("span");
  if (!confirmarRecomeco) {
    texto.textContent = "Clique de novo para apagar tudo";
    confirmarRecomeco = setTimeout(() => {
      texto.textContent = "Recomeçar a trilha";
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
  escreverSaida("Etapa reiniciada.", "info");
});
el.baixar.addEventListener("click", baixarCodigo);
el.formRestaurar.addEventListener("submit", restaurarProgresso);
el.gerarCodigo.addEventListener("click", mostrarPainelCodigo);
el.copiarCodigo.addEventListener("click", copiarCodigoProgresso);
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
    el.carregando.textContent = "Não foi possível abrir a trilha. Usem o endereço https da atividade.";
    return;
  }
  try {
    const resposta = await fetch("etapas.json", { cache: "no-store" });
    dados = await resposta.json();
  } catch (erro) {
    el.carregando.textContent = "Não foi possível carregar a trilha. Usem o endereço https da atividade.";
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
