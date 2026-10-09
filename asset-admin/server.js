require('dotenv').config()
console.log('URI loaded:', process.env.MONGO_URI ? process.env.MONGO_URI.replace(/:[^:@]+@/, ':***@') : 'UNDEFINED');
const express  = require('express')
const cors     = require('cors')
const mongoose = require('mongoose')
const multer   = require('multer')
const path     = require('path')
const fs       = require('fs')
const Asset    = require('./models/Asset')

const UPLOAD_DIR = path.join(__dirname, 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })
const Chunk    = require('./models/Chunk')
const { queueIngest } = require('./lib/ragIngest')
const rateLimit = require('express-rate-limit')
const { chatWithRag, retrieveOnly } = require('./lib/ragChat')
const RagChunk = require('./models/RagChunk')
const { searchRagChunks } = require('./lib/ragSearch')

const app = express()
app.use(express.json())

const ragLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false
})

// CORS for mobile app → asset-admin RAG (prototype)
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key, x-rag-prototype')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  next()
})
app.use(cors({ origin: true }))
app.use(express.static(path.join(__dirname, 'public')))
app.use('/uploads', express.static(UPLOAD_DIR))

// ── File upload config ────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /mp4|mov|png|jpg|jpeg|pdf|txt|html|vtt|srt/
    const ext = path.extname(file.originalname).toLowerCase().slice(1)
    allowed.test(ext) ? cb(null, true) : cb(new Error('File type not allowed'))
  }
})

