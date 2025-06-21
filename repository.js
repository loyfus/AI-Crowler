// repository.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function init() {
  // Verifica apenas a conectividade / existência da tabela
  const { error } = await supabase
    .from('tools')
    .select('slug')
    .limit(1);
  if (error) throw error;
}

async function getExistingSlugs() {
  const { data, error } = await supabase
    .from('tools')
    .select('slug');
  if (error) throw error;
  return new Set(data.map(r => r.slug));
}

async function saveTool(tool) {
  // Upsert no Supabase
  const { error } = await supabase
    .from('tools')
    .upsert({
      slug:            tool.slug,
      name:            tool.name,
      description_en:  tool.description_en,
      description_pt:  tool.description_pt,
      description_es:  tool.description_es,
      logoBase64:      tool.logoBase64,
      officialUrl:     tool.officialUrl,
      pricingModel:    tool.pricingModel
    }, { onConflict: 'slug' });
  if (error) throw error;
}

async function getAllTools() {
  const { data, error } = await supabase
    .from('tools')
    .select(`
      slug,
      name,
      description_en,
      description_pt,
      description_es
    `);
  if (error) throw error;
  return data;
}

module.exports = { init, getExistingSlugs, saveTool, getAllTools };
