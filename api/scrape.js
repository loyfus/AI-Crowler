// index.js
// -------------------------
// This file becomes a Vercel Serverless Function under /api/scrape

require('dotenv').config();

const axios      = require('axios');
const cheerio    = require('cheerio');
const pLimit     = require('p-limit').default;
const repository = require('./repository');

const JETBOOST_ID = process.env.JETBOOST_ID;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const MAX_TOOLS   = parseInt(process.env.MAX_TOOLS   || '10', 10);
const limit       = pLimit(CONCURRENCY);

// your list of tags
const TAGS = [
  'ai-detection','aggregators','avatar','chat','copywriting',
  'finance','for-fun','gaming','generative-art','generative-code',
  'generative-video','image-improvement','image-scanning',
  'inspiration','marketing','motion-capture','music','podcasting',
  'productivity','prompt-guides','research','self-improvement',
  'social-media','speech-to-text','text-to-speech','text-to-video',
  'translation','video-editing','voice-modulation'
];

async function fetchSlugsForTag(tag) {
  const url = `https://api.jetboost.io/filter?boosterId=${JETBOOST_ID}&q=${encodeURIComponent(tag)}`;
  const { data } = await axios.get(url);
  return Object.entries(data).filter(([,ok])=>ok).map(([s])=>s);
}

async function fetchLogoBase64(logoUrl) {
  try {
    const r = await axios.get(logoUrl, { responseType:'arraybuffer' });
    const ct = r.headers['content-type'] || 'image/png';
    const b  = Buffer.from(r.data,'binary').toString('base64');
    return `data:${ct};base64,${b}`;
  } catch {
    return null;
  }
}

async function resolveOriginalUrl(u) {
  try {
    const h = await axios.head(u, { maxRedirects:0, validateStatus:s=>s>=300&&s<400 });
    if (h.headers.location) return h.headers.location;
  } catch(e){
    if (e.response?.headers?.location) return e.response.headers.location;
  }
  try {
    const g = await axios.get(u, { maxRedirects:0, validateStatus:()=>true });
    if (g.headers.location) return g.headers.location;
    const m1 = g.data.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']\d+;\s*url=([^"']+)["']/i);
    if (m1) return m1[1];
    const m2 = g.data.match(/window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i);
    if (m2) return m2[1];
  } catch{}
  return u;
}

function stripRefParam(raw) {
  try {
    const U = new URL(raw);
    U.searchParams.delete('ref');
    return U.toString();
  } catch {
    return raw;
  }
}

async function translateGoogle(text, target) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx`
      + `&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await axios.get(url);
    return res.data[0].map(seg=>seg[0]).join('');
  } catch {
    return text;
  }
}

async function fetchToolDetail(slug) {
  const { data:html } = await axios.get(`https://www.futuretools.io/tools/${slug}`, {
    headers:{ 'User-Agent':'IA-Search-Bot/1.0' }
  });
  const $ = cheerio.load(html);

  const name        = $('h1.heading-3').first().text().trim();
  const description = $('h3.heading-2')
    .filter((i,el)=>$(el).text().includes('Description'))
    .next('.rich-text-block')
    .text()
    .trim();
  const logoUrl     = $('.tool-main-content img.image-3').attr('src');
  const redirect    = $('.div-block-6.vertical-flex a').first().attr('href');
  const pricing     = $('.div-block-17 .text-block-2').first().text().trim();

  const [logoBase64, rawUrl, pt, es] = await Promise.all([
    logoUrl  ? fetchLogoBase64(logoUrl)  : null,
    redirect ? resolveOriginalUrl(redirect): null,
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

async function scrapeAll() {
  await repository.init();
  const existing = await repository.getExistingSlugs();

  // prefetch all slugs per tag (round-robin)
  const slugsByTag = {};
  for (const tag of TAGS) {
    slugsByTag[tag] = await fetchSlugsForTag(tag);
  }
  const pointers = TAGS.reduce((acc, t) => (acc[t]=0, acc), {});
  let count = 0, more=true;
  const tasks=[];

  while(count < MAX_TOOLS && more) {
    more = false;
    for (const tag of TAGS) {
      const list = slugsByTag[tag];
      const i    = pointers[tag]++;
      if (i < list.length) {
        more = true;
        const slug = list[i];
        if (existing.has(slug)) continue;
        count++;
        tasks.push(limit(async ()=>{
          try {
            const tool = await fetchToolDetail(slug);
            await repository.saveTool(tool);
          } catch(e){
            /* ignore or log */
          }
        }));
        if (count>=MAX_TOOLS) break;
      }
    }
  }

  await Promise.all(tasks);
  return count;
}

// Vercel handler
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Use POST');
  }
  try {
    const processed = await scrapeAll();
    return res.status(200).json({ processed });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
