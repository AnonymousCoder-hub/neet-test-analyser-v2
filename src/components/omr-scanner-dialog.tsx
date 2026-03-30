'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Upload, Play, RotateCcw, Loader2, CheckCircle2, AlertCircle, Save, FolderOpen, Download, Trash2, AlignVerticalSpaceAround, ZoomIn, X, ChevronDown, ChevronUp } from 'lucide-react'

const NUM_COLS = 4
const QUESTIONS_PER_COL = 45
const OPTIONS = 4

interface Preset {
  name: string
  createdAt: string
  settings: {
    rectX: number
    rectY: number
    rectW: number
    rectH: number
    col1: number
    col2: number
    col3: number
    col4: number
    optGap: number
    startY: number
    endY: number
    bubbleR: number
    globalYOffset: number
    col1Y: number
    col2Y: number
    col3Y: number
    col4Y: number
    col1StartY: number
    col2StartY: number
    col3StartY: number
    col4StartY: number
    col1EndY: number
    col2EndY: number
    col3EndY: number
    col4EndY: number
    fillThreshold: number
    minDifference: number
  }
}

interface OMRScannerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAnswersDetected: (answers: string[]) => void
}

export function OMRScannerDialog({ open, onOpenChange, onAnswersDetected }: OMRScannerDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)

  // Selection rectangle
  const [rectX, setRectX] = useState(50)
  const [rectY, setRectY] = useState(100)
  const [rectW, setRectW] = useState(300)
  const [rectH, setRectH] = useState(800)

  // Column X positions
  const [col1, setCol1] = useState(20)
  const [col2, setCol2] = useState(95)
  const [col3, setCol3] = useState(170)
  const [col4, setCol4] = useState(245)

  // Global row calibration (default for all columns)
  const [startY, setStartY] = useState(15)
  const [endY, setEndY] = useState(700)

  // Bubble settings
  const [optGap, setOptGap] = useState(15)
  const [bubbleR, setBubbleR] = useState(8)

  // Per-column Y offsets (shifting the whole column up/down)
  const [col1Y, setCol1Y] = useState(0)
  const [col2Y, setCol2Y] = useState(0)
  const [col3Y, setCol3Y] = useState(0)
  const [col4Y, setCol4Y] = useState(0)

  // Global Y offset (shifts ALL columns together)
  const [globalYOffset, setGlobalYOffset] = useState(0)

  // Per-column vertical row spacing overrides
  const [col1StartY, setCol1StartY] = useState(-1)
  const [col2StartY, setCol2StartY] = useState(-1)
  const [col3StartY, setCol3StartY] = useState(-1)
  const [col4StartY, setCol4StartY] = useState(-1)
  const [col1EndY, setCol1EndY] = useState(-1)
  const [col2EndY, setCol2EndY] = useState(-1)
  const [col3EndY, setCol3EndY] = useState(-1)
  const [col4EndY, setCol4EndY] = useState(-1)

  // Detection tuning
  const [fillThreshold, setFillThreshold] = useState(20) // x100 = 0.20
  const [minDifference, setMinDifference] = useState(15)   // x100 = 0.15

  // Presets
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')
  const [showPresetPanel, setShowPresetPanel] = useState(false)

  // Zoomed result image
  const [showZoom, setShowZoom] = useState(false)

  // Controls panel collapse sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    rect: true, cols: true, yoffsets: false, rowSpacing: false, sensitivity: false, bubble: true
  })

  const imgRef = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const presetImportRef = useRef<HTMLInputElement>(null)
  const [displayWidth, setDisplayWidth] = useState(300)

  const cols = [col1, col2, col3, col4]
  const colYOffsets = [col1Y, col2Y, col3Y, col4Y]
  const colStartYs = [col1StartY, col2StartY, col3StartY, col4StartY]
  const colEndYs = [col1EndY, col2EndY, col3EndY, col4EndY]

  // Effective Y offset per column = global + individual
  const getEffectiveOffset = (ci: number) => globalYOffset + colYOffsets[ci]

  // Effective startY/endY per column: use per-column override if set, else global
  const getEffectiveStartY = (ci: number) => colStartYs[ci] >= 0 ? colStartYs[ci] : startY
  const getEffectiveEndY = (ci: number) => colEndYs[ci] >= 0 ? colEndYs[ci] : endY

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    const saved = localStorage.getItem('omr-presets')
    if (saved) {
      try { setPresets(JSON.parse(saved)) } catch (e) { console.error('Failed to load presets:', e) }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('omr-presets', JSON.stringify(presets))
  }, [presets])

  useEffect(() => {
    const updateDisplayWidth = () => {
      if (imgRef.current) setDisplayWidth(imgRef.current.clientWidth)
    }
    updateDisplayWidth()
    window.addEventListener('resize', updateDisplayWidth)
    return () => window.removeEventListener('resize', updateDisplayWidth)
  }, [image])

  const loadFile = (f: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const w = img.width, h = img.height
        setImgSize({ w, h })

        setRectX(Math.round(w * 0.05))
        setRectY(Math.round(h * 0.08))
        setRectW(Math.round(w * 0.35))
        setRectH(Math.round(h * 0.55))

        const cw = Math.round(w * 0.35 / 4)
        setCol1(Math.round(cw * 0.2))
        setCol2(Math.round(cw * 1.2))
        setCol3(Math.round(cw * 2.2))
        setCol4(Math.round(cw * 3.2))

        setOptGap(Math.round(w * 0.01))
        setStartY(Math.round(h * 0.01))
        setEndY(Math.round(h * 0.52))
        setBubbleR(Math.round(Math.min(w, h) * 0.006))

        setGlobalYOffset(0)
        setCol1Y(0); setCol2Y(0); setCol3Y(0); setCol4Y(0)
        setCol1StartY(-1); setCol2StartY(-1); setCol3StartY(-1); setCol4StartY(-1)
        setCol1EndY(-1); setCol2EndY(-1); setCol3EndY(-1); setCol4EndY(-1)
        setFillThreshold(20); setMinDifference(15)
      }
      img.src = e.target!.result as string
      setImage(e.target!.result as string)
      setFile(f)
    }
    reader.readAsDataURL(f)
    setResult(null)
  }

  const scale = imgSize ? displayWidth / imgSize.w : 1

  const getRowY = (rowIndex: number, ci?: number) => {
    const s = ci !== undefined ? getEffectiveStartY(ci) : startY
    const e = ci !== undefined ? getEffectiveEndY(ci) : endY
    return s + (e - s) * (rowIndex / (QUESTIONS_PER_COL - 1))
  }

  const getBubblePos = (ci: number, ri: number, oi: number) => {
    const absX = rectX + cols[ci] + oi * optGap
    const absY = rectY + getRowY(ri, ci) + getEffectiveOffset(ci)
    return { absX, absY }
  }

  const savePreset = () => {
    if (!presetName.trim()) { alert('Please enter a preset name'); return }
    const preset: Preset = {
      name: presetName.trim(),
      createdAt: new Date().toISOString(),
      settings: {
        rectX, rectY, rectW, rectH, col1, col2, col3, col4,
        optGap, startY, endY, bubbleR,
        globalYOffset, col1Y, col2Y, col3Y, col4Y,
        col1StartY, col2StartY, col3StartY, col4StartY,
        col1EndY, col2EndY, col3EndY, col4EndY,
        fillThreshold, minDifference
      }
    }
    setPresets([...presets, preset])
    setPresetName('')
    alert('Preset saved!')
  }

  const loadPreset = (preset: Preset) => {
    const s = preset.settings
    setRectX(s.rectX); setRectY(s.rectY); setRectW(s.rectW); setRectH(s.rectH)
    setCol1(s.col1); setCol2(s.col2); setCol3(s.col3); setCol4(s.col4)
    setOptGap(s.optGap); setStartY(s.startY); setEndY(s.endY); setBubbleR(s.bubbleR)
    setGlobalYOffset(s.globalYOffset ?? 0)
    setCol1Y(s.col1Y ?? 0); setCol2Y(s.col2Y ?? 0); setCol3Y(s.col3Y ?? 0); setCol4Y(s.col4Y ?? 0)
    setCol1StartY(s.col1StartY ?? -1); setCol2StartY(s.col2StartY ?? -1)
    setCol3StartY(s.col3StartY ?? -1); setCol4StartY(s.col4StartY ?? -1)
    setCol1EndY(s.col1EndY ?? -1); setCol2EndY(s.col2EndY ?? -1)
    setCol3EndY(s.col3EndY ?? -1); setCol4EndY(s.col4EndY ?? -1)
    setFillThreshold(s.fillThreshold ?? 20); setMinDifference(s.minDifference ?? 15)
    setShowPresetPanel(false)
  }

  const deletePreset = (index: number) => {
    if (confirm('Delete this preset?')) setPresets(presets.filter((_, i) => i !== index))
  }

  const exportPreset = (preset: Preset) => {
    const json = JSON.stringify(preset, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `omr-preset-${preset.name.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importAndApply = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const preset = JSON.parse(event.target!.result as string) as Preset
        if (preset.settings) { loadPreset(preset); alert('Settings applied!') }
        else alert('Invalid settings file')
      } catch { alert('Failed to parse settings file') }
    }
    reader.readAsText(f)
    e.target.value = ''
  }

  const exportCurrentSettings = () => {
    const preset: Preset = {
      name: 'current-settings',
      createdAt: new Date().toISOString(),
      settings: {
        rectX, rectY, rectW, rectH, col1, col2, col3, col4,
        optGap, startY, endY, bubbleR,
        globalYOffset, col1Y, col2Y, col3Y, col4Y,
        col1StartY, col2StartY, col3StartY, col4StartY,
        col1EndY, col2EndY, col3EndY, col4EndY,
        fillThreshold, minDifference
      }
    }
    exportPreset(preset)
  }

  const resetColumnOffsets = () => {
    setGlobalYOffset(0)
    setCol1Y(0); setCol2Y(0); setCol3Y(0); setCol4Y(0)
  }

  const resetColumnSpacing = () => {
    setCol1StartY(-1); setCol2StartY(-1); setCol3StartY(-1); setCol4StartY(-1)
    setCol1EndY(-1); setCol2EndY(-1); setCol3EndY(-1); setCol4EndY(-1)
  }

  const scan = async () => {
    if (!file) return
    setProcessing(true)
    setResult(null)

    const settings = {
      rect: { x: rectX, y: rectY, w: rectW, h: rectH },
      cols: [col1, col2, col3, col4],
      optGap, startY, endY, bubbleR,
      colStartYs: cols.map((_, ci) => getEffectiveStartY(ci)),
      colEndYs: cols.map((_, ci) => getEffectiveEndY(ci)),
      fillThreshold: fillThreshold / 100,
      minDifference: minDifference / 100
    }

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('settings', JSON.stringify(settings))
      const res = await fetch('/api/omr-js', { method: 'POST', body: fd })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ success: false, error: String(e) })
    } finally {
      setProcessing(false)
    }
  }

  const confirmAndImport = () => {
    if (!result?.success || !result.data?.answers) return
    const answersArray: string[] = []
    for (let i = 1; i <= 180; i++) {
      const ans = result.data.answers[String(i)]
      answersArray.push(ans === null ? '0' : ans === 'INVALID' ? '0' : ans)
    }
    onAnswersDetected(answersArray)
    onOpenChange(false)
  }

  const reset = () => {
    setFile(null); setImage(null); setImgSize(null); setResult(null)
  }

  // Collapse section header component
  const SectionHeader = ({ title, sectionKey, icon }: { title: string; sectionKey: string; icon?: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => toggleSection(sectionKey)}
      className="flex items-center justify-between w-full text-left"
    >
      <h3 className="text-xs font-semibold flex items-center gap-1">
        {icon}
        {title}
      </h3>
      {expandedSections[sectionKey] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
    </button>
  )

  const COL_COLORS = ['text-sky-500', 'text-amber-500', 'text-emerald-500', 'text-rose-500']
  const COL_BG = ['border-sky-400/70 bg-sky-400/25', 'border-amber-400/70 bg-amber-400/25', 'border-emerald-400/70 bg-emerald-400/25', 'border-rose-400/70 bg-rose-400/25']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[95vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-3 border-b bg-background flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold">OMR Scanner (180Q)</DialogTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowPresetPanel(!showPresetPanel)}>
                <FolderOpen className="w-4 h-4 mr-1"/>Presets
              </Button>
              {image && (
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="w-4 h-4 mr-1"/>Reset
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Image with overlay */}
          <div className="flex-1 p-3 overflow-auto flex justify-center bg-muted/30 min-h-0">
            {!image ? (
              <div
                className="w-full max-w-sm p-10 border-2 border-dashed rounded-xl bg-background text-center cursor-pointer hover:border-primary transition-colors flex flex-col items-center justify-center my-auto"
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
                <Upload className="w-14 h-14 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold">Upload OMR Sheet</h3>
                <p className="text-sm text-muted-foreground mt-2">Click to upload</p>
              </div>
            ) : (
              <div className="relative inline-block my-4">
                <img ref={imgRef} src={image} alt="OMR" className="max-w-full h-auto" draggable={false} />
                {imgSize && (
                  <div
                    className="absolute border-2 border-primary/80 bg-primary/5 pointer-events-none"
                    style={{
                      left: rectX * scale,
                      top: rectY * scale,
                      width: rectW * scale,
                      height: rectH * scale
                    }}
                  >
                    {cols.map((_, ci) =>
                      Array.from({ length: QUESTIONS_PER_COL }, (_, ri) =>
                        Array.from({ length: OPTIONS }, (_, oi) => {
                          const { absX, absY } = getBubblePos(ci, ri, oi)
                          return (
                            <div
                              key={`${ci}-${ri}-${oi}`}
                              className={`absolute rounded-full border ${COL_BG[ci]}`}
                              style={{
                                left: (absX - rectX) * scale,
                                top: (absY - rectY) * scale,
                                width: bubbleR * 2 * scale,
                                height: bubbleR * 2 * scale,
                                transform: 'translate(-50%, -50%)'
                              }}
                            />
                          )
                        })
                      )
                    )}
                    {/* Global start/end markers */}
                    <div className="absolute w-3 h-3 bg-green-500 rounded-full" style={{ left: -6, top: startY * scale, transform: 'translateY(-50%)' }} />
                    <div className="absolute w-3 h-3 bg-red-500 rounded-full" style={{ left: -6, top: endY * scale, transform: 'translateY(-50%)' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="w-full lg:w-80 bg-background border-t lg:border-l flex flex-col min-h-0 max-h-[50vh] lg:max-h-none">
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2">

                {/* Preset Panel */}
                {showPresetPanel && (
                  <div className="border rounded-lg p-2 bg-muted/50">
                    <h3 className="text-xs font-semibold mb-2">Save/Load Presets</h3>
                    <div className="flex gap-2 mb-2">
                      <input type="text" placeholder="Preset name..." value={presetName} onChange={e => setPresetName(e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs" />
                      <Button size="sm" onClick={savePreset} className="h-7"><Save className="w-3 h-3"/></Button>
                    </div>
                    <div className="flex gap-2 mb-2">
                      <Button size="sm" variant="outline" onClick={exportCurrentSettings} className="flex-1 h-7 text-xs"><Download className="w-3 h-3 mr-1"/>Export</Button>
                      <input ref={presetImportRef} type="file" accept=".json" className="hidden" onChange={importAndApply} />
                      <Button size="sm" variant="outline" onClick={() => presetImportRef.current?.click()} className="flex-1 h-7 text-xs"><Upload className="w-3 h-3 mr-1"/>Import</Button>
                    </div>
                    {presets.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {presets.map((preset, i) => (
                          <div key={i} className="flex items-center gap-1 bg-background rounded p-1.5 text-xs">
                            <button onClick={() => loadPreset(preset)} className="flex-1 text-left hover:text-primary truncate">{preset.name}</button>
                            <button onClick={() => exportPreset(preset)} className="p-1 hover:bg-muted rounded" title="Export"><Download className="w-3 h-3 text-muted-foreground"/></button>
                            <button onClick={() => deletePreset(i)} className="p-1 hover:bg-destructive/10 rounded" title="Delete"><Trash2 className="w-3 h-3 text-destructive"/></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {image && imgSize && (
                  <>

                    {/* Selection Rectangle */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <SectionHeader title="Selection Rectangle" sectionKey="rect" />
                      {expandedSections.rect && (
                        <div className="grid grid-cols-2 gap-2 mt-1.5">
                          <div>
                            <label className="text-[10px] text-muted-foreground flex justify-between">X <span className="font-mono">{rectX}</span></label>
                            <Slider value={[rectX]} onValueChange={([v]) => setRectX(v)} min={0} max={imgSize.w} step={1} className="mt-1 h-4" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground flex justify-between">Y <span className="font-mono">{rectY}</span></label>
                            <Slider value={[rectY]} onValueChange={([v]) => setRectY(v)} min={0} max={imgSize.h} step={1} className="mt-1 h-4" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground flex justify-between">W <span className="font-mono">{rectW}</span></label>
                            <Slider value={[rectW]} onValueChange={([v]) => setRectW(v)} min={50} max={imgSize.w} step={1} className="mt-1 h-4" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground flex justify-between">H <span className="font-mono">{rectH}</span></label>
                            <Slider value={[rectH]} onValueChange={([v]) => setRectH(v)} min={50} max={imgSize.h} step={1} className="mt-1 h-4" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Column X Positions */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <SectionHeader title="Column X Positions" sectionKey="cols" />
                      {expandedSections.cols && (
                        <div className="space-y-1 mt-1.5">
                          {[ [col1, setCol1, 0], [col2, setCol2, 1], [col3, setCol3, 2], [col4, setCol4, 3] ].map(([val, set, i]) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className={`w-6 text-[10px] font-medium ${COL_COLORS[i]}`}>C{i + 1}</span>
                              <Slider value={[val as number]} onValueChange={([v]) => (set as React.Dispatch<React.SetStateAction<number>>)(v)} min={0} max={rectW} step={1} className="flex-1 h-4" />
                              <span className="w-5 text-[10px] font-mono text-right">{val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Column Y Offsets */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <div className="flex items-center justify-between">
                        <SectionHeader title="Column Y Offsets" sectionKey="yoffsets" icon={<AlignVerticalSpaceAround className="w-3 h-3"/>} />
                        <button onClick={resetColumnOffsets} className="text-[9px] text-muted-foreground hover:text-destructive underline ml-2">Reset</button>
                      </div>
                      {expandedSections.yoffsets && (
                        <div className="mt-1.5 space-y-1">
                          <p className="text-[9px] text-muted-foreground">Shift columns up/down</p>
                          <div className="mb-2 pb-2 border-b border-muted">
                            <label className="text-[10px] text-muted-foreground flex justify-between">
                              <span className="font-medium text-foreground/70">Global Y Shift</span>
                              <span className="font-mono">{globalYOffset > 0 ? '+' : ''}{globalYOffset}</span>
                            </label>
                            <Slider value={[globalYOffset]} onValueChange={([v]) => setGlobalYOffset(v)} min={-200} max={200} step={1} className="mt-1 h-4" />
                          </div>
                          {[ [col1Y, setCol1Y, 0], [col2Y, setCol2Y, 1], [col3Y, setCol3Y, 2], [col4Y, setCol4Y, 3] ].map(([val, set, i]) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className={`w-6 text-[10px] font-medium ${COL_COLORS[i]}`}>C{i + 1}</span>
                              <Slider value={[val as number]} onValueChange={([v]) => (set as React.Dispatch<React.SetStateAction<number>>)(v)} min={-200} max={200} step={1} className="flex-1 h-4" />
                              <span className={`w-8 text-[10px] font-mono text-right ${COL_COLORS[i]}`}>{(val as number) > 0 ? '+' : ''}{val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Per-Column Row Spacing */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <div className="flex items-center justify-between">
                        <SectionHeader title="Column Row Spacing" sectionKey="rowSpacing" icon={<AlignVerticalSpaceAround className="w-3 h-3"/>} />
                        <button onClick={resetColumnSpacing} className="text-[9px] text-muted-foreground hover:text-destructive underline ml-2">Reset</button>
                      </div>
                      {expandedSections.rowSpacing && (
                        <div className="mt-1.5 space-y-2">
                          <p className="text-[9px] text-muted-foreground">Override row spacing per column (-1 = use global)</p>
                          {/* Global defaults */}
                          <div className="pb-1 border-b border-muted space-y-1">
                            <div>
                              <label className="text-[10px] text-muted-foreground flex justify-between">
                                Global Start Y <span className="font-mono text-green-600">{startY}</span>
                              </label>
                              <Slider value={[startY]} onValueChange={([v]) => setStartY(v)} min={0} max={rectH} step={1} className="mt-1 h-4" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground flex justify-between">
                                Global End Y <span className="font-mono text-red-600">{endY}</span>
                              </label>
                              <Slider value={[endY]} onValueChange={([v]) => setEndY(v)} min={0} max={rectH} step={1} className="mt-1 h-4" />
                            </div>
                          </div>
                          {/* Per-column overrides */}
                          {[ [col1StartY, setCol1StartY, col1EndY, setCol1EndY, 0],
                             [col2StartY, setCol2StartY, col2EndY, setCol2EndY, 1],
                             [col3StartY, setCol3StartY, col3EndY, setCol3EndY, 2],
                             [col4StartY, setCol4StartY, col4EndY, setCol4EndY, 3]
                          ].map(([sy, setSy, ey, setEy, i]) => (
                            <div key={i} className="bg-background/50 rounded p-1.5 space-y-1">
                              <span className={`text-[10px] font-medium ${COL_COLORS[i]}`}>Column {i + 1}</span>
                              <div className="flex items-center gap-2">
                                <span className="w-5 text-[9px] text-green-600">S</span>
                                <Slider value={[sy as number]} onValueChange={([v]) => (setSy as React.Dispatch<React.SetStateAction<number>>)(v)} min={-1} max={rectH} step={1} className="flex-1 h-3" />
                                <span className="w-6 text-[9px] font-mono text-right">{(sy as number) < 0 ? 'GLB' : sy}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-5 text-[9px] text-red-600">E</span>
                                <Slider value={[ey as number]} onValueChange={([v]) => (setEy as React.Dispatch<React.SetStateAction<number>>)(v)} min={-1} max={rectH} step={1} className="flex-1 h-3" />
                                <span className="w-6 text-[9px] font-mono text-right">{(ey as number) < 0 ? 'GLB' : ey}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Detection Sensitivity */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <SectionHeader title="Detection Sensitivity" sectionKey="sensitivity" />
                      {expandedSections.sensitivity && (
                        <div className="mt-1.5 space-y-1">
                          <p className="text-[9px] text-muted-foreground">How the scanner decides marked vs empty</p>
                          <div>
                            <label className="text-[10px] text-muted-foreground flex justify-between">
                              Fill Threshold <span className="font-mono">{fillThreshold}%</span>
                            </label>
                            <Slider value={[fillThreshold]} onValueChange={([v]) => setFillThreshold(v)} min={5} max={60} step={1} className="mt-1 h-4" />
                            <p className="text-[8px] text-muted-foreground">Min darkness to consider any bubble as filled</p>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground flex justify-between">
                              Min Difference <span className="font-mono">{minDifference}%</span>
                            </label>
                            <Slider value={[minDifference]} onValueChange={([v]) => setMinDifference(v)} min={3} max={50} step={1} className="mt-1 h-4" />
                            <p className="text-[8px] text-muted-foreground">Darkest bubble must be this much darker than avg of others</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bubble Settings */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <SectionHeader title="Bubble Settings" sectionKey="bubble" />
                      {expandedSections.bubble && (
                        <div className="mt-1.5 space-y-1">
                          <div>
                            <label className="text-[10px] text-muted-foreground flex justify-between">Option Gap <span className="font-mono">{optGap}</span></label>
                            <Slider value={[optGap]} onValueChange={([v]) => setOptGap(v)} min={5} max={50} step={1} className="mt-1 h-4" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground flex justify-between">Bubble Radius <span className="font-mono">{bubbleR}</span></label>
                            <Slider value={[bubbleR]} onValueChange={([v]) => setBubbleR(v)} min={3} max={25} step={1} className="mt-1 h-4" />
                          </div>
                        </div>
                      )}
                    </div>

                    {result && !result.success && (
                      <div className="border border-destructive/30 bg-destructive/10 rounded-lg p-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-destructive"/>
                        <span className="text-destructive text-xs">{result.error}</span>
                      </div>
                    )}

                    {result?.success && (
                      <>
                        <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-2">
                          <div className="flex items-center gap-2 mb-1.5">
                            <CheckCircle2 className="w-4 h-4 text-green-600"/>
                            <span className="font-semibold text-xs">Detected: {result.data.statistics.answered} answers</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                            <div className="bg-green-500/20 rounded p-1"><p className="font-bold text-green-700">{result.data.statistics.answered}</p><p>Answered</p></div>
                            <div className="bg-amber-500/20 rounded p-1"><p className="font-bold text-amber-700">{result.data.statistics.unanswered}</p><p>Empty</p></div>
                            <div className="bg-muted rounded p-1"><p className="font-bold">{result.data.statistics.total_questions}</p><p>Total</p></div>
                          </div>
                        </div>

                        <div className="rounded-lg overflow-hidden border">
                          <div className="flex items-center justify-between p-1 bg-muted">
                            <p className="text-[10px] text-muted-foreground">Green = confident | Amber = low confidence</p>
                            <button onClick={() => setShowZoom(true)} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                              <ZoomIn className="w-3 h-3"/>Zoom
                            </button>
                          </div>
                          <img src={result.annotatedImage} alt="Result" className="w-full max-h-48 object-contain cursor-pointer" onClick={() => setShowZoom(true)} />
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Sticky Bottom Buttons */}
            {image && imgSize && (
              <div className="border-t p-3 bg-background flex-shrink-0">
                {!result?.success ? (
                  <Button size="lg" className="w-full font-bold" onClick={scan} disabled={processing}>
                    {processing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Scanning...</> : <><Play className="w-4 h-4 mr-2"/>SCAN</>}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="lg" variant="outline" className="font-bold" onClick={() => setResult(null)}>
                      <RotateCcw className="w-4 h-4 mr-2"/>Re-scan
                    </Button>
                    <Button size="lg" className="flex-1 font-bold bg-green-600 hover:bg-green-700" onClick={confirmAndImport}>
                      <CheckCircle2 className="w-4 h-4 mr-2"/>Import
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Full-screen zoom overlay for annotated image */}
      {showZoom && result?.annotatedImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setShowZoom(false)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setShowZoom(false)}>
            <X className="w-8 h-8"/>
          </button>
          <img src={result.annotatedImage} alt="Zoomed Result" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </Dialog>
  )
}
