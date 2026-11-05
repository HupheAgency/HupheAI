/** Provider contracts and saved editor requests, without network, keys or paid jobs. */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const dir = await mkdtemp(join(tmpdir(), 'huphe-model-contract-'))
try {
  const file = join(dir, 'contracts.mjs')
  await build({ stdin: { contents: `export * from './supabase/functions/_shared/video-generation-contract'; export * from './src/shared/video-model-capabilities'; export * from './src/renderer/src/components/video-timeline/timeline-generation'; export {parseTimelineProject} from './src/main/lib/video-timeline-storage'; export {newTimelineProject} from './src/shared/video-timeline'`, resolveDir: resolve('.') }, bundle: true, platform: 'node', format: 'esm', outfile: file, logLevel: 'silent' })
  const m = await import(pathToFileURL(file).href)
  const base = id => ({ model_id: id, provider: 'fal', supported_durations: id === m.SEEDANCE ? Array.from({length:27},(_,i)=>i+4) : [5,10], supported_resolutions: id === m.KLING ? ['1080p'] : ['480p','720p','1080p'], supported_aspect_ratios: ['16:9','9:16','1:1',...(id===m.SEEDANCE?['auto']:[])], generate_audio: id !== m.WAN, seed: id === m.SEEDANCE, bitrate_mode:id===m.SEEDANCE, codec:id===m.SEEDANCE, supports_end_image:[m.SEEDANCE,m.KLING].includes(id), supports_references:id===m.SEEDANCE, reference_limits:id===m.SEEDANCE?{image:30,video:10,audio:10}:undefined, supports_auto_duration:id===m.SEEDANCE, supports_draft:id===m.SEEDANCE, pricing_skus:{duration_seconds:'0.1'}, markup_pct:0, video_cost_estimate:10000 })
  const input = {prompt:'A blue paper boat on a lake',duration:8,resolution:'720p',aspect_ratio:'16:9',generate_audio:false}
  const url = 'https://example.test/source.png', video = 'https://example.test/source.mp4'
  const seed = m.buildVideoGenerationRequest(base(m.SEEDANCE), {...input, draft:true, image_urls:[url]})
  assert.equal(seed.endpoint, 'bytedance/seedance-2.5/us/reference-to-video')
  assert.equal(seed.body.draft,true); assert.equal(seed.body.resolution,'480p')
  for (const task of ['auto','reference','editing','extension']) {
    const r=m.buildVideoGenerationRequest(base(m.SEEDANCE), {...input, task, video_urls:[video], seed:42})
    assert.equal(r.body.task,task); assert.equal(r.body.duration,task==='editing'?'auto':'8'); assert.equal(r.body.seed,42)
    if(['editing','extension'].includes(task)) assert.equal(r.body.aspect_ratio,'auto')
  }
  assert.equal(m.buildVideoGenerationRequest(base(m.SEEDANCE),{...input,prompt:'',image_url:url,end_image_url:url}).body.end_image_url,url)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.SEEDANCE),{...input,seed:42}),/Seed/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.SEEDANCE),{...input,task:'extension',image_urls:[url]}),/videoreferentie/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.SEEDANCE),{...input,image_urls:Array(31).fill(url)}),/Te veel/)
  for (const variant of ['standard','fast']) {
    const prefix=`fal-ai/veo3.1${variant==='fast'?'/fast':''}`
    const r=m.buildVideoGenerationRequest(base(m.VEO),{...input,duration:4,extra_params:{variant,negative_prompt:'text',auto_fix:true},seed:7})
    assert.equal(r.endpoint,prefix); assert.equal(r.body.duration,'4s');assert.equal(r.body.seed,7);assert.equal(r.body.negative_prompt,'text');assert.ok(!('variant'in r.body))
    const frames=m.buildVideoGenerationRequest(base(m.VEO),{...input,image_url:url,end_image_url:url,extra_params:{variant}})
    assert.equal(frames.endpoint,prefix+'/first-last-frame-to-video');assert.equal(frames.body.first_frame_url,url);assert.equal(frames.body.last_frame_url,url);assert.ok(!('image_url'in frames.body))
    const refs=m.buildVideoGenerationRequest(base(m.VEO),{...input,image_urls:[url,url,url],extra_params:{variant}})
    assert.equal(refs.endpoint,prefix+'/reference-to-video');assert.equal(refs.body.duration,'8s');assert.ok(!('task'in refs.body));assert.ok(!('seed'in refs.body))
    const ext=m.buildVideoGenerationRequest(base(m.VEO),{...input,duration:7,task:'extension',video_urls:[video],extra_params:{variant}})
    assert.equal(ext.endpoint,prefix+'/extend-video');assert.equal(ext.body.video_url,video);assert.equal(ext.body.duration,'7s');assert.equal(ext.body.resolution,'720p');assert.equal(ext.videoReferenceDiscount,1)
  }
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.VEO),{...input,duration:4,resolution:'4k'}),/8 seconden/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.VEO),{...input,aspect_ratio:'1:1'}),/beeldverhouding/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.VEO),{...input,image_urls:[url],seed:7}),/Seed/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.VEO),{...input,image_urls:[url],extra_params:{negative_prompt:'x'}}),/niet beschikbaar/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.VEO),{...input,task:'editing',video_urls:[video]}),/niet ondersteund/)
  const wan=m.buildVideoGenerationRequest(base(m.WAN),{...input,duration:5,image_url:url,audio_urls:['https://example.test/music.wav'],seed:123,extra_params:{negative_prompt:'blurry',enable_prompt_expansion:false,enable_safety_checker:true}})
  assert.equal(wan.endpoint,'fal-ai/wan/v2.7/image-to-video');assert.equal(wan.body.duration,5);assert.equal(wan.body.resolution,'720p');assert.equal(wan.body.audio_url,'https://example.test/music.wav');assert.equal(wan.body.seed,123);assert.equal(wan.body.enable_prompt_expansion,false)
  for(const key of ['generate_audio','aspect_ratio','audio_urls','task','draft']) assert.ok(!(key in wan.body),key)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.WAN),{...input,duration:5,extra_params:{negative_prompt:'x'.repeat(501)}}),/te lange/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.WAN),{...input,duration:5,end_image_url:url}),/eindbeeld/)
  const wanEnd=m.buildVideoGenerationRequest(base(m.WAN),{...input,duration:5,image_url:url,end_image_url:url});assert.equal(wanEnd.body.end_image_url,url)
  const wanText=m.buildVideoGenerationRequest(base(m.WAN),{...input,duration:12,resolution:'1080p'});assert.equal(wanText.endpoint,'fal-ai/wan/v2.7/text-to-video');assert.equal(wanText.body.aspect_ratio,'16:9')
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.WAN),{...input,prompt:'',duration:5}),/prompt/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.WAN),{...input,duration:16}),/generatieduur/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.WAN),{...input,resolution:'480p',duration:5}),/resolutie/)
  const shots=[{prompt:'The boat moves',duration:'3'},{prompt:'Camera moves closer',duration:'5'}]
  const kling=m.buildVideoGenerationRequest(base(m.KLING),{...input,resolution:'1080p',prompt:'',image_url:url,end_image_url:url,extra_params:{multi_prompt:shots}})
  assert.equal(kling.endpoint,'fal-ai/kling-video/v4/image-to-video');assert.equal(kling.body.start_image_url,url);assert.equal(kling.body.end_image_url,url);assert.equal(kling.body.duration,8);assert.equal(kling.body.resolution,'1080p')
  assert.deepEqual(kling.body.multi_prompt,[{prompt:'The boat moves',duration:3},{prompt:'Camera moves closer',duration:5}]);assert.ok(!('aspect_ratio'in kling.body));assert.ok(!('prompt'in kling.body));assert.ok(!('generate_audio'in kling.body))
  const klingText=m.buildVideoGenerationRequest(base(m.KLING),{...input,duration:20,resolution:'720p',aspect_ratio:'21:9'});assert.equal(klingText.endpoint,'kling/v4/text-to-video');assert.equal(klingText.body.duration,20);assert.equal(klingText.body.aspect_ratio,'21:9')
  const klingNoPrompt=m.buildVideoGenerationRequest(base(m.KLING),{...input,prompt:'',image_url:url});assert.ok(!('prompt'in klingNoPrompt.body))
  assert.deepEqual(m.enhanceVideoCapability(base(m.KLING)).supported_durations,Array.from({length:28},(_,i)=>i+3))
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.KLING),{...input,resolution:'1080p',extra_params:{multi_prompt:shots}}),/niet beide/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.KLING),{...input,prompt:'',extra_params:{multi_prompt:[{prompt:'x'.repeat(513),duration:8}]}}),/512/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.KLING),{...input,prompt:'',extra_params:{multi_prompt:[{prompt:'a',duration:3}]}}),/gelijk/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.KLING),{...input,prompt:''}),/prompt/)
  assert.throws(()=>m.buildVideoGenerationRequest(base(m.KLING),{...input,extra_params:{cfg_scale:0.5}}),/niet beschikbaar/)
  const assets=[{id:'image-1',kind:'image',name:'Start',path:'/original.png',src:'huphe://test',duration:0},{id:'audio-1',kind:'audio',name:'Music',path:'/music.wav',src:'huphe://music',duration:4},{id:'video-1',kind:'video',name:'Source',path:'/video.mp4',src:'huphe://video',duration:7}]
  const g={prompt:'Paper boat',modelId:m.WAN,provider:'fal',requestedDuration:5,resolution:'720p',aspectRatio:'16:9',referenceAssetId:'image-1',referenceAssetIds:['audio-1'],seed:123,extraParams:{negative_prompt:'text',enable_prompt_expansion:false}}
  const state=m.timelineGenerationState(g,m.enhanceVideoCapability(base(m.WAN)),assets)
  assert.deepEqual(state.errors,[]);assert.equal(state.start.id,'image-1');assert.equal(state.snapshot.seed,123);assert.equal(state.snapshot.aspectRatio,'auto');assert.equal(state.snapshot.extraParams.enable_prompt_expansion,false)
  const extended=m.timelineGenerationState({...g,modelId:m.SEEDANCE,requestedDuration:8,task:'extension',referenceAssetIds:['video-1'],draft:true},m.enhanceVideoCapability(base(m.SEEDANCE)),assets)
  assert.deepEqual(extended.errors,[]);assert.equal(extended.snapshot.requestedDuration,8);assert.equal(extended.snapshot.draft,true);assert.equal(extended.start,undefined)
  const veo=m.timelineGenerationState({...g,modelId:m.VEO,task:'extension',referenceAssetIds:['video-1'],requestedDuration:4,resolution:'1080p'},m.enhanceVideoCapability(base(m.VEO)),assets)
  assert.deepEqual(veo.errors,[]);assert.equal(veo.snapshot.requestedDuration,7);assert.equal(veo.snapshot.resolution,'720p')
  const project=m.newTimelineProject('Saved capabilities'); project.jobs=[{id:'job-1',clipId:'clip-1',createdAt:new Date().toISOString(),generation:state.snapshot,status:'completed'}]
  assert.deepEqual(m.parseTimelineProject(project).jobs[0].generation.extraParams,state.snapshot.extraParams)
  assert.ok(m.videoExtraParamErrors({elements:{type:'json',label:'Elements'}},{elements:[{frontal_image_url:'',reference_image_urls:[]}]}).length)
  console.log('PASS: provider request contracts, mode limits, Seedance drafts/extension, Veo Standard/Fast routes, Wan audio, Kling shots/elements, editor snapshots and persistence. No provider calls.')
} finally { await rm(dir,{recursive:true,force:true}) }