// ── Upload route ──────────────────────────────────────────────
app.post('/upload', upload.fields([
  { name: 'file',       maxCount: 1 },
  { name: 'transcript', maxCount: 1 }
]), async (req, res) => {
  try {
    const b = req.body

    const arr = (key) => {
      const v = b[key + '[]'] || b[key]
      if (!v) return []
      return Array.isArray(v) ? v : [v]
    }

    const boolField = (key) => {
      const v = b[key]
      if (v === 'true'  || v === true)  return true
      if (v === 'false' || v === false) return false
      return undefined
    }

    const boolOr = (key, fallback) => {
      const v = boolField(key)
      return v === undefined ? fallback : v
    }

    const languageVersions = arr('language_versions')
    const seqPos = parseInt(b.sequence_position, 10)

    const asset = new Asset({
      title:                  b.title,
      content_type:           b.content_type,
      module_id:              parseInt(b.module_id, 10),
      lesson_id:              b.lesson_id,
      author_source:          (b.author_source && String(b.author_source).trim()) || '',
      version:                b.version || 'v1.0',
      clinical_reviewed:      boolOr('clinical_reviewed', false),
      plain_language_version: boolOr('plain_language_version', false),
      language_versions:      languageVersions.length ? languageVersions : ['en'],

      disease_relevance_tags: arr('disease_relevance_tags'),
      concept_domain:         b.concept_domain,
      primary_concept:        b.primary_concept,
      secondary_concepts:     arr('secondary_concepts'),
      explains_symptom:       arr('explains_symptom'),
      explains_procedure:     arr('explains_procedure'),

      explanation_role:       b.explanation_role || 'definition',
      sequence_position:      Number.isFinite(seqPos) && seqPos >= 1 ? seqPos : 1,
      learning_objective:     b.learning_objective || '',
      bloom_level:            b.bloom_level || 'understand',
      object_granularity:     b.object_granularity || 'meso',
      can_stand_alone:        boolOr('can_stand_alone', true),
      prerequisite_concept_ids: arr('prerequisite_concept_ids'),
      next_concept_ids:         arr('next_concept_ids'),
      instructional_strategy:   arr('instructional_strategy'),

      target_audience:           arr('target_audience'),
      health_literacy_level:     b.health_literacy_level,
      medical_terminology_level: b.medical_terminology_level,
      reading_level_grade:       b.reading_level_grade ? parseInt(b.reading_level_grade, 10) : undefined,
      modality_type:             b.modality_type || 'audio_visual',

      stress_state_compatibility: arr('stress_state_compatibility'),
      parent_expertise_stage:     arr('parent_expertise_stage'),
      care_journey_stage:         arr('care_journey_stage'),
      cognitive_load_rating:      b.cognitive_load_rating || 'medium',
      element_interactivity:      b.element_interactivity || 'medium',
      appropriate_after_event:    arr('appropriate_after_event'),
      contraindicated_after_event: arr('contraindicated_after_event'),
      just_in_time_trigger:       b.just_in_time_trigger,

      emotional_tone:              b.emotional_tone || 'reassuring',
      emotional_sensitivity_level: b.emotional_sensitivity_level || 'medium',
      includes_reassurance:        boolOr('includes_reassurance', false),
      addresses_guilt_or_blame:  boolOr('addresses_guilt_or_blame', false),
      decision_support_context:    boolOr('decision_support_context', false),
      isolation_acknowledgment:    boolOr('isolation_acknowledgment', false),

      parent_question_patterns: arr('parent_question_patterns'),
      query_synonyms:           arr('query_synonyms'),
      intent_type:              b.intent_type || 'explain',
      response_type:            b.response_type || 'explanation',
      keyword_triggers:         arr('keyword_triggers'),

      closed_captions:          boolField('closed_captions'),
      alt_text:                 b.alt_text,
      audio_narration:          boolOr('audio_narration', false),
      screen_reader_compatible: boolOr('screen_reader_compatible', true),
      mobile_optimized:         boolOr('mobile_optimized', true),

      file_path:            req.files?.file?.[0]
                              ? `/uploads/${req.files.file[0].filename}` : null,
      original_filename:    req.files?.file?.[0]?.originalname || null,
      transcript_file_path: req.files?.transcript?.[0]
                              ? `/uploads/${req.files.transcript[0].filename}` : null,
    })

    await asset.save()

    const genEmb = b.generate_embeddings === 'true' || b.generate_embeddings === true
    if (genEmb) {
      await Asset.findByIdAndUpdate(asset._id, {
        embedding_status: 'queued',
        embedding_updated_at: new Date()
      })
      queueIngest(asset._id.toString())
    }

    const fresh = await Asset.findById(asset._id)
    res.json({ success: true, asset_id: fresh.asset_id, asset: fresh })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ── Fetch all assets (used by typeahead) ──────────────────────
app.get('/assets', async (req, res) => {
  try {
    const assets = await Asset.find({}, 'asset_id title').sort({ created_at: -1 })
    res.json(assets)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get recommended assets ───────────────────────────────────-
app.get('/assets/recommended', async (req, res) => {
    try {
        const assets = await Asset.find().sort({ created_at: -1 })
        res.json(assets)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ── Get single asset ──────────────────────────────────────────
app.get('/assets/:id', async (req, res) => {
    try {
      const asset = await Asset.findById(req.params.id)
      if (!asset) return res.status(404).json({ error: 'Asset not found' })
      res.json(asset)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
  
  // ── Search + filter assets ────────────────────────────────────
  app.get('/assets/search/query', async (req, res) => {
    try {
      const { q, content_type, disease_tag, concept_domain, embedding_status } = req.query
      const filter = {}
      if (q) {
        filter.$or = [
          { title:    { $regex: q, $options: 'i' } },
          { asset_id: { $regex: q, $options: 'i' } }
        ]
      }
      if (content_type)  filter.content_type          = content_type
      if (disease_tag)   filter.disease_relevance_tags = disease_tag
      if (concept_domain) filter.concept_domain        = concept_domain
      if (embedding_status) filter.embedding_status    = embedding_status
  
      const assets = await Asset.find(filter)
        .sort({ created_at: -1 })
        .limit(200)
      res.json(assets)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
  
  // ── Delete asset ──────────────────────────────────────────────
  app.delete('/assets/:id', async (req, res) => {
    try {
      await Chunk.deleteMany({ asset: req.params.id })
      await Asset.findByIdAndDelete(req.params.id)
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
  
  // ── Update asset ──────────────────────────────────────────────
  app.patch('/assets/:id', upload.fields([
    { name: 'file',       maxCount: 1 },
    { name: 'transcript', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const b = req.body
      const arr = (key) => {
        const v = b[key + '[]'] || b[key]
        if (!v) return undefined
        return Array.isArray(v) ? v : [v]
      }
      const boolField = (key) => {
        const v = b[key]
        if (v === 'true'  || v === true)  return true
        if (v === 'false' || v === false) return false
        return undefined
      }
  
      const updates = {}
      const simpleFields = [
        'title','content_type','module_id','lesson_id','author_source','version',
        'concept_domain','primary_concept','explanation_role','sequence_position',
        'learning_objective','bloom_level','object_granularity','health_literacy_level',
        'medical_terminology_level','reading_level_grade','modality_type',
        'cognitive_load_rating','element_interactivity','just_in_time_trigger',
        'emotional_tone','emotional_sensitivity_level','intent_type','response_type','alt_text'
      ]
      simpleFields.forEach(f => { if (b[f] !== undefined) updates[f] = b[f] })
  
      const arrayFields = [
        'language_versions','disease_relevance_tags','secondary_concepts',
        'explains_symptom','explains_procedure','prerequisite_concept_ids',
        'next_concept_ids','instructional_strategy','target_audience',
        'stress_state_compatibility','parent_expertise_stage','care_journey_stage',
        'appropriate_after_event','contraindicated_after_event',
        'parent_question_patterns','query_synonyms','keyword_triggers'
      ]
      arrayFields.forEach(f => {
        const v = arr(f)
        if (v !== undefined) updates[f] = v
      })
  
      const boolFields = [
        'clinical_reviewed','plain_language_version','can_stand_alone',
        'includes_reassurance','addresses_guilt_or_blame','decision_support_context',
        'isolation_acknowledgment','audio_narration','screen_reader_compatible',
        'mobile_optimized','closed_captions'
      ]
      boolFields.forEach(f => {
        const v = boolField(f)
        if (v !== undefined) updates[f] = v
      })
  
      if (req.files?.file?.[0]) {
        updates.file_path         = `/uploads/${req.files.file[0].filename}`
        updates.original_filename = req.files.file[0].originalname
        updates.rag_ready = false
        updates.embedding_status = 'not_started'
        updates.embedding_last_error = null
      }
      if (req.files?.transcript?.[0]) {
        updates.transcript_file_path = `/uploads/${req.files.transcript[0].filename}`
        updates.rag_ready = false
        updates.embedding_status = 'not_started'
        updates.embedding_last_error = null
      }

      const genEmb = b.generate_embeddings === 'true' || b.generate_embeddings === true
      if (genEmb) {
        updates.embedding_status = 'queued'
        updates.embedding_updated_at = new Date()
      }
  
      const asset = await Asset.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
      )
      if (!asset) return res.status(404).json({ error: 'Asset not found' })

      if (genEmb) {
        queueIngest(asset._id.toString())
      }

      res.json({ success: true, asset })
    } catch (err) {
      res.status(400).json({ success: false, error: err.message })
    }
  })

  // ── RAG: enqueue embedding generation for an asset ────────────
  app.post('/assets/:id/generate-embeddings', async (req, res) => {
    try {
      const asset = await Asset.findById(req.params.id)
      if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' })

      await Asset.findByIdAndUpdate(req.params.id, {
        embedding_status: 'queued',
        embedding_last_error: null,
        embedding_updated_at: new Date()
      })
      queueIngest(req.params.id)
      res.json({ success: true, message: 'queued' })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  // ── RAG: embedding status (for admin UI polling) ─────────────
  app.get('/assets/:id/embedding-status', async (req, res) => {
    try {
      const asset = await Asset.findById(req.params.id).select(
        'rag_ready embedding_status embedding_last_error embedding_updated_at asset_id title'
      )
      if (!asset) return res.status(404).json({ error: 'Asset not found' })
      res.json(asset)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── RAG: chat + retrieve (Expo app, prototype) ───────────────
  app.post('/api/rag/chat', ragLimiter, async (req, res) => {
    try {
      const key = req.body?.geminiApiKey || req.headers['x-gemini-api-key']
      const out = await chatWithRag({ ...req.body, geminiApiKey: key })
      res.json(out)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.status(500).json({ error: msg, answer: '', citations: [] })
    }
  })

  app.post('/api/rag/retrieve', ragLimiter, async (req, res) => {
    try {
      const key = req.body?.geminiApiKey || req.headers['x-gemini-api-key']
      const { query, topK, clinicalReviewedOnly } = req.body || {}
      const out = await retrieveOnly(query, {
        geminiApiKey: key,
        topK,
        clinicalReviewedOnly: clinicalReviewedOnly === true
      })
      res.json(out)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.status(500).json({ error: msg, context: '', citations: [], chunks: [] })
    }
  })





/*

// ── Quick test route (remove before going to production) ─────
app.get('/test-save', async (req, res) => {
    try {
      const asset = new Asset({
        title:                  'Test asset — pulmonary surfactant intro',
        content_type:           'animation',
        module_id:              1,
        lesson_id:              '1.1',
        author_source:          'Test Author',
        version:                'v1.0',
        clinical_reviewed:      true,
        plain_language_version: false,
        language_versions:      ['en'],
  
        disease_relevance_tags: ['general chILD'],
        concept_domain:         'lung_biology',
        primary_concept:        'pulmonary surfactant',
        secondary_concepts:     ['alveoli', 'surface tension'],
  
        explanation_role:       'definition',
        sequence_position:      1,
        learning_objective:     'Explain how surfactant keeps alveoli open',
        bloom_level:            'understand',
        object_granularity:     'meso',
        can_stand_alone:        true,
  
        target_audience:           ['caregiver_parent'],
        health_literacy_level:     'functional',
        medical_terminology_level: 'minimal',
        modality_type:             'audio_visual',
  
        stress_state_compatibility: ['baseline_calm','mild_concern'],
        parent_expertise_stage:     ['novice','emerging'],
        care_journey_stage:         ['diagnosis','home_management'],
        cognitive_load_rating:      'low',
        element_interactivity:      'low',
  
        emotional_tone:              'reassuring',
        emotional_sensitivity_level: 'low',
        includes_reassurance:        false,
        addresses_guilt_or_blame:    false,
        decision_support_context:    false,
        isolation_acknowledgment:    false,
  
        parent_question_patterns: [
          'Why does my child need oxygen?',
          'What is surfactant?'
        ],
        intent_type:      'explain',
        response_type:    'explanation',
        keyword_triggers: ['surfactant','oxygen','alveoli'],
  
        closed_captions:          true,
        alt_text:                 'Animated diagram showing surfactant molecules lining alveoli',
        audio_narration:          false,
        screen_reader_compatible: true,
        mobile_optimized:         true,
      })
  
      await asset.save()
      res.json({ success: true, asset_id: asset.asset_id, asset })
    } catch (err) {
      res.status(400).json({ success: false, error: err.message })
    }
  })
 

*/
















// ── JSON error responses (multer / parse failures return HTML by default) ───
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  console.error(err)
  const status = err.status || err.statusCode || 500
  res.status(status).json({ success: false, error: err.message || String(err) })
})

// ── RAG: vector search over RagChunk (sync from medical-knowledge.json) ──
app.post('/api/rag/search', async (req, res) => {
  try {
    const { query, topK = 3, minSimilarity = 0.3 } = req.body || {}
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Body must include { query: string }' })
    }
    const results = await searchRagChunks({
      query,
      RagChunk,
      topK: Number(topK) || 3,
      minSimilarity: Number(minSimilarity) || 0.3,
    })
    res.json({ results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/rag/stats', async (req, res) => {
  try {
    const totalChunks = await RagChunk.countDocuments()
    const sources = await RagChunk.distinct('source')
    res.json({ totalChunks, sources })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Connect to MongoDB then start server ──────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB')
    console.warn(
      '[prototype] RAG routes (/api/rag/*) have no user authentication — use only on trusted networks.'
    )
    app.listen(process.env.PORT || 3000, () =>
      console.log(`Server running at http://localhost:${process.env.PORT || 3000}`)
    )
  })
  .catch(err => console.error('Connection error:', err))
