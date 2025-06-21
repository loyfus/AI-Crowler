// repository.js
const mongoose = require('mongoose');

const uri    = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri || !dbName) {
  console.error('❌ Defina MONGODB_URI e MONGODB_DB_NAME no .env');
  process.exit(1);
}

// Modelo e esquema
const toolSchema = new mongoose.Schema({
  slug:           { type: String, required: true, unique: true },
  name:           { type: String, required: true },
  description_en: { type: String },
  description_pt: { type: String },
  description_es: { type: String },
  categories:     { type: [String], default: [] },
  logoBase64:     { type: String },
  officialUrl:    { type: String },
  pricingModel:   { type: String }
}, { collection: 'tools' });

const Tool = mongoose.models.Tool || mongoose.model('Tool', toolSchema);

let isConnected = false;

async function init() {
  if (isConnected) return;
  await mongoose.connect(uri, {
    dbName,
    useNewUrlParser:    true,
    useUnifiedTopology: true
  });
  isConnected = true;
}

async function getExistingSlugs() {
  await init();
  const docs = await Tool.find({}, 'slug').lean();
  return new Set(docs.map(d => d.slug));
}

async function saveTool(tool) {
  await init();
  // upsert pelo slug
  await Tool.findOneAndUpdate(
    { slug: tool.slug },
    {
      name:           tool.name,
      description_en: tool.description_en,
      description_pt: tool.description_pt,
      description_es: tool.description_es,
      categories:     tool.categories || [],
      logoBase64:     tool.logoBase64,
      officialUrl:    tool.officialUrl,
      pricingModel:   tool.pricingModel
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function addCategories(slug, categories) {
  await init();
  if (!Array.isArray(categories) || categories.length === 0) return;
  await Tool.updateOne(
    { slug },
    { $addToSet: { categories: { $each: categories } } }
  );
}

async function getAllTools() {
  await init();
  return Tool.find({}, {
    _id: 0,
    slug: 1,
    name: 1,
    description_en: 1,
    description_pt: 1,
    description_es: 1,
    categories: 1
  }).lean();
}

async function close() {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
  }
}

module.exports = { init, getExistingSlugs, saveTool, addCategories, getAllTools, close };
