# MorbiusFin · admin

Painel PWA pra **gerenciar acessos** do MorbiusFin. Sem acesso a dado nenhum dos usuários — só
liberar, bloquear, renovar e definir vitalício. Mesma paleta/fonte do app principal.

- **Banco:** um `licencas.json` num repo do GitHub (gravado pela API, via token que fica só no seu aparelho).
- **Segurança:** cada lista é **assinada** (ECDSA P-256) pela chave privada que vive só aqui. O app financas
  verifica com a chave pública embutida → ninguém forja/altera licença.
- **Identificador:** código de 8 caracteres = hash do ID do aparelho do usuário (não usa IP — IP muda/VPN).
- **Privacidade:** o arquivo publicado tem só `hash + status + plano + validade + assinatura`. Apelidos
  ficam só no seu aparelho (com backup/export).

## Arquivos

| arquivo | o quê |
|---|---|
| `index.html` | telas + modais |
| `css/styles.css` | visual (paleta do financas) |
| `js/sign.js` | chaves + assinatura ECDSA (chave privada nunca sai daqui) |
| `js/github.js` | ler/gravar `licencas.json` via GitHub Contents API |
| `js/app.js` | estado, dashboard, ações, publicação |
| `licencas.json` | arquivo público de licenças (placeholder até a 1ª publicação) |
| `INTEGRACAO-FINANCAS.md` | código pra ligar a trava no app financas |

## Setup (1 vez)

1. **Criar o repo** `morbiusfin/admin` (público) no GitHub e ativar **Pages** (branch `main`, raiz).
2. **Token fine-grained** (Settings → Developer settings → Fine-grained tokens):
   - Resource owner: `morbiusfin`; Repository access: **only `morbiusfin/admin`**.
   - Permissions: **Contents → Read and write**. (só isso)
3. Abrir o painel (`https://morbiusfin.github.io/admin/`), instalar na tela de início.
4. **Passo 1 — Gerar chave de assinatura.** Copie a **chave pública** e **baixe o backup das chaves**
   (sem o backup, ao reinstalar você não publica mais).
5. **Passo 2 — Conectar:** repo `morbiusfin/admin`, arquivo `licencas.json`, branch `main`, cole o token.
6. Embuta a **chave pública** no app financas (ver `INTEGRACAO-FINANCAS.md`).

## Uso

- **+** → cole o código que o cliente vê no app, dê um apelido, escolha o plano. → **Publicar**.
- Em cada cartão: **Liberar/Bloquear**, **Renovar** (estende o período), **✏️ editar** (apelido/plano),
  **🗑️ remover**. As mudanças ficam pendentes até tocar **Publicar** (1 commit assinado).
- **↻** recarrega do GitHub. **conexão** edita repo/token ou esquece o token deste aparelho.

## Planos

`Vitalício` (não expira) · `Mensal` (30d) · `Anual` (365d) · `Teste` (7d).
