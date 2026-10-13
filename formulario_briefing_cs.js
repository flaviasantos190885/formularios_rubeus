function iniciar() {
  RBLib.config({
    urlBase: "https://crmrbacademy.apprubeus.com.br",
    urlFicha: "https://rbacademy.apprbs.com.br",
    token: "d2194bd4f6751f9ee8567f0530264e1b",
    origem: "699",
  });
}

var oportunidadesFiltradas = [];
var idIEAtual = null; // id da IE selecionada

const form = {
  inputNome: () => document.querySelector("[name='pessoa.nome']"),
  loading: () => document.getElementById("custom-loader"),
  selectContatos: () => document.getElementById("selectContatos"),
  botaoFechar: () => document.getElementById("botaoFechar"),
};

function injectStyles() {
  if (!document.getElementById("dynamic-loader-style")) {
    const css = `
            @keyframes spin {
                0% { transform: translateY(-50%) rotate(0deg); }
                100% { transform: translateY(-50%) rotate(360deg); }
            }

            .custom-loader-spinner {
                position: absolute;
                top: 50%;
                right: 10px;
                width: 20px;
                height: 20px;
                border: 3px solid #e0e0e0;
                border-top: 3px solid #99001D;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                z-index: 999;
                display: none;
                pointer-events: none;
                transform-origin: center;
            }

            .selectContatos {
                position: absolute;
                background: white;
                border: 1px solid #ddd;
                width: 100%;
                z-index: 1000;
                max-height: 200px;
                overflow-y: auto;
                list-style: none;
                margin: 0; padding: 0;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .selectContatos li { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; }
            .selectContatos li:hover { background: #f5f5f5; }
        `;
    const style = document.createElement("style");
    style.id = "dynamic-loader-style";
    style.type = "text/css";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }
}

function setupUI() {
  let input = form.inputNome();
  if (!input) return;

  if (input.parentNode) input.parentNode.style.position = "relative";

  if (!document.getElementById("custom-loader")) {
    let loader = document.createElement("div");
    loader.id = "custom-loader";
    loader.className = "custom-loader-spinner";
    input.parentNode.appendChild(loader);
  }

  if (!document.getElementById("botaoFechar")) {
    let btn = document.createElement("span");
    btn.id = "botaoFechar";
    btn.className = "material-symbols-outlined";
    btn.innerHTML = "cancel";
    btn.onclick = resetSearch;

    btn.style.cssText =
      "position: absolute; top: 50%; right: 10px; transform: translateY(-50%); cursor: pointer; display: none; z-index: 100; color: #999;";

    input.parentNode.appendChild(btn);
  }

  if (!document.getElementById("selectContatos")) {
    let list = document.createElement("div");
    list.id = "selectContatos";
    list.className = "selectContatos";
    list.style.display = "none";

    if (input.nextSibling)
      input.parentNode.insertBefore(list, input.nextSibling);
    else input.parentNode.appendChild(list);
  }
}

function inicializaVisualDropdown() {
  const nomeCampo = "processo.camposPersonalizados.campopersonalizado_690_compl_proc";
  let campo = document.querySelector(`[name='${nomeCampo}']`);

  if (campo && campo.tagName === "INPUT") {
    let novoSelect = document.createElement("select");
    novoSelect.name = campo.name;
    novoSelect.className = campo.className;
    novoSelect.style.display = "block";

    novoSelect.add(new Option("Aguardando seleção da IE...", ""));

    novoSelect.addEventListener("change", buscarEmailDoContatoSelecionado);

    campo.parentNode.replaceChild(novoSelect, campo);
  }
}

function resetSearch() {
  if (form.selectContatos()) form.selectContatos().style.display = "none";
  if (form.botaoFechar()) form.botaoFechar().style.display = "none";
  if (form.loading()) form.loading().style.display = "none";
}

async function buscaDadosContato(nome) {
  try {
    let resultado = await RBLib.api.buscarContatos(
      { nome: nome, limite: 500 },
      "",
      "",
      false,
    );
    let contatos = resultado.dados;

    if (contatos) {
      return contatos.filter((contato) => {
        let hasTag =
          Array.isArray(contato.tags) &&
          contato.tags.includes("Integração AIRA");
        let isPrincipal = contato.id == contato.contatoPrincipal;
        return isPrincipal && hasTag;
      });
    }
  } catch (e) {
    console.error("Erro API:", e);
  }
  return false;
}

