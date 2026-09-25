/**
 * Express app shared by the local server (server.js) and the Vercel function (../api/index.js).
 * Admin/content routes need ADMIN_PASSWORD when deployed (see lib/adminAuth.js); the
 * /api/* routes are what the Expo app calls, and they hold every server-side secret.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const express  = require('express')
const cors     = require('cors')
const path     = require('path')
const Asset    = require('./models/Asset')

const Chunk    = require('./models/Chunk')
const { queueIngest } = require('./lib/ragIngest')
const rateLimit = require('express-rate-limit')
const { chatWithRag, retrieveOnly } = require('./lib/ragChat')
const RagChunk = require('./models/RagChunk')
const { searchRagChunks } = require('./lib/ragSearch')
const { requireDb, connectDb } = require('./lib/db')
const { adminAuth } = require('./lib/adminAuth')
const { UPLOAD_DIR, createUploadMiddleware, persistFile } = require('./lib/storage')
const ai = require('./lib/ai')
const drive = require('./lib/drive')

const app = express()
const onVercel = !!process.env.VERCEL
if (onVercel) app.set('trust proxy', 1)
app.use(express.json({ limit: '50mb' }))

const ragLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false
})

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
})

// CORS: the web app is same-origin on Vercel and native apps don't send Origin, so
// cross-origin access is off when deployed unless ALLOWED_ORIGINS lists extra origins.
// Local dev stays open for LAN testing.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : !onVercel,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  })
)

// Content-admin UI (upload + browse). Served at /admin everywhere, and still at / locally.
app.use('/admin', adminAuth, express.static(path.join(__dirname, 'public')))
if (!onVercel) {
  app.use(express.static(path.join(__dirname, 'public')))
  app.use('/uploads', express.static(UPLOAD_DIR))
}

const upload = createUploadMiddleware()

// ── Upload route ──────────────────────────────────────────────
app.post('/upload', adminAuth, requireDb, upload.fields([
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

      original_filename:    req.files?.file?.[0]?.originalname || null,
    })

    // Save (and run the model's checks) before storing files, so rejected forms don't
    // leave orphan uploads in Blob storage.
    await asset.save()
    if (req.files?.file?.[0] || req.files?.transcript?.[0]) {
      asset.file_path            = await persistFile(req.files?.file?.[0])
      asset.transcript_file_path = await persistFile(req.files?.transcript?.[0])
      await asset.save()
    }

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
app.get('/assets', requireDb, async (req, res) => {
  try {
    const assets = await Asset.find({}, 'asset_id title').sort({ created_at: -1 })
    res.json(assets)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get recommended assets ───────────────────────────────────-
app.get('/assets/recommended', requireDb, async (req, res) => {
    try {
        const assets = await Asset.find().sort({ created_at: -1 })
        res.json(assets)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ── Get single asset ──────────────────────────────────────────
app.get('/assets/:id', requireDb, async (req, res) => {
    try {
      const asset = await Asset.findById(req.params.id)
      if (!asset) return res.status(404).json({ error: 'Asset not found' })
      res.json(asset)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
  
  // ── Search + filter assets ────────────────────────────────────
  app.get('/assets/search/query', requireDb, async (req, res) => {
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
  app.delete('/assets/:id', adminAuth, requireDb, async (req, res) => {
    try {
      await Chunk.deleteMany({ asset: req.params.id })
      await Asset.findByIdAndDelete(req.params.id)
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
  
  // ── Update asset ──────────────────────────────────────────────
  app.patch('/assets/:id', adminAuth, requireDb, upload.fields([
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
        updates.file_path         = await persistFile(req.files.file[0])
        updates.original_filename = req.files.file[0].originalname
        updates.rag_ready = false
        updates.embedding_status = 'not_started'
        updates.embedding_last_error = null
      }
      if (req.files?.transcript?.[0]) {
        updates.transcript_file_path = await persistFile(req.files.transcript[0])
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
  app.post('/assets/:id/generate-embeddings', adminAuth, requireDb, async (req, res) => {
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
  app.get('/assets/:id/embedding-status', adminAuth, requireDb, async (req, res) => {
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

  // ── RAG: chat + retrieve (Expo app) ───────────────────────────
  // Gemini key comes from the server env only; client-supplied keys are ignored.
  app.post('/api/rag/chat', ragLimiter, requireDb, async (req, res) => {
    try {
      const { geminiApiKey, ...body } = req.body || {}
      const out = await chatWithRag(body)
      res.json(out)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.status(500).json({ error: msg, answer: '', citations: [] })
    }
  })

  app.post('/api/rag/retrieve', ragLimiter, requireDb, async (req, res) => {
    try {
      const { query, topK, clinicalReviewedOnly } = req.body || {}
      const out = await retrieveOnly(query, {
        topK,
        clinicalReviewedOnly: clinicalReviewedOnly === true
      })
      res.json(out)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.status(500).json({ error: msg, context: '', citations: [], chunks: [] })
    }
  })

// ── RAG: vector search over RagChunk (sync from medical-knowledge.json) ──
app.post('/api/rag/search', ragLimiter, requireDb, async (req, res) => {
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

app.get('/api/rag/stats', requireDb, async (req, res) => {
  try {
    const totalChunks = await RagChunk.countDocuments()
    const sources = await RagChunk.distinct('source')
    res.json({ totalChunks, sources })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── AI features for the Expo app (moved server-side from utils/gemini.ts) ────
// Mongo is optional here: retrieval falls back to medical-knowledge.json without it.
const tryDb = (req, res, next) => {
  connectDb().catch(() => {}).finally(next)
}

const aiRoute = (handler) => async (req, res) => {
  try {
    res.json(await handler(req.body || {}))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ai]', req.path, msg)
    res.status(500).json({ error: msg })
  }
}

// Audio arrives inline (base64, short recordings) or as a Vercel Blob URL (web, long
// recordings). Blob audio is deleted as soon as it has been read.
app.post('/api/ai/transcribe', aiLimiter, aiRoute(async (body) => {
  const { audioBase64, blobUrl, mimeType, readingLevel } = body
  let buffer
  if (blobUrl) {
    const url = new URL(blobUrl)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.blob.vercel-storage.com')) {
      throw new Error('blobUrl must be a Vercel Blob URL')
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not read uploaded audio: ${res.status}`)
    buffer = Buffer.from(await res.arrayBuffer())
    require('@vercel/blob').del(blobUrl).catch((err) =>
      console.warn('[ai] could not delete audio blob', err.message)
    )
  } else if (audioBase64) {
    buffer = Buffer.from(audioBase64, 'base64')
  } else {
    throw new Error('Body must include audioBase64 or blobUrl')
  }
  return ai.transcribeAndSummarize({ buffer, mimeType, readingLevel })
}))

app.post('/api/ai/extract-visit', aiLimiter, aiRoute((body) => ai.extractVisitDetails(body)))
app.post('/api/ai/planner-questions', aiLimiter, aiRoute(async (body) => ({
  questions: await ai.suggestPlannerQuestions(body)
})))
app.post('/api/ai/visit-question', aiLimiter, aiRoute(async (body) => ({
  answer: await ai.askVisitQuestion(body)
})))
app.post('/api/ai/lesson', aiLimiter, tryDb, aiRoute((body) => ai.generateModuleLesson(body)))
app.post('/api/ai/educational', aiLimiter, tryDb, aiRoute((body) => ai.askEducationalQuestion(body)))

// Short-lived upload tokens so the browser can send long recordings straight to
// Vercel Blob (serverless request bodies are capped at 4.5 MB).
app.post('/api/blob/audio-upload', aiLimiter, async (req, res) => {
  try {
    const { handleUpload } = require('@vercel/blob/client')
    const out = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('visit-audio/')) throw new Error('Invalid upload path')
        return {
          allowedContentTypes: ['audio/*', 'video/webm'],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: true
        }
      }
    })
    res.json(out)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// ── Educational videos (Google Drive, service account stays server-side) ─────
app.get('/api/videos', aiLimiter, aiRoute(async () => ({
  videos: await drive.listEducationalVideos()
})))

app.get('/api/videos/:id/stream-url', aiLimiter, async (req, res) => {
  try {
    if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    res.json({ url: await drive.getVideoStreamUrl(req.params.id) })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// ── JSON error responses (multer / parse failures return HTML by default) ───
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  console.error(err)
  const status = err.status || err.statusCode || 500
  res.status(status).json({ success: false, error: err.message || String(err) })
})

module.exports = app
