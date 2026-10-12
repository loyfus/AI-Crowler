# AI-Crowler

Coletor e indexador de ferramentas de IA. Percorre o catalogo do FutureTools,
normaliza cada ferramenta e grava no MongoDB - e a etapa de dados que alimenta a
busca servida pelo [indexadorBackEnd](https://github.com/loyfus/indexadorBackEnd).

## Como funciona

1. **Descoberta** - a API do JetBoost devolve os slugs por tag (30 categorias,
   de `chat` a `video-editing`).
2. **Round-robin** - os slugs sao percorridos por tag em rodizio, para que uma
   rodada parcial ja cubra o catalogo inteiro em vez de esvaziar uma categoria so.
3. **Detalhe** - cada slug e raspado da pagina da ferramenta: nome, descricao,
   logo em base64, modelo de precos e a URL oficial (o link de redirecionamento
   e resolvido e o parametro `ref` removido).
4. **Traducao** - a descricao em ingles e passada por pt e es, para a busca
   responder nos tres idiomas.
5. **Upsert** - slugs ja existentes nao sao recriados; apenas as categorias sao
   atualizadas, o que torna a rodada idempotente.

A concorrencia e limitada por `p-limit` (5 por padrao) para nao pressionar o
site de origem.

## Uso

```bash
npm install
cp .env.example .env    # preencha JETBOOST_ID
npm run scrape          # coleta completa
npm run search "texto"  # busca TF-IDF local
```

## Variaveis de ambiente

| Variavel | Obrigatoria | Padrao | Para que |
| --- | --- | --- | --- |
| `JETBOOST_ID` | sim | - | Booster do catalogo |
| `MONGODB_URI` | sim | - | Conexao com o MongoDB |
| `MONGODB_DB_NAME` | nao | `ia` | Banco de destino |
| `CONCURRENCY` | nao | `5` | Requisicoes simultaneas |
| `MAX_TOOLS` | nao | `10` | Limite, usado pela funcao serverless |

## Endpoint

`vercel.json` expoe `api/scrape.js` como funcao serverless, para disparar uma
rodada pontual sem rodar a coleta inteira localmente.

## Busca

`search.js` monta um indice TF-IDF sobre `description_en + pt + es` juntos, com o
`natural`. E o fallback offline: a busca em producao usa Atlas Search, que e
ranqueada pelo indice do MongoDB e nao carrega o catalogo para a memoria.

## Licenca

MIT - veja [LICENSE](LICENSE).
