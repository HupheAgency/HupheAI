import { contextBridge, ipcRenderer } from 'electron'

const g = globalThis as any

// Forward Huphe Code pipeline push events as CustomEvents
ipcRenderer.on('huphe-code:state-update', (_event, state) => {
  g.dispatchEvent(new g.CustomEvent('huphe-code:state-update', { detail: state }))
})
ipcRenderer.on('huphe-code:log', (_event, entry) => {
  g.dispatchEvent(new g.CustomEvent('huphe-code:log', { detail: entry }))
})

// Forward Settings mode-changed push event as CustomEvent
ipcRenderer.on('huphe:mode-changed', (_event, config) => {
  g.dispatchEvent(new g.CustomEvent('huphe:mode-changed', { detail: config }))
})

// Forward Orchestrator streaming events as CustomEvents
ipcRenderer.on('orchestrator:event', (_event, data) => {
  g.dispatchEvent(new g.CustomEvent('orchestrator:event', { detail: data }))
})

// Forward PDF slide-switch command from main
ipcRenderer.on('pdf:set-slide', (_event, index) => {
  g.dispatchEvent(new g.CustomEvent('pdf:set-slide', { detail: index }))
})

// Forward wizard screenshot progress events as CustomEvents
ipcRenderer.on('wizard:screenshot-progress', (_event, data) => {
  g.dispatchEvent(new g.CustomEvent('wizard:screenshot-progress', { detail: data }))
})

// Forward Pulse campaign streaming events as CustomEvents
ipcRenderer.on('pulse:event', (_event, data) => {
  g.dispatchEvent(new g.CustomEvent('pulse:event', { detail: data }))
})

// Forward auth deep links (hupheai://auth-callback)
ipcRenderer.on('auth:deep-link', (_event, url) => {
  g.dispatchEvent(new g.CustomEvent('auth:deep-link', { detail: url }))
})

// Forward Atelier chat streaming tokens
ipcRenderer.on('atelier:stream-chunk', (_event, token) => {
  g.dispatchEvent(new g.CustomEvent('atelier:stream-chunk', { detail: token }))
})

// Forward Engine push events
ipcRenderer.on('engine:message-added', (_event, data) => {
  g.dispatchEvent(new g.CustomEvent('engine:message-added', { detail: data }))
})
ipcRenderer.on('engine:file-changed', (_event, data) => {
  g.dispatchEvent(new g.CustomEvent('engine:file-changed', { detail: data }))
})
ipcRenderer.on('engine:stream-chunk', (_event, data) => {
  g.dispatchEvent(new g.CustomEvent('engine:stream-chunk', { detail: data }))
})
ipcRenderer.on('engine:agent-event', (_event, data) => {
  g.dispatchEvent(new g.CustomEvent('engine:agent-event', { detail: data }))
})

