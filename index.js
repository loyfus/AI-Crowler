// index.js
// -------------------------
require('dotenv').config();

const axios      = require('axios');
const cheerio    = require('cheerio');
const repository = require('./repository');

if (!process.env.JETBOOST_ID) {
  console.error('❌ defina JETBOOST_ID no .env');
  process.exit(1);
}

const JETBOOST_ID = process.env.JETBOOST_ID;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);

const TAGS = [
  'ai-detection','aggregators','avatar','chat','copywriting',
  'finance','for-fun','gaming','generative-art','generative-code',
  'generative-video','image-improvement','image-scanning',
  'inspiration','marketing','motion-capture','music','podcasting',
  'productivity','prompt-guides','research','self-improvement',
  'social-media','speech-to-text','text-to-speech','text-to-video',
  'translation','video-editing','voice-modulation'
];

(async () => {
  // polyfill dinamicamente o p-limit (ESM-only)
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(CONCURRENCY);

  // inicializa e carrega slugs já existentes
  await repository.init();
  const existing = await repository.getExistingSlugs();

  // pré-carrega todos os slugs por tag
  const slugsByTag = {};
  for (const tag of TAGS) {
    slugsByTag[tag] = await fetchSlugsForTag(tag);
  }

  // mantém ponteiros para round-robin
  const pointers = TAGS.reduce((acc, tag) => {
    acc[tag] = 0;
    return acc;
  }, {});

  const tasks = [];
  let more = true;

  // processa **todos** os slugs em round-robin (sem limite)
  while (more) {
    more = false;
    for (const tag of TAGS) {
      const list = slugsByTag[tag];
      const idx  = pointers[tag]++;
      if (idx < list.length) {
        more = true;
        const slug = list[idx];
        if (existing.has(slug)) {
          console.log(`⏭ ${slug} já existe, pulando.`);
          continue;
        }
        tasks.push(limit(async () => {
          try {
            const tool = await fetchToolDetail(slug);
            await repository.saveTool(tool);
            console.log(`✔ ${slug} – ${tool.name}`);
          } catch (err) {
            if (err.response?.status === 404) {
              console.warn(`⚠ ${slug} não encontrado (404), pulando.`);
            } else {
              console.error(`✖ Erro em ${slug}: ${err.message}`);
            }
          }
        }));
      }
    }
  }

  await Promise.all(tasks);
  console.log(`✅ Processamento concluído: ${tasks.length} novas ferramentas.`);
  await repository.close();
})().catch(err => {
  console.error(err);
  repository.close().finally(() => process.exit(1));
});

async function fetchSlugsForTag(tag) {
  const url = `https://api.jetboost.io/filter?boosterId=${JETBOOST_ID}&q=${encodeURIComponent(tag)}`;
  const { data } = await axios.get(url);
  return Object.entries(data)
    .filter(([, ok]) => ok)
    .map(([slug]) => slug);
}

async function fetchLogoBase64(logoUrl) {
  try {
    const resp = await axios.get(logoUrl, { responseType: 'arraybuffer' });
    const ct   = resp.headers['content-type'] || 'image/png';
    const b64  = Buffer.from(resp.data, 'binary').toString('base64');
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

async function resolveOriginalUrl(u) {
  try {
    const headRes = await axios.head(u, { maxRedirects:0, validateStatus:s=>s>=300&&s<400 });
    if (headRes.headers.location) return headRes.headers.location;
  } catch (e) {
    if (e.response?.headers?.location) return e.response.headers.location;
  }
  try {
    const getRes = await axios.get(u, { maxRedirects:0, validateStatus:()=>true });
    if (getRes.headers.location) return getRes.headers.location;
    const html = getRes.data;
    const m1 = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']\d+;\s*url=([^"']+)["']/i);
    if (m1) return m1[1];
    const m2 = html.match(/window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i);
    if (m2) return m2[1];
  } catch {}
  return u;
}

function stripRefParam(raw) {
  try {
    const url = new URL(raw);
    url.searchParams.delete('ref');
    return url.toString();
  } catch {
    return raw;
  }
}

async function translateGoogle(text, target) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx`
      + `&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await axios.get(url);
    return res.data[0].map(seg => seg[0]).join('');
  } catch {
    return text;
  }
}

async function fetchToolDetail(slug) {
  const { data: html } = await axios.get(`https://www.futuretools.io/tools/${slug}`, {
    headers: { 'User-Agent': 'IA-Search-Bot/1.0' }
  });
  const $ = cheerio.load(html);

  const name        = $('h1.heading-3').first().text().trim();
  const description = $('h3.heading-2')
    .filter((i, el) => $(el).text().includes('Description'))
    .next('.rich-text-block').text().trim();
  const logoUrl     = $('.tool-main-content img.image-3').attr('src');
  const redirect    = $('.div-block-6.vertical-flex a').first().attr('href');
  const pricing     = $('.div-block-17 .text-block-2').first().text().trim();

  const [logoBase64, rawUrl, pt, es] = await Promise.all([
    logoUrl  ? fetchLogoBase64(logoUrl)  : null,
    redirect ? resolveOriginalUrl(redirect) : null,
    translateGoogle(description,'pt'),
    translateGoogle(description,'es')
  ]);

  return {
    slug,
    name,
    description_en: description,
    description_pt: pt,
    description_es: es,
    logoBase64,
    officialUrl: rawUrl ? stripRefParam(rawUrl) : null,
    pricingModel: pricing
  };
}
