# AI-Crawler

Coletor e indexador de ferramentas de IA. Percorre o catálogo do FutureTools,
normaliza cada ferramenta e grava no MongoDB — é a camada de dados que alimenta a
busca servida pelo [API de busca](https://github.com/loyfus/indexadorBackEnd).

![Node](https://img.shields.io/badge/Node-339933?style=flat-square&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-F05138?style=flat-square)

## O problema

Buscar ferramenta de IA hoje significa garimpar o FutureTools por tag e abrir
página por página. Para construir um índice pesquisável, o caminho inverso é
melhor: raspar uma vez, guardar em um banco, e deixar a consulta ser o problema
de quem pesquisa.

## O que faz

1. **Descoberta** — a API do JetBoost devolve os slugs por tag (30 categorias,
   de `chat` a `video-editing`).
2. **Round-robin** — os slugs são percorridos por tag em rodízio, para que uma
   rodada parcial já cubra o catálogo inteiro em vez de esvaziar uma categoria só.
3. **Detalhe** — cada slug é raspado: nome, descrição, logo em base64, modelo de
   preços e a URL oficial (o redirecionamento é resolvido e o parâmetro `ref`
   removido).
4. **Tradução** — a descrição em inglês é passada por pt e es, para a busca
   responder nos três idiomas.
5. **Upsert** — slugs já existentes não são recriados; só as categorias são
   atualizadas, o que torna a rodada idempotente.

## Decisões

**Round-robin em vez de categoria por categoria.** Varrer tag por tag até o fim
gastaria toda a cota do site na primeira categoria. Intercalar garante que
qualquer ponto de interrupção deixou metade de cada categoria no banco, e não
dez ferramentas de `chat` e nada de `finance`.

**Concorrência limitada a 5.** `p-limit` segura o paralelismo. Mais que isso e o
site de origem responde com 429, o que custa mais tempo do que economiza.

**O `repository` é idempotente por slug.** Rodar duas vezes não duplica nada —
importa para um job que pode ser interrompido e retomado sem estado externo.

## Arquitetura

```
index.js          a coleta: descobre, intercala, raspa, grava
search.js         índice TF-IDF para consulta local
repository.js     a única camada que fala com o MongoDB
api/scrape.js     a mesma coleta como função serverless
```

`index.js` e `api/scrape.js` compartilham a lógica mas não a entrada: o
primeiro roda como script e itera todas as tags, o segundo roda como função e
respeita `MAX_TOOLS`. Manter a lógica em um lugar só e a entrada em outro é o
que evita a duplicação silenciosa.

## Rodar

```bash
npm install
cp .env.example .env    # preencha JETBOOST_ID
npm run scrape          # coleta completa
npm run search "texto"  # busca TF-IDF local
```

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Para quê |
| --- | --- | --- | --- |
| `JETBOOST_ID` | sim | — | Booster do catálogo |
| `MONGODB_URI` | sim | — | Conexão com o MongoDB |
| `MONGODB_DB_NAME` | não | `ia` | Banco de destino |
| `CONCURRENCY` | não | `5` | Requisições simultâneas |
| `MAX_TOOLS` | não | `10` | Limite, usado pela função serverless |

## Endpoint

`vercel.json` expõe `api/scrape.js` como função serverless, para disparar uma
rodada pontual sem rodar a coleta inteira localmente.

## Busca

`search.js` monta um índice TF-IDF sobre `description_en + pt + es` juntos, com o
`natural`. É o fallback offline: a busca em produção usa Atlas Search, que não
carrega o catálogo para a memória.

## Stack

| | |
| --- | --- |
| Runtime | Node · CommonJS |
| Scraping | Axios + Cheerio |
| Banco | MongoDB · Mongoose |
| Busca local | natural (TF-IDF) |
| Controle de fluxo | p-limit |

## Licença

MIT — [LICENSE](LICENSE).
