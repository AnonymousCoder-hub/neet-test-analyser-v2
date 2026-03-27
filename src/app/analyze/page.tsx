'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Home, Calculator, Keyboard, MousePointer2, ScanLine } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { OMRScannerDialog } from '@/components/omr-scanner-dialog'

export default function AnalyzePage() {
  const [testName, setTestName] = useState('')
  const [markedAnswers, setMarkedAnswers] = useState('')
  const [correctAnswers, setCorrectAnswers] = useState('')
  const [inputMode, setInputMode] = useState<'manual' | 'omr' | 'scanner'>('manual')
  const [showOldNumbering, setShowOldNumbering] = useState(false)
  const [omrMarkedAnswers, setOmrMarkedAnswers] = useState<string[]>(Array(180).fill('0'))
  const [analyzing, setAnalyzing] = useState(false)
  const [omrScannerOpen, setOmrScannerOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  const parseAnswers = (answerString: string): string[] => {
    const cleaned = answerString.replace(/\s/g, '')
    return cleaned.split('')
  }

  const getDisplayQuestionNumber = (index: number): number => {
    if (!showOldNumbering) {
      return index + 1 // Standard: 1-180
    }
    // Old OMR numbering pattern
    if (index < 45) return index + 1 // Physics: 1-45
    if (index < 90) return index + 6 // Chemistry: 51-95 (46-50 are section B)
    if (index < 135) return index + 11 // Botany: 101-145 (96-100 are section B)
    return index + 16 // Zoology: 151-195 (146-150 are section B)
  }

  const getSubjectForQuestion = (questionNumber: number): string => {
    if (questionNumber <= 45) return 'Physics'
    if (questionNumber <= 90) return 'Chemistry'
    if (questionNumber <= 135) return 'Botany'
    return 'Zoology'
  }

  const renderOMRRow = (index: number) => {
    const displayNumber = getDisplayQuestionNumber(index)
    return (
      <div key={index} className="flex items-center gap-3">
        <span className="w-8 text-xs font-medium text-muted-foreground text-right flex-shrink-0 pt-2">
          {displayNumber}
        </span>
        <div className="flex-1 flex border border-white/10 rounded-lg overflow-hidden bg-background shadow-sm">
          {['1', '2', '3', '4'].map((option) => (
            <button
              key={option}
              onClick={() => handleOmroptionSelect(index, option)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-all duration-200 relative ${
                omrMarkedAnswers[index] === option
                  ? 'bg-white text-black shadow-inner'
                  : 'text-muted-foreground/70 hover:bg-white/5 hover:text-foreground'
              }`}
            >
              {option}
              {option !== '4' && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-px bg-white/10" />
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const handleOmroptionSelect = (questionIndex: number, option: string) => {
    const newAnswers = [...omrMarkedAnswers]
    // Toggle selection
    if (newAnswers[questionIndex] === option) {
      newAnswers[questionIndex] = '0' // Deselect
    } else {
      newAnswers[questionIndex] = option // Select
    }
    setOmrMarkedAnswers(newAnswers)
  }

  // Handle answers from OMR scanner
  const handleAnswersDetected = (answers: string[]) => {
    setOmrMarkedAnswers(answers)
    setInputMode('omr') // Switch to OMR mode to show the answers
  }

  const analyzeTest = () => {
    const marked = inputMode === 'omr' || inputMode === 'scanner' ? omrMarkedAnswers : parseAnswers(markedAnswers)
    const correct = parseAnswers(correctAnswers)

    if (marked.length !== 180 || correct.length !== 180) {
      alert('Please provide exactly 180 digits for both marked and correct answers')
      return
    }

    setAnalyzing(true)

    const questionResults: any[] = []
    const subjectWiseData: { [key: string]: any } = {
      'Physics': { name: 'Physics', correct: 0, wrong: 0, unmarked: 0, markedQuestions: [], wrongQuestions: [], unmarkedQuestions: [] },
      'Chemistry': { name: 'Chemistry', correct: 0, wrong: 0, unmarked: 0, markedQuestions: [], wrongQuestions: [], unmarkedQuestions: [] },
      'Botany': { name: 'Botany', correct: 0, wrong: 0, unmarked: 0, markedQuestions: [], wrongQuestions: [], unmarkedQuestions: [] },
      'Zoology': { name: 'Zoology', correct: 0, wrong: 0, unmarked: 0, markedQuestions: [], wrongQuestions: [], unmarkedQuestions: [] },
    }

    let totalCorrect = 0
    let totalWrong = 0
    let totalUnmarked = 0

    for (let i = 0; i < 180; i++) {
      const qNum = i + 1
      const markedAnswer = marked[i]
      const correctAnswer = correct[i]
      const subject = getSubjectForQuestion(qNum)
      const isUnmarked = markedAnswer === '0'

      const isCorrect = markedAnswer === correctAnswer && !isUnmarked

      questionResults.push({
        questionNumber: qNum,
        marked: markedAnswer,
        correct: correctAnswer,
        isCorrect,
        isUnmarked,
        subject,
      })

      // Update subject stats
      if (isUnmarked) {
        subjectWiseData[subject].unmarkedQuestions.push(qNum)
        subjectWiseData[subject].unmarked++
        totalUnmarked++
      } else if (isCorrect) {
        subjectWiseData[subject].correct++
        subjectWiseData[subject].markedQuestions.push(qNum)
        totalCorrect++
      } else {
        subjectWiseData[subject].wrong++
        subjectWiseData[subject].markedQuestions.push(qNum)
        subjectWiseData[subject].wrongQuestions.push(qNum)
        totalWrong++
      }
    }

    const statsArray = Object.values(subjectWiseData)

    // NEET Scoring: +4 for correct, -1 for wrong, 0 for unmarked
    const totalMarks = (totalCorrect * 4) - (totalWrong * 1)
    const maxMarks = 720

    const overall = {
      testName: testName || `Test ${Date.now()}`,
      totalQuestions: 180,
      totalCorrect,
      totalWrong,
      totalUnmarked,
      totalMarks,
      maxMarks,
      percentage: ((totalMarks / maxMarks) * 100).toFixed(2),
      physicsMarks: (subjectWiseData['Physics'].correct * 4) - (subjectWiseData['Physics'].wrong * 1),
      chemistryMarks: (subjectWiseData['Chemistry'].correct * 4) - (subjectWiseData['Chemistry'].wrong * 1),
      botanyMarks: (subjectWiseData['Botany'].correct * 4) - (subjectWiseData['Botany'].wrong * 1),
      zoologyMarks: (subjectWiseData['Zoology'].correct * 4) - (subjectWiseData['Zoology'].wrong * 1),
      subjects: statsArray,
      questions: questionResults,
    }

    // Save to localStorage
    const record = {
      id: Date.now().toString(),
      testName: overall.testName,
      markedAnswers: Array.isArray(marked) ? marked.join('') : marked,
      correctAnswers: Array.isArray(correct) ? correct.join('') : correct,
      totalMarks: overall.totalMarks,
      maxMarks: overall.maxMarks,
      percentage: parseFloat(overall.percentage),
      totalCorrect,
      totalWrong,
      totalUnmarked,
      physicsMarks: overall.physicsMarks,
      chemistryMarks: overall.chemistryMarks,
      botanyMarks: overall.botanyMarks,
      zoologyMarks: overall.zoologyMarks,
      createdAt: new Date().toISOString(),
    }

    const records = JSON.parse(localStorage.getItem('testRecords') || '[]')
    records.unshift(record)
    localStorage.setItem('testRecords', JSON.stringify(records))

    // Store full analysis data temporarily for the results page
    localStorage.setItem(`analysis-${record.id}`, JSON.stringify(overall))

    // Redirect to results page
    router.push(`/results/${record.id}`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-accent hover:scale-110 transition-all duration-200"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                New Test Analysis
              </h1>
              <p className="text-sm text-muted-foreground">Enter your test details to analyze performance</p>
            </div>
          </div>
          <Link href="/">
            <Button
              variant="outline"
              size="sm"
              className="hover:scale-105 transition-transform duration-200 active:scale-95 hover:border-primary/50"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-lg">Enter Your Test Details</CardTitle>
                <CardDescription className="mt-2 leading-relaxed">
                  {inputMode === 'manual' ? (
                    <>
                      Enter 180 digits representing your marked answers (0 = no option marked) and the correct answers.<br />
                      <span className="text-xs text-muted-foreground/80">First 45: Physics, Next 45: Chemistry, Next 45: Botany, Last 45: Zoology</span>
                    </>
                  ) : inputMode === 'omr' ? (
                    <>
                      Select your answers for each question visually using the option buttons.<br />
                      <span className="text-xs text-muted-foreground/80">First 45: Physics, Next 45: Chemistry, Next 45: Botany, Last 45: Zoology</span>
                    </>
                  ) : (
                    <>
                      Scan your OMR answer sheet to automatically detect your marked answers.<br />
                      <span className="text-xs text-muted-foreground/80">After scanning, you can review and adjust the detected answers</span>
                    </>
                  )}
                </CardDescription>
              </div>
              <Select value={inputMode} onValueChange={(v: 'manual' | 'omr' | 'scanner') => setInputMode(v)}>
                <SelectTrigger className="w-[160px] h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">
                    <div className="flex items-center gap-2">
                      <Keyboard className="w-4 h-4" />
                      <span>Mode 1: Type</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="omr">
                    <div className="flex items-center gap-2">
                      <MousePointer2 className="w-4 h-4" />
                      <span>Mode 2: OMR</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="scanner">
                    <div className="flex items-center gap-2">
                      <ScanLine className="w-4 h-4" />
                      <span>Mode 3: Scan</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Test Name</label>
              <Input
                placeholder="e.g., NEET 2025 Mock Test 1"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                className="text-base"
              />
            </div>

            {inputMode === 'manual' ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Marked Answers (180 digits)</label>
                  <Textarea
                    placeholder="e.g., 1131331413243131013131012101011013131..."
                    value={markedAnswers}
                    onChange={(e) => setMarkedAnswers(e.target.value.replace(/[^0-4]/g, ''))}
                    className="font-mono text-sm"
                    rows={4}
                    maxLength={180}
                  />
                  <p className="text-xs text-muted-foreground">
                    {markedAnswers.length}/180 digits entered
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Correct Answers (180 digits)</label>
                  <Textarea
                    placeholder="e.g., 1131423132431413141331312132131213131213..."
                    value={correctAnswers}
                    onChange={(e) => setCorrectAnswers(e.target.value.replace(/[^1-4]/g, ''))}
                    className="font-mono text-sm"
                    rows={4}
                    maxLength={180}
                  />
                  <p className="text-xs text-muted-foreground">
                    {correctAnswers.length}/180 digits entered
                  </p>
                </div>
              </>
            ) : inputMode === 'omr' ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Select Your Answers</label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground cursor-pointer" htmlFor="old-numbering">
                          Old OMR Numbering
                        </label>
                        <input
                          type="checkbox"
                          id="old-numbering"
                          checked={showOldNumbering}
                          onChange={(e) => setShowOldNumbering(e.target.checked)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground ml-2">
                        {omrMarkedAnswers.filter(a => a !== '0').length} / 180 answered
                      </span>
                    </div>
                  </div>
                </div>

                {/* Physics Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <h3 className="text-sm font-semibold">
                      Physics (Q{showOldNumbering ? '1' : '1'}-Q{showOldNumbering ? '45' : '45'})
                    </h3>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Array.from({ length: 45 }, (_, i) => i).map(renderOMRRow)}
                  </div>
                </div>

                {/* Chemistry Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <h3 className="text-sm font-semibold">
                      Chemistry (Q{showOldNumbering ? '51' : '46'}-Q{showOldNumbering ? '95' : '90'})
                    </h3>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Array.from({ length: 45 }, (_, i) => i + 45).map(renderOMRRow)}
                  </div>
                </div>

                {/* Botany Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <h3 className="text-sm font-semibold">
                      Botany (Q{showOldNumbering ? '101' : '91'}-Q{showOldNumbering ? '145' : '135'})
                    </h3>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Array.from({ length: 45 }, (_, i) => i + 90).map(renderOMRRow)}
                  </div>
                </div>

                {/* Zoology Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <h3 className="text-sm font-semibold">
                      Zoology (Q{showOldNumbering ? '151' : '136'}-Q{showOldNumbering ? '195' : '180'})
                    </h3>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Array.from({ length: 45 }, (_, i) => i + 135).map(renderOMRRow)}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Correct Answers (180 digits)</label>
                  <Textarea
                    placeholder="e.g., 1131423132431413141331312132131213131213..."
                    value={correctAnswers}
                    onChange={(e) => setCorrectAnswers(e.target.value.replace(/[^1-4]/g, ''))}
                    className="font-mono text-sm"
                    rows={4}
                    maxLength={180}
                  />
                  <p className="text-xs text-muted-foreground">
                    {correctAnswers.length}/180 digits entered
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* OMR Scanner Mode */}
                <div className="py-8 text-center">
                  <div className="mb-4">
                    <ScanLine className="w-16 h-16 mx-auto text-primary mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Scan Your OMR Sheet</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Upload an image of your OMR answer sheet and the scanner will automatically detect your marked answers.
                      You can then review and adjust before submitting.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="px-8"
                    onClick={() => setOmrScannerOpen(true)}
                  >
                    <ScanLine className="w-5 h-5 mr-2" />
                    Open OMR Scanner
                  </Button>
                </div>

                {/* Show current detected answers if any */}
                {omrMarkedAnswers.some(a => a !== '0') && (
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium">Detected Answers</label>
                      <span className="text-xs text-muted-foreground">
                        {omrMarkedAnswers.filter(a => a !== '0').length} / 180 answered
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground cursor-pointer" htmlFor="old-numbering-scan">
                          Old OMR Numbering
                        </label>
                        <input
                          type="checkbox"
                          id="old-numbering-scan"
                          checked={showOldNumbering}
                          onChange={(e) => setShowOldNumbering(e.target.checked)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOmrScannerOpen(true)}
                      >
                        <ScanLine className="w-3 h-3 mr-1" />
                        Re-scan
                      </Button>
                    </div>

                    {/* Physics Section */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <h3 className="text-xs font-semibold">Physics</h3>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {Array.from({ length: 45 }, (_, i) => i).map(renderOMRRow)}
                      </div>
                    </div>

                    {/* Chemistry Section */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <h3 className="text-xs font-semibold">Chemistry</h3>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {Array.from({ length: 45 }, (_, i) => i + 45).map(renderOMRRow)}
                      </div>
                    </div>

                    {/* Botany Section */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <h3 className="text-xs font-semibold">Botany</h3>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {Array.from({ length: 45 }, (_, i) => i + 90).map(renderOMRRow)}
                      </div>
                    </div>

                    {/* Zoology Section */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        <h3 className="text-xs font-semibold">Zoology</h3>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {Array.from({ length: 45 }, (_, i) => i + 135).map(renderOMRRow)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Correct Answers (180 digits)</label>
                  <Textarea
                    placeholder="e.g., 1131423132431413141331312132131213131213..."
                    value={correctAnswers}
                    onChange={(e) => setCorrectAnswers(e.target.value.replace(/[^1-4]/g, ''))}
                    className="font-mono text-sm"
                    rows={4}
                    maxLength={180}
                  />
                  <p className="text-xs text-muted-foreground">
                    {correctAnswers.length}/180 digits entered
                  </p>
                </div>
              </>
            )}

            <Button
              onClick={analyzeTest}
              size="lg"
              className="w-full text-base font-medium hover:scale-105 transition-transform duration-200 active:scale-95 shadow-md hover:shadow-lg"
              disabled={analyzing}
            >
              <Calculator className="w-5 h-5 mr-2" />
              {analyzing ? 'Analyzing...' : 'Analyze Test'}
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6 border border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-2">NEET Scoring System</h3>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="text-green-600 dark:text-green-400 font-semibold">✓</span>
                <span>Correct: +4</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-red-600 dark:text-red-400 font-semibold">✗</span>
                <span>Wrong: -1</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground font-semibold">○</span>
                <span>Unmarked: 0</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* OMR Scanner Dialog */}
      <OMRScannerDialog
        open={omrScannerOpen}
        onOpenChange={setOmrScannerOpen}
        onAnswersDetected={handleAnswersDetected}
      />

      {/* Theme Toggle Button */}
      <Button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        size="icon"
        className="fixed bottom-4 right-4 rounded-full shadow-lg hover:scale-110 transition-transform duration-200 active:scale-95"
      >
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>

      {/* Footer */}
      <footer className="border-t bg-card mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          Test Analyzer - NEET Analysis
        </div>
      </footer>
    </div>
  )
}
