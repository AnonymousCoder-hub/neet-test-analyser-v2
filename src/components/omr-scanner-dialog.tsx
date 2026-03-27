'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Upload, Play, RotateCcw, Loader2, CheckCircle2, AlertCircle, Save, FolderOpen, Download, Trash2 } from 'lucide-react'

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

  // Bubble settings
  const [optGap, setOptGap] = useState(15)
  const [startY, setStartY] = useState(15)
  const [endY, setEndY] = useState(700)
  const [bubbleR, setBubbleR] = useState(8)

  // Presets
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')
  const [showPresetPanel, setShowPresetPanel] = useState(false)

  const imgRef = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const presetImportRef = useRef<HTMLInputElement>(null)
  const [displayWidth, setDisplayWidth] = useState(300)

  const cols = [col1, col2, col3, col4]

  // Load presets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('omr-presets')
    if (saved) {
      try {
        setPresets(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load presets:', e)
      }
    }
  }, [])

  // Save presets to localStorage when changed
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
      }
      img.src = e.target!.result as string
      setImage(e.target!.result as string)
      setFile(f)
    }
    reader.readAsDataURL(f)
    setResult(null)
  }

  const scale = imgSize ? displayWidth / imgSize.w : 1

  const getRowY = (rowIndex: number) => {
    return startY + (endY - startY) * (rowIndex / (QUESTIONS_PER_COL - 1))
  }

  const getBubblePos = (ci: number, ri: number, oi: number) => {
    const absX = rectX + cols[ci] + oi * optGap
    const absY = rectY + getRowY(ri)
    return { absX, absY }
  }

  // Save current settings as preset
  const savePreset = () => {
    if (!presetName.trim()) {
      alert('Please enter a preset name')
      return
    }

    const preset: Preset = {
      name: presetName.trim(),
      createdAt: new Date().toISOString(),
      settings: {
        rectX, rectY, rectW, rectH,
        col1, col2, col3, col4,
        optGap, startY, endY, bubbleR
      }
    }

    setPresets([...presets, preset])
    setPresetName('')
    alert('Preset saved!')
  }

  // Load a preset
  const loadPreset = (preset: Preset) => {
    const s = preset.settings
    setRectX(s.rectX)
    setRectY(s.rectY)
    setRectW(s.rectW)
    setRectH(s.rectH)
    setCol1(s.col1)
    setCol2(s.col2)
    setCol3(s.col3)
    setCol4(s.col4)
    setOptGap(s.optGap)
    setStartY(s.startY)
    setEndY(s.endY)
    setBubbleR(s.bubbleR)
    setShowPresetPanel(false)
  }

  // Delete a preset
  const deletePreset = (index: number) => {
    if (confirm('Delete this preset?')) {
      setPresets(presets.filter((_, i) => i !== index))
    }
  }

  // Export preset as JSON file
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

  // Import and apply settings
  const importAndApply = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const preset = JSON.parse(event.target!.result as string) as Preset
        if (preset.settings) {
          loadPreset(preset)
          alert('Settings applied!')
        } else {
          alert('Invalid settings file')
        }
      } catch {
        alert('Failed to parse settings file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Export current settings
  const exportCurrentSettings = () => {
    const preset: Preset = {
      name: 'current-settings',
      createdAt: new Date().toISOString(),
      settings: {
        rectX, rectY, rectW, rectH,
        col1, col2, col3, col4,
        optGap, startY, endY, bubbleR
      }
    }
    exportPreset(preset)
  }

  const scan = async () => {
    if (!file) return
    setProcessing(true)
    setResult(null)

    const settings = {
      rect: { x: rectX, y: rectY, w: rectW, h: rectH },
      cols: [col1, col2, col3, col4],
      optGap: optGap,
      startY: startY,
      endY: endY,
      bubbleR: bubbleR
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

    // Convert answers object to array
    const answersArray: string[] = []
    for (let i = 1; i <= 180; i++) {
      const ans = result.data.answers[String(i)]
      answersArray.push(ans === null ? '0' : ans === 'INVALID' ? '0' : ans)
    }

    onAnswersDetected(answersArray)
    onOpenChange(false)
  }

  const reset = () => {
    setFile(null)
    setImage(null)
    setImgSize(null)
    setResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[95vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-3 border-b bg-background flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold">OMR Scanner</DialogTitle>
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
          {/* Image with overlay - scrollable */}
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
                              className="absolute rounded-full border border-blue-500/70 bg-blue-400/30"
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
                    <div className="absolute w-3 h-3 bg-green-500 rounded-full" style={{ left: -6, top: startY * scale, transform: 'translateY(-50%)' }} />
                    <div className="absolute w-3 h-3 bg-red-500 rounded-full" style={{ left: -6, top: endY * scale, transform: 'translateY(-50%)' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls - scrollable with sticky button */}
          <div className="w-full lg:w-80 bg-background border-t lg:border-l flex flex-col min-h-0 max-h-[50vh] lg:max-h-none">
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-3">
                {/* Preset Panel */}
                {showPresetPanel && (
                  <div className="border rounded-lg p-2 bg-muted/50">
                    <h3 className="text-xs font-semibold mb-2">Save/Load Presets</h3>

                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Preset name..."
                        value={presetName}
                        onChange={e => setPresetName(e.target.value)}
                        className="flex-1 border rounded px-2 py-1 text-xs"
                      />
                      <Button size="sm" onClick={savePreset} className="h-7">
                        <Save className="w-3 h-3"/>
                      </Button>
                    </div>

                    <div className="flex gap-2 mb-2">
                      <Button size="sm" variant="outline" onClick={exportCurrentSettings} className="flex-1 h-7 text-xs">
                        <Download className="w-3 h-3 mr-1"/>Export
                      </Button>
                      <input ref={presetImportRef} type="file" accept=".json" className="hidden" onChange={importAndApply} />
                      <Button size="sm" variant="outline" onClick={() => presetImportRef.current?.click()} className="flex-1 h-7 text-xs">
                        <Upload className="w-3 h-3 mr-1"/>Import
                      </Button>
                    </div>

                    {presets.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {presets.map((preset, i) => (
                          <div key={i} className="flex items-center gap-1 bg-background rounded p-1.5 text-xs">
                            <button
                              onClick={() => loadPreset(preset)}
                              className="flex-1 text-left hover:text-primary truncate"
                            >
                              {preset.name}
                            </button>
                            <button onClick={() => exportPreset(preset)} className="p-1 hover:bg-muted rounded" title="Export">
                              <Download className="w-3 h-3 text-muted-foreground"/>
                            </button>
                            <button onClick={() => deletePreset(i)} className="p-1 hover:bg-destructive/10 rounded" title="Delete">
                              <Trash2 className="w-3 h-3 text-destructive"/>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {image && imgSize && (
                  <>
                    {/* Rectangle Position */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <h3 className="text-xs font-semibold mb-1.5">Selection Rectangle</h3>
                      <div className="grid grid-cols-2 gap-2">
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
                    </div>

                    {/* Column Positions */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <h3 className="text-xs font-semibold mb-1.5">Column Positions</h3>
                      <div className="space-y-1">
                        {[ [col1, setCol1, 1], [col2, setCol2, 2], [col3, setCol3, 3], [col4, setCol4, 4] ].map(([val, set, num]) => (
                          <div key={num} className="flex items-center gap-2">
                            <span className="w-6 text-[10px] text-muted-foreground">C{num}</span>
                            <Slider value={[val as number]} onValueChange={([v]) => (set as React.Dispatch<React.SetStateAction<number>>)(v)} min={0} max={rectW} step={1} className="flex-1 h-4" />
                            <span className="w-5 text-[10px] font-mono text-right">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Row Calibration */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <h3 className="text-xs font-semibold mb-1.5">Row Calibration</h3>
                      <div className="space-y-1">
                        <div>
                          <label className="text-[10px] text-muted-foreground flex justify-between">Start Y (green) <span className="font-mono text-green-600">{startY}</span></label>
                          <Slider value={[startY]} onValueChange={([v]) => setStartY(v)} min={0} max={rectH} step={1} className="mt-1 h-4" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground flex justify-between">End Y (red) <span className="font-mono text-red-600">{endY}</span></label>
                          <Slider value={[endY]} onValueChange={([v]) => setEndY(v)} min={0} max={rectH} step={1} className="mt-1 h-4" />
                        </div>
                      </div>
                    </div>

                    {/* Bubble Settings */}
                    <div className="bg-muted/50 rounded-lg p-2">
                      <h3 className="text-xs font-semibold mb-1.5">Bubble Settings</h3>
                      <div className="space-y-1">
                        <div>
                          <label className="text-[10px] text-muted-foreground flex justify-between">Option Gap <span className="font-mono">{optGap}</span></label>
                          <Slider value={[optGap]} onValueChange={([v]) => setOptGap(v)} min={5} max={50} step={1} className="mt-1 h-4" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground flex justify-between">Bubble Radius <span className="font-mono">{bubbleR}</span></label>
                          <Slider value={[bubbleR]} onValueChange={([v]) => setBubbleR(v)} min={3} max={25} step={1} className="mt-1 h-4" />
                        </div>
                      </div>
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
                          <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                            <div className="bg-green-500/20 rounded p-1"><p className="font-bold text-green-700">{result.data.statistics.answered}</p><p>Answered</p></div>
                            <div className="bg-amber-500/20 rounded p-1"><p className="font-bold text-amber-700">{result.data.statistics.unanswered}</p><p>Empty</p></div>
                            <div className="bg-red-500/20 rounded p-1"><p className="font-bold text-red-700">{result.data.statistics.invalid}</p><p>Invalid</p></div>
                            <div className="bg-muted rounded p-1"><p className="font-bold">{result.data.statistics.total_questions}</p><p>Total</p></div>
                          </div>
                        </div>

                        <div className="rounded-lg overflow-hidden border">
                          <p className="text-[10px] text-muted-foreground p-1 bg-muted">Gray = positions | Green = detected | Red = invalid</p>
                          <img src={result.annotatedImage} alt="Result" className="w-full max-h-40 object-contain"/>
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
                  <Button size="lg" className="w-full font-bold bg-green-600 hover:bg-green-700" onClick={confirmAndImport}>
                    <CheckCircle2 className="w-4 h-4 mr-2"/>Confirm & Import Answers
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