// Forward Atelier view commands from native menu
ipcRenderer.on('atelier:view-command', (_event, cmd) => {
  g.dispatchEvent(new g.CustomEvent('atelier:view-command', { detail: cmd }))
})

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  generateDeck: () => ipcRenderer.invoke('deck:generate'),
  importTemplate: (clientId: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('template:import', clientId, buffer),
  /** Opent een native .key bestandskiezer en importeert direct (werkt ook voor macOS bundles) */
  pickAndImportTemplate: (clientId: string) =>
    ipcRenderer.invoke('template:pick-and-import', clientId),
  /** Laad volledige templateData (incl. afbeeldingen) uit lokale cache */
  getLocalTemplateData: (clientId: string) =>
    ipcRenderer.invoke('template:get-local-data', clientId),
  /** Lijst alle clientIds waarvoor een lokale template bestaat */
  listLocalTemplates: () =>
    ipcRenderer.invoke('template:list-local'),
  /** Lijst lokale clients (nog niet in Supabase) */
  listLocalClients: () =>
    ipcRenderer.invoke('template:list-local-clients'),
  /** Maak een nieuwe lokale client aan en retourneer {id, name} */
  addLocalClient: (name: string) =>
    ipcRenderer.invoke('template:add-local-client', name),
  /** Verwijder lokale client inclusief alle template bestanden */
  deleteLocalClient: (clientId: string) =>
    ipcRenderer.invoke('template:delete-local-client', clientId),
  /** Lees lokale mappings voor een client */
  getLocalMappings: (clientId: string) =>
    ipcRenderer.invoke('template:get-local-mappings', clientId),
  /** Schrijf lokale mappings voor een client */
  setLocalMappings: (clientId: string, mappings: unknown) =>
    ipcRenderer.invoke('template:set-local-mappings', clientId, mappings),
  /** Converteer PDF buffer naar array van PNG dataURLs via pdftoppm */
  pdfToScreenshots: (pdfBuffer: ArrayBuffer) =>
    ipcRenderer.invoke('template:pdf-to-screenshots', pdfBuffer),
  /** Bouw een .key bestand vanuit TemplateData + pre-rendered shape PNGs */
  buildKeyFromHtml: (payload: { templateData: unknown; shapePngs: Record<string, string>; name: string; baseKeyClientId?: string }) =>
    ipcRenderer.invoke('template:build-key-from-html', payload),
  /** Sla een .key buffer op via native save dialog */
  saveKeyBuffer: (buffer: ArrayBuffer, fileName: string) =>
    ipcRenderer.invoke('key:save-buffer', buffer, fileName),
  upgradePlaceholders: (clientId: string, upgrades: Record<string, Array<{ ownedDrawableId: string; tagName: string }>>) =>
    ipcRenderer.invoke('template:upgrade-placeholders', clientId, upgrades),
  takeWizardScreenshots: (sessionPath: string, layoutNames: string[]) =>
    ipcRenderer.invoke('wizard:take-screenshots', sessionPath, layoutNames),
  cleanupWizardSession: (sessionPath: string) =>
    ipcRenderer.invoke('wizard:cleanup', sessionPath),
  // Calibration (visual fidelity)
  calibrationGetKeyPath: (clientId: string) =>
    ipcRenderer.invoke('calibration:get-key-path', clientId),
  calibrationDiff: (payload: unknown) =>
    ipcRenderer.invoke('calibration:diff', payload),
  calibrationPropose: (payload: unknown) =>
    ipcRenderer.invoke('calibration:propose', payload),
  // Skin rendering (screenshot-as-background)
  generateSkin: (payload: unknown) =>
    ipcRenderer.invoke('skin:generate', payload),
  // Editor side: drive the hidden offscreen calibration window.
  calibrationSessionStart: (payload: unknown) =>
    ipcRenderer.invoke('calibration:session-start', payload),
  calibrationRenderAndCapture: (payload: unknown) =>
    ipcRenderer.invoke('calibration:render-and-capture', payload),
  calibrationSessionEnd: () =>
    ipcRenderer.invoke('calibration:session-end'),
  // Hidden calibration window side: receive data + signal back to main.
  calibrationAppReady: () => ipcRenderer.send('calibration:app-ready'),
  calibrationRendered: () => ipcRenderer.send('calibration:rendered'),
  onCalibrationInit: (cb: (payload: any) => void) => {
    const h = (_e: unknown, p: any) => cb(p)
    ipcRenderer.on('calibration:init', h)
    return () => ipcRenderer.removeListener('calibration:init', h)
  },
  onCalibrationRender: (cb: (payload: any) => void) => {
    const h = (_e: unknown, p: any) => cb(p)
    ipcRenderer.on('calibration:render', h)
    return () => ipcRenderer.removeListener('calibration:render', h)
  },
  generateDeckStructured: (payload: unknown) => ipcRenderer.invoke('deck:generate-structured', payload),
  generatePreview: (payload: unknown) => ipcRenderer.invoke('deck:preview-generate', payload),
  exportPdfScreenshots: (payload: unknown) => ipcRenderer.invoke('deck:export-pdf-screenshots', payload),
  captureSlidePreviewsIpc: (payload: unknown) => ipcRenderer.invoke('deck:capture-slide-previews', payload),
  exportPptx: (payload: unknown) => ipcRenderer.invoke('deck:export-pptx', payload),
  exportPdfIr: (payload: unknown) => ipcRenderer.invoke('deck:export-pdf-ir', payload),
  importPresentationIr: (payload: unknown) => ipcRenderer.invoke('presentation:import-ir', payload),
  readPlaceholder: () => ipcRenderer.invoke('placeholder:read'),
  replacePlaceholder: (sourcePath: string) => ipcRenderer.invoke('placeholder:replace', sourcePath),
  pickAndReplacePlaceholder: () => ipcRenderer.invoke('placeholder:pick-and-replace'),
  deletePlaceholder: () => ipcRenderer.invoke('placeholder:delete'),
  readFileBuffer: (filePath: string) => ipcRenderer.invoke('fs:read-file-buffer', filePath),
  toHupheFileUrl: (filePath: string) => {
    if (/^(data:|https?:|huphe:)/i.test(filePath)) return filePath
    const raw = filePath.startsWith('file://') ? filePath.slice('file://'.length) : filePath
    return `huphe://file/${encodeURIComponent(decodeURIComponent(raw))}`
  },
  pickImage: () => ipcRenderer.invoke('image:pick'),
  downloadImageUrl: (url: string) => ipcRenderer.invoke('image:download-url', url),
  generateImage: (prompt: string, provider: string) => ipcRenderer.invoke('image:generate', prompt, provider),
  generateAtelierImage: (prompt: string, model: string, systemPrompt?: string, referenceImageSrc?: string, accessToken?: string, modelLabel?: string, maskImageSrc?: string) => ipcRenderer.invoke('image:generate-ai', { prompt, model, modelLabel, systemPrompt, referenceImageSrc, maskImageSrc, accessToken }),
  deleteLocalFile: (filePath: string) => ipcRenderer.invoke('image:delete-file', filePath),
  generateAtelierVideo: (prompt: string, model: string, systemPrompt?: string, accessToken?: string) => ipcRenderer.invoke('video:generate-ai', { prompt, model, systemPrompt, accessToken }),
  importPresentation: (fileName: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('presentation:import', { fileName, buffer }),
  importKeyAsProject: (filePath: string) =>
    ipcRenderer.invoke('key:import-as-project', filePath),
  importKeyAsProjectBuffer: (fileName: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('key:import-as-project-buffer', { fileName, buffer }),
  importKeyAsProjectFiles: (fileName: string, files: Record<string, ArrayBuffer>) =>
    ipcRenderer.invoke('key:import-as-project-files', fileName, files),
  generateTemplateTs: (payload: { templateData: unknown; name: string; clientId: string; sageTagMappings?: Record<string, Record<string, string>> }) =>
    ipcRenderer.invoke('template:generate-ts', payload),
  saveProject: (projectData: unknown, filePath?: string) => ipcRenderer.invoke('project:save', projectData, filePath),
  autoSaveProject: (projectData: unknown) => ipcRenderer.invoke('project:autosave', projectData),
  listProjects: () => ipcRenderer.invoke('project:list'),
  loadProject: (filePath: string) => ipcRenderer.invoke('project:load', filePath),
  deleteProject: (filePath: string) => ipcRenderer.invoke('project:delete', filePath),
  voiceCommand: (payload: unknown) => ipcRenderer.invoke('ai:voice-command', payload),
  resolveTagsWithAI: (payload: unknown) => ipcRenderer.invoke('ai:resolve-tags', payload),
  transformTextToSlides: (rawText: string, layouts: unknown[]) => ipcRenderer.invoke('ai:transform-text-to-slides', rawText, layouts),
  extractDocText: (payload: { fileName: string; buffer: ArrayBuffer }) => ipcRenderer.invoke('doc:extract-text', payload),
  meetingNotesSummarize: (payload: unknown) => ipcRenderer.invoke('ai:meeting-notes', payload),
  transcribeAudio: (payload: { audioBuffer: ArrayBuffer; mimeType: string }) =>
    ipcRenderer.invoke('ai:transcribe-audio', payload),
  getClientLogos: (clientId: string) => ipcRenderer.invoke('client:get-logos', clientId),
  saveClientLogo: (clientId: string, dataUrl: string, opts?: unknown) => ipcRenderer.invoke('client:save-logo', clientId, dataUrl, opts),
  setPrimaryClientLogo: (clientId: string, logoId: string) => ipcRenderer.invoke('client:set-primary-logo', clientId, logoId),
  deleteClientLogo: (clientId: string, logoId: string) => ipcRenderer.invoke('client:delete-logo', clientId, logoId),
  updateClientLogo: (clientId: string, logoId: string, patch: { label?: string }) => ipcRenderer.invoke('client:update-logo', clientId, logoId, patch),
  convertAdToHtml: (imageDataUrl: string) => ipcRenderer.invoke('ad:image-to-html', { imageDataUrl }),
  convertAdSmart: (imageDataUrl: string, imageModel?: string) => ipcRenderer.invoke('ad:convert-smart', { imageDataUrl, imageModel }),
  openAdLogWindow: () => ipcRenderer.invoke('ad:open-log-window'),
  onAdProgress: (cb: (message: string) => void) => {
    const handler = (_: unknown, msg: string) => cb(msg)
    ipcRenderer.on('ad:progress', handler)
    return () => ipcRenderer.removeListener('ad:progress', handler)
  },
  // ── Ollama installatie ──────────────────────────────────────────────────────
  ollamaCheckInstalled: () => ipcRenderer.invoke('ollama:check-installed'),
  ollamaInstall: () => ipcRenderer.invoke('ollama:install'),
  ollamaUninstall: () => ipcRenderer.invoke('ollama:uninstall'),
  ollamaPullModel: (model: string) => ipcRenderer.invoke('ollama:pull-model', model),
  ollamaRemoveModel: (model: string) => ipcRenderer.invoke('ollama:remove-model', model),
  onOllamaInstallProgress: (cb: (data: { msg: string; progress?: number }) => void) => {
    const handler = (_: unknown, data: { msg: string; progress?: number }) => cb(data)
    ipcRenderer.on('ollama:install-progress', handler)
    return () => ipcRenderer.removeListener('ollama:install-progress', handler)
  },
  onOllamaPullProgress: (cb: (data: { model: string; msg: string; progress?: number }) => void) => {
    const handler = (_: unknown, data: { model: string; msg: string; progress?: number }) => cb(data)
    ipcRenderer.on('ollama:pull-progress', handler)
    return () => ipcRenderer.removeListener('ollama:pull-progress', handler)
  },
  getUserId: () => ipcRenderer.invoke('user:get-id'),
  setJwt: (jwt: string) => ipcRenderer.invoke('auth:set-jwt', jwt),
  debugLog: (...args: unknown[]) => ipcRenderer.invoke('debug:log', ...args),
  devRestart: () => ipcRenderer.invoke('dev:restart'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  setKey: (name: string, value: string) => ipcRenderer.invoke('key:set', name, value),
  hasKey: (name: string) => ipcRenderer.invoke('key:has', name),

  // -------------------------------------------------------------------------
  //  Dialog — native OS dialogs
  // -------------------------------------------------------------------------
  dialog: {
    /** Open een native map-kiezer en geef het gekozen pad terug */
    openFolder: (): Promise<{ ok: boolean; canceled?: boolean; folderPath?: string }> =>
      ipcRenderer.invoke('dialog:open-folder'),
    /** Open een native bestandskiezer voor .key bestanden */
    openKeyFile: (): Promise<{ ok: boolean; canceled?: boolean; filePath?: string }> =>
      ipcRenderer.invoke('dialog:open-key-file'),
  },

  // -------------------------------------------------------------------------
  //  Huphe Code — AI Orchestratie Pipeline
  // -------------------------------------------------------------------------
  hupheCode: {
    /** Start de pipeline met een nieuwe taakinstructie */
    submitTask: (task: string, opts?: { screenshotPath?: string; designSpecPath?: string; projectPath?: string }) =>
      ipcRenderer.invoke('huphe-code:submit-task', task, opts),

    /** Lees de huidige pipeline state (éénmalig) */
    getState: () =>
      ipcRenderer.invoke('huphe-code:get-state'),

    /** Overschrijf deel van de state (reset, debug, handmatig starten) */
    setState: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke('huphe-code:set-state', patch),

    /** Geeft het pad naar de pipeline/ map (voor Finder etc.) */
    getPipelineDir: () =>
      ipcRenderer.invoke('huphe-code:pipeline-dir'),

    /** Lees de niet-versleutelde config (bijv. projectPath) */
    getConfig: () =>
      ipcRenderer.invoke('huphe-code:get-config'),

    /** Sla niet-versleutelde config op */
    setConfig: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke('huphe-code:set-config', patch),
  },

  // -------------------------------------------------------------------------
  //  Settings — Dual-mode configuratie (Antigravity ↔ API)
  // -------------------------------------------------------------------------
  settings: {
    /** Lees de huidige publieke config (mode, connectionStatus, welke keys aanwezig zijn) */
    getConfig: () =>
      ipcRenderer.invoke('settings:get-config'),

    /** Schakel tussen 'api' en 'antigravity'. Probet automatisch de MCP-verbinding. */
    setMode: (mode: 'api' | 'antigravity') =>
      ipcRenderer.invoke('settings:set-mode', mode),

    /** Patch niet-geheime config velden (bijv. defaultProvider, model) */
    patchConfig: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:patch-config', patch),

    /** Sla een API-key op via safeStorage (nooit plaintext) */
    saveKey: (name: string, value: string) =>
      ipcRenderer.invoke('settings:save-key', name, value),

    /** Hercheck de Antigravity MCP-verbinding handmatig */
    recheckAntigravity: () =>
      ipcRenderer.invoke('settings:recheck-antigravity'),

    /** Lees het actieve projectpad (of null als niet ingesteld) */
    getProjectPath: (): Promise<{ path: string | null }> =>
      ipcRenderer.invoke('settings:get-project-path'),

    /** Sla het actieve projectpad op (null om te wissen) */
    setProjectPath: (path: string | null): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:set-project-path', path),
  },

  // -------------------------------------------------------------------------
  //  Pulse — Autonoom reclamebureau orchestrator
  // -------------------------------------------------------------------------
  pulse: {
    /** Start een campagne. Streaming events komen binnen via CustomEvent 'pulse:event' op window. */
    start: (input: { brief: string; clientName: string; involvementLevel: 'low' | 'medium' | 'high' }) =>
      ipcRenderer.invoke('pulse:start', input),
    /** Stop de lopende campagne */
    cancel: () => ipcRenderer.invoke('pulse:cancel'),
    /** Geeft terug of er een campagne loopt */
    status: () => ipcRenderer.invoke('pulse:status'),
  },

  // -------------------------------------------------------------------------
  //  Orchestrator — Claude Code agent in Antigravity
  // -------------------------------------------------------------------------
  orchestrator: {
    /**
     * Voer een taak uit via Claude Code. Streaming events komen binnen via
     * het CustomEvent 'orchestrator:event' op window.
     *
     * permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
     */
    run: (task: string, opts?: {
      cwd?:            string   // project directory waar claude in werkt
      permissionMode?: string   // hoe autonoom claude mag handelen
      sessionId?:      string   // hervat een eerdere sessie
      systemPrompt?:   string   // extra context voor claude
      maxTurns?:       number   // max agent-iteraties (default 20)
    }) => ipcRenderer.invoke('orchestrator:run', task, opts),

    /** Stop de lopende taak */
    cancel: () => ipcRenderer.invoke('orchestrator:cancel'),

    /** Geeft terug of er een taak loopt + info over de claude binary */
    status: () => ipcRenderer.invoke('orchestrator:status'),
  },

  // -------------------------------------------------------------------------
  //  Engine — Autonomous Multi-Agent Command Center
  // -------------------------------------------------------------------------
  engine: {
    listAgents: () => ipcRenderer.invoke('engine:list-agents'),
    searchOpenRouterModels: (query: string) => ipcRenderer.invoke('engine:search-openrouter-models', query),
    listOpenRouterModelsByModality: (modality: 'image' | 'video') => ipcRenderer.invoke('engine:list-openrouter-models-by-modality', modality),
    ollamaStatus: () => ipcRenderer.invoke('engine:ollama-status'),
    listConversations: (payload: { accessToken: string }) => ipcRenderer.invoke('engine:list-conversations', payload),
    renameConversation: (payload: { accessToken: string; conversationId: string; title: string }) => ipcRenderer.invoke('engine:rename-conversation', payload),
    deleteConversation: (payload: { accessToken: string; conversationId: string }) => ipcRenderer.invoke('engine:delete-conversation', payload),
    generateTitle: (payload: { agentId: string; agentModel: string; message: string }) => ipcRenderer.invoke('engine:generate-title', payload),
    createConversation: (payload: { accessToken: string; title?: string; source?: string }) =>
      ipcRenderer.invoke('engine:create-conversation', payload),
    sendMessage: (payload: {
      accessToken: string
      conversationId: string
      agentId: string
      agentModel: string
      agentLabel?: string
      agentSystemPrompt?: string
      agentModality?: string
      message: string
      history: { role: string; content: string }[]
      attachments?: { name: string; type: 'text' | 'image'; content: string }[]
    }) => ipcRenderer.invoke('engine:send-message', payload),
    listMessages: (payload: { accessToken: string; conversationId: string }) =>
      ipcRenderer.invoke('engine:list-messages', payload),
    listAgentEvents: (payload: { accessToken: string; conversationId: string }) =>
      ipcRenderer.invoke('engine:list-agent-events', payload),
    listDocumentStates: (payload: { accessToken: string }) =>
      ipcRenderer.invoke('engine:list-document-states', payload),
    saveImage: (payload: { src: string; name?: string }) =>
      ipcRenderer.invoke('engine:save-image', payload),
    listSavedImages: () =>
      ipcRenderer.invoke('engine:list-saved-images'),
    deleteSavedImage: (payload: { path: string }) =>
      ipcRenderer.invoke('engine:delete-saved-image', payload),
    distillMemory: () => ipcRenderer.invoke('engine:distill-memory'),
    runTask: (payload: {
      accessToken: string
      conversationId: string
      task: string
      coordinatorAgentId: string
      workerAgents: string[]
    }) => ipcRenderer.invoke('engine:run-task', payload),
  },

  // -------------------------------------------------------------------------
  //  Atelier Chat — lokale AI-chat voor de Atelier promptbar
  // -------------------------------------------------------------------------
  atelierChat: {
    complete: (payload: {
      model?: string
      systemPrompt?: string
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
    }) => ipcRenderer.invoke('atelier:chat-complete', payload),
  },

  // -------------------------------------------------------------------------
  //  Banner — HTML5 display banner generator
  // -------------------------------------------------------------------------
  banner: {
    generate: (payload: unknown) => ipcRenderer.invoke('banner:generate', payload),
    export: (payload: { banners: { formatId: string; html: string }[]; title: string }) =>
      ipcRenderer.invoke('banner:export', payload),
  },

  // -------------------------------------------------------------------------
  //  Print — HTML5 print document generator
  // -------------------------------------------------------------------------
  brand: {
    research: (payload: { query: string; numImages?: number }) =>
      ipcRenderer.invoke('brand:research', payload),
  },

  print: {
    generate: (payload: unknown) => ipcRenderer.invoke('print:generate', payload),
    export: (payload: { print: { formatId: string; html: string }; title: string }) =>
      ipcRenderer.invoke('print:export', payload),
    exportPdf: (payload: { html: string; title: string; formatId?: string }) =>
      ipcRenderer.invoke('print:export-pdf', payload),
    capturePreview: (payload: { html: string; width: number; height: number }) =>
      ipcRenderer.invoke('print:capture-preview', payload),
  },

  // -------------------------------------------------------------------------
  //  Credits — Stripe Checkout + wallet (overige calls gaan via Supabase direct)
  // -------------------------------------------------------------------------
  credits: {
    /** Maak een Stripe Checkout Session aan en open de betalingspagina in de browser */
    checkout: (payload: { amountCents: number; userId: string; feePct: number }): Promise<{ ok: boolean; sessionId?: string; error?: string }> =>
      ipcRenderer.invoke('credits:checkout', payload),
  },

  // -------------------------------------------------------------------------
  //  Vision — lokaal visionmodel via Ollama
  // -------------------------------------------------------------------------
  setFullScreen: (flag: boolean): Promise<void> => ipcRenderer.invoke('window:set-fullscreen', flag),
  vision: {
    listModels: (): Promise<{ id: string; label: string; description: string; sizeGb: number; tag?: string; installed: boolean }[]> =>
      ipcRenderer.invoke('vision:list-models'),
    checkModel: (model: string): Promise<{ installed: boolean }> =>
      ipcRenderer.invoke('vision:check-model', { model }),
    pullModel: (
      model: string,
      onProgress: (pct: number, status: string) => void,
    ): Promise<{ ok: boolean; error?: string }> => {
      const handler = (_: Electron.IpcRendererEvent, data: { pct: number; status: string }) =>
        onProgress(data.pct, data.status)
      ipcRenderer.on('vision:pull-progress', handler)
      return ipcRenderer.invoke('vision:pull-model', { model }).finally(() => {
        ipcRenderer.removeListener('vision:pull-progress', handler)
      })
    },
    analyze: (payload: { src: string; model: string; prompt?: string }): Promise<{ ok: boolean; description?: string; error?: string }> =>
      ipcRenderer.invoke('vision:analyze', payload),
  },
})
