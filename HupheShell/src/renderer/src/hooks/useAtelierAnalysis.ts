import { useState, useRef, useCallback } from 'react'
import type React from 'react'

type Mode = 'manual' | 'ai'

export interface UseAtelierAnalysisReturn {
  file: File | null
  isDragging: boolean
  fileError: string
  analyseError: string
  analysing: boolean
  textMode: Mode | null
  imageMode: Mode | null
  importingKey: boolean
  keyImportError: string
  uploadFileRef: React.RefObject<HTMLInputElement | null>

  setFile: (file: File | null) => void
  setIsDragging: (b: boolean) => void
  setFileError: (e: string) => void
  setAnalyseError: (e: string) => void
  setAnalysing: (b: boolean) => void
  setTextMode: (m: Mode | null) => void
  setImageMode: (m: Mode | null) => void
  setImportingKey: (b: boolean) => void
  setKeyImportError: (e: string) => void

  handleDrop: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleUploadInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const VALID_EXTENSIONS = ['.txt', '.md', '.docx', '.key', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.pdf']

export function useAtelierAnalysis(onFileAccepted: (file: File) => void): UseAtelierAnalysisReturn {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [analyseError, setAnalyseError] = useState('')
  const [textMode, setTextMode] = useState<Mode | null>(null)
  const [imageMode, setImageMode] = useState<Mode | null>(null)
  const [importingKey, setImportingKey] = useState(false)
  const [keyImportError, setKeyImportError] = useState('')
  const uploadFileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((droppedFile: File | undefined | null) => {
    if (!droppedFile) return
    const extension = `.${droppedFile.name.split('.').pop()?.toLowerCase() ?? ''}`
    if (VALID_EXTENSIONS.includes(extension)) {
      setFileError('')
      onFileAccepted(droppedFile)
    } else {
      setFileError(`Bestandstype ${extension} wordt niet ondersteund.`)
    }
  }, [onFileAccepted])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleUploadInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0])
    if (e.target) e.target.value = ''
  }, [handleFile])

  return {
    file, isDragging, fileError, analyseError, analysing, textMode, imageMode, importingKey, keyImportError, uploadFileRef,
    setFile, setIsDragging, setFileError, setAnalyseError, setAnalysing, setTextMode, setImageMode, setImportingKey, setKeyImportError,
    handleDrop, handleDragOver, handleDragLeave, handleUploadInputChange,
  }
}