function normaliza(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function emailDoContato(c) {
  return (
    (c && ((c.emails && c.emails.principal && c.emails.principal.email) || c.email)) ||
    ""
  );
}

// Tenta pegar nome + id dos contatos vinculados, com os formatos prováveis da API.
function extrairContatosVinculados(op) {
  const lista = [];

  // Formato A: array de objetos [{id, nome}]
  if (Array.isArray(op.contatosVinculados)) {
    op.contatosVinculados.forEach((c) => {
      if (c && c.nome) lista.push({ id: c.id || null, nome: c.nome.trim() });
    });
    if (lista.length) return lista;
  }

  // Formato B: arrays paralelos (nomes e ids na mesma ordem)
  const nomes = [].concat(op.contatoVinculadoNome || []);
  const ids = [].concat(
    op.contatoVinculadoId || op.contatoVinculado || op.contatosVinculadosIds || [],
  );
  nomes.forEach((nome, i) => {
    if (nome) lista.push({ id: ids[i] || null, nome: String(nome).trim() });
  });
  return lista;
}

async function buscarEmailDoContatoSelecionado(event) {
  const nameCampoEmail = "processo.camposPersonalizados.campopersonalizado_691_compl_proc";
  const select = event.target;
  const nomeSelecionado = select.value;

  if (!nomeSelecionado) {
    fillInput(nameCampoEmail, "", true);
    return;
  }

  const idContato =
    select.selectedOptions[0] && select.selectedOptions[0].dataset.id;

  try {
    // 1) Caminho seguro: busca direta pelo ID do contato vinculado
    if (idContato) {
      let resp = await RBLib.api.buscarContato({ id: idContato }, "", "local", false);
      const email = emailDoContato(resp && resp.dados);
      fillInput(nameCampoEmail, email, true);
      console.log("E-mail pelo ID:", email || "(contato sem e-mail)");
      return;
    }

    // 2) Fallback (sem ID): busca por nome, exigindo nome EXATO
    //    e só preenche se houver um único candidato.
    let resultado = await RBLib.api.buscarContatos(
      { nome: nomeSelecionado, limite: 100 },
      "",
      "",
      false,
    );
    const candidatos = ((resultado && resultado.dados) || []).filter(
      (c) => normaliza(c.nome) === normaliza(nomeSelecionado) && emailDoContato(c),
    );

    if (candidatos.length === 1) {
      fillInput(nameCampoEmail, emailDoContato(candidatos[0]), true);
    } else {
      console.warn(
        `${candidatos.length} contatos com o nome "${nomeSelecionado}". E-mail NÃO preenchido para evitar homônimo.`,
        candidatos,
      );
      fillInput(nameCampoEmail, "", true);
    }
  } catch (erro) {
    console.error("Erro ao buscar o e-mail do contato:", erro);
  }
}

async function buscarDadosCRM(idDinamico) {
  const url = "https://crmrbacademy.apprubeus.com.br/api/Contato/listarOportunidades";

  const payload = {
    token: "74065ed15b2b4385d5e5248565103968",
    origem: 15,
    id: idDinamico,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Erro de rede! Status: ${response.status}`);

    const data = await response.json();

    if (data.success && data.dados) {
      oportunidadesFiltradas = data.dados.filter((op) => {
        return op.processoNome === "RpR | Gestão de Clientes" || op.processo === "76";
      });
      return oportunidadesFiltradas;
    } else {
      return [];
    }
  } catch (error) {
    console.error("Erro na requisição de oportunidades:", error);
    return [];
  }
}

let searchTimer;

async function criaOpcoesNoSelectContatos() {
  let input = form.inputNome();

  input.addEventListener("keyup", async () => {
    let termo = input.value;

    if (termo.length <= 2) {
      resetSearch();
      clearTimeout(searchTimer);
      return;
    }

    if (form.loading()) form.loading().style.display = "block";

    if (form.botaoFechar()) form.botaoFechar().style.display = "none";

    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {
      let dados = await buscaDadosContato(termo);

      if (form.loading()) form.loading().style.display = "none";

      if (dados && dados.length > 0) {
        renderOptions(dados);
        if (form.selectContatos())
          form.selectContatos().style.display = "block";
        if (form.botaoFechar()) form.botaoFechar().style.display = "block";
      } else {
        if (form.selectContatos()) form.selectContatos().style.display = "none";
        if (form.botaoFechar()) form.botaoFechar().style.display = "block";
      }
    }, 600);
  });
}

function renderOptions(dados) {
  const html = dados
    .map((c) => `<li onclick="preencheCampos('${c.id}')">${c.nome}</li>`)
    .join("");
  form.selectContatos().innerHTML = html;
}

function preencheCampos(idContato) {
  document.getElementById('botaoAbrirPagina').disabled = true;
  idIEAtual = idContato;

  document
    .querySelectorAll(
      "#rbFormEtapa1 input:not([type='hidden']), #rbFormEtapa1 select, #rbFormEtapa1 textarea",
    )
    .forEach((el) => {
      if (el.tagName === "SELECT") {
        el.value = null;
        if (el.onchange) el.onchange();
        if (typeof $ !== "undefined") $(el).val(null).trigger("change");
      } else if (el.type !== "checkbox") {
        el.value = "";
      }
    });

  resetSearch();

  let response = RBLib.api.buscarContato({ id: idContato }, "", "local", false);
  let contato = response.dados;

  buscarDadosCRM(idContato).then((oportunidades) => {
    let selectRelacionados = document.querySelector("[name='processo.camposPersonalizados.campopersonalizado_690_compl_proc']");

    if (!selectRelacionados) return;

    selectRelacionados.innerHTML = "";

    if (oportunidades && oportunidades.length > 0) {
      console.log("Oportunidade (para conferir os campos):", oportunidades[0]);
      selectRelacionados.add(new Option("Selecione um contato...", ""));

      // chave (id ou nome) -> {id, nome}, sem duplicar
      let unicos = new Map();
      oportunidades.forEach((op) => {
        extrairContatosVinculados(op).forEach((c) => {
          const chave = c.id || c.nome.toLowerCase();
          if (!unicos.has(chave)) unicos.set(chave, c);
        });
      });

      if (unicos.size > 0) {
        Array.from(unicos.values())
          .sort((a, b) => a.nome.localeCompare(b.nome))
          .forEach((c) => {
            const opt = new Option(c.nome, c.nome); // value continua sendo o nome
            if (c.id) opt.dataset.id = c.id;        // id guardado à parte
            selectRelacionados.add(opt);
          });
      } else {
        selectRelacionados.options[0].text = "Oportunidade achada, mas sem contatos vinculados.";
      }
      document.getElementById('botaoAbrirPagina').disabled = false;
    } else {
      selectRelacionados.innerHTML = "";
      selectRelacionados.add(new Option("Nenhuma oportunidade do Gestão de Clientes encontrada", ""));
    }

    disparaEventos(selectRelacionados);
  });

  if (contato) {
    RBLib.form.preencherCampos(contato, "", "");

    fillInput("pessoa.nome", contato.nome);

    let email = contato.emails?.principal?.email || contato.email;
    if (email) fillInput("pessoa.emailPrincipal", email, true);

    let cnpj = contato.cnpj;
    if (cnpj) fillInput("pessoa.cnpj", cnpj, true);
    document.querySelectorAll(`[name='pessoa.naturezaJuridica']`)[1].value = '2';
    document.querySelectorAll(`[name='pessoa.naturezaJuridica']`)[1].checked = true

    if (
      contato.camposPersonalizados &&
      Array.isArray(contato.camposPersonalizados)
    ) {
      let analista = contato.camposPersonalizados.find(
        (c) => c.coluna === "campopersonalizado_99_compl_cont",
      );
      if (analista && analista.valor) {
        let valApi = analista.valor.trim();
        let select = document.querySelector(
          "[name='processo.camposPersonalizados.campopersonalizado_17_compl_proc']",
        );

        if (select) {
          select.value = valApi;

          if (!select.value) {
            let opts = Array.from(select.options);
            let firstName = valApi.split(" ")[0].toLowerCase().trim();

            let match = opts.find((o) => {
              let t = o.text.trim().toLowerCase();
              let v = o.value.trim().toLowerCase();
              if (v === "" || v === "null") return false;

              return t && (t === firstName || valApi.toLowerCase().includes(t));
            });
            if (match) select.value = match.value;
          }

          if (select.value) {
            disparaEventos(select);
            if (typeof $ !== "undefined")
              $(select).val(select.value).trigger("change");
          }
        }
      }
    }
  }
}

function fillInput(name, val, fireEvents = false) {
  let el = document.querySelector(`[name='${name}']`);
  if (el && val !== undefined) {
    el.value = val;
    if (fireEvents) disparaEventos(el);
  }
}

function disparaEventos(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function verificaParametros() {
  const p = new URLSearchParams(window.location.search);
  const e = p.get("email");
}

function addEventoInputsVerificacao() {
  if (!document.getElementById("warningMessage-email")) {
    document
      .querySelector("#rbBtnNext")
      .insertAdjacentHTML(
        "beforebegin",
        "<div id='warningMessage-email' style='display:none;justify-content:center;color: #f44336;'><p>Preencha o Email</p></div>",
      );
  }
  let els = document
    .querySelector("#rbFormEtapa1")
    .querySelectorAll("input, select, textarea");
  for (let i = 0; i < els.length; i++) {
    let el = els[i];
    if (el.type != "hidden") {
      if (el.tagName === "INPUT" && el.type === "checkbox") {
        el.addEventListener("change", () => setTimeout(verificarEmail, 200));
      } else {
        el.addEventListener("keyup", verificarEmail);
        el.addEventListener("blur", verificarEmail);
        el.addEventListener("change", verificarEmail);
      }
    }
  }
}

function verificarEmail() {
  let email = document.querySelector("[name='pessoa.emailPrincipal']");
  let valida = () => {
    if (email.value == "") return false;
    let err = email.parentNode.querySelector("[name='validationMessage']");
    return !(err && err.innerHTML == "Preencha este campo");
  };

  let todosOk = true;
  let els = document
    .querySelector("#rbFormEtapa1")
    .querySelectorAll("input, select, textarea");
  for (let el of els) {
    if (el.required && el.type != "hidden") {
      if (el.type == "checkbox" && !el.checked) todosOk = false;
      else {
        let err = el.parentNode.querySelector("[name='validationMessage']");
        if ((err && err.innerHTML == "Preencha este campo") || el.value == "")
          todosOk = false;
      }
    }
  }

  let btn = document.querySelector("#rbBtnNext");
  let warn = document.querySelector("#warningMessage-email");

  if (todosOk) {
    if (!valida()) {
      if (warn) warn.style.display = "flex";
      btn.disabled = true;
    } else {
      btn.disabled = false;
      if (warn) warn.style.display = "none";
    }
  } else {
    if (warn) warn.style.display = "none";
    btn.disabled = true;
  }
}

async function start() {
  injectStyles();
  setupUI();

  inicializaVisualDropdown();

  await criaOpcoesNoSelectContatos();

  setTimeout(() => {
    addEventoInputsVerificacao();
    verificaParametros();
    adicionarBotaoCustom();
  }, 1500);
}

// Função que adiciona um botão ao lado do campo do parâmetro
function adicionarBotaoCustom(campo){
  let campoRef = document.querySelector(`[name="processo.camposPersonalizados.campopersonalizado_690_compl_proc"]`);

  if(campoRef){
    campoRef.insertAdjacentHTML('afterEnd',`
      <button id="botaoAbrirPagina" class="botaoAdicionar" type="button" disabled>+</button>
    `)
  }else{
    console.error("Erro ao adicionar botão customizado: Campo de referência não encontrado!")
  }

  document.getElementById('botaoAbrirPagina').addEventListener('click',abrirPopup)

  function abrirPopup() {
    // Abre o popup centralizado ou com medidas específicas
    let popup = window.open('https://rbacademy.apprbs.com.br/atualizacao_contatos_relacionados', 'FormPopup', 'width=800,height=600');

    popup.onload = function() {
      popup.dadosRecebidos = {
        oportunidade: oportunidadesFiltradas[0],
        contato: JSON.parse(localStorage.getItem('contato'))
      };
    };
  }
}

// Esta função será chamada pelo popup
function receberDados(dados) {
  let campoRef = document.querySelector(`[name="processo.camposPersonalizados.campopersonalizado_690_compl_proc"]`);

  campoRef.insertAdjacentHTML('beforeEnd',`<option value="${dados.nome}">${dados.nome}</option>`);
  campoRef.value = dados.nome;
  campoRef.dispatchEvent(new Event("change"));
}

start();
