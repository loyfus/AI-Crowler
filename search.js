require('dotenv').config();

const natural    = require('natural');
const repository = require('./repository');

async function search(query, topK = 5) {
  const rows = await repository.getAllTools();

  // Monta TF–IDF indexando EN+PT+ES juntos
  const tfidf = new natural.TfIdf();
  const docs  = rows.map(r => {
    const text = [ r.description_en, r.description_pt, r.description_es ].join(' ');
    tfidf.addDocument(text);
    return { slug: r.slug, name: r.name };
  });

  const scores = [];
  tfidf.tfidfs(query, (i, measure) => {
    scores.push({ ...docs[i], score: measure });
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

if (require.main === module) {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.error('Use: node search.js <termo de busca>');
    process.exit(1);
  }
  search(query).then(results => {
    console.log('Top resultados:');
    results.forEach((r, idx) => {
      console.log(`${idx+1}. ${r.slug} (${r.score.toFixed(4)}): ${r.name}`);
    });
  }).catch(console.error);
}

module.exports = { search };
