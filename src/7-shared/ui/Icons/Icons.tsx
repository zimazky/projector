import React from 'react'

export const Menu:React.FC = () => {
  return <path d='M2 6h20M2 12h20M2 18h20' strokeWidth={2.5} fill='none'/>
}

export const ArrowBackIos: React.FC = () => {
  return <path d='M15 6 9 12 15 18' strokeWidth={2.5} fill='none'/>
}

export const ArrowForwardIos: React.FC = () => {
  return <path d='M9 6 15 12 9 18' strokeWidth={2.5} fill='none'/>
}

export const Diskette: React.FC = () => {
  return <path fill='none' d='m2 4a2 2 90 012-2l16 0a2 2 90 012 2l0 16a2 2 90 01-2 2l-16 0a2 2 90 01-2-2l0-16m5-2 0 6a1 1 90 001 1l8 0a1 1 90 001-1l0-6m-2 2a1 1 90 00-2 0l0 3a1 1 90 002 0l0-3'/>
}

export const ModifiedAsterisk: React.FC = () => {
  return <>
    <path fill='none' d='M19 1v8m-3-7 6 6m-6 0 6-6m-7 3h8' stroke='white' strokeWidth='5' strokeLinecap='round'/>
    <path fill='none' d='M19 1v8m-3-7 6 6m-6 0 6-6m-7 3h8'/>
  </>
}

export const Google: React.FC = () => {
  return <>
    <path fill='#E34133' d='m17 3a10 10 8 00-14 2l3.2 2.4a6 6 0 018.4-1.2z' stroke='none'/>
    <path fill='#F3B605' d='m3 5a10 10 0 000 12l3.2-2.4a6 6 0 010-7.2z' stroke='none'/>
    <path fill='#32A350' d='m3 17a10 10 0 0014 2l-2.4-3.2a6 6 0 01-8.4-1.2z' stroke='none'/>
    <path fill='#4081EC' d='m17 19a10 10 0 003.8-10l-9.8 0 0 4 5.655 0a6 6 0 01-2.055 2.8z' stroke='none'/>
  </>
}

export const DownloadSign: React.FC = () => {
  return <>
    <path fill='none' d='m21 16-3 3-3-3m3 2 0-8m3 12-6 0' stroke='white' strokeWidth={5} strokeLinecap='round'/>
    <path fill='none' d='m21 16-3 3-3-3m3 2 0-8m3 12-6 0' strokeWidth={2}/>
  </>
}

export const UploadSign: React.FC = () => {
  return <>
    <path fill='none' d='m21 15-3-3-3 3m3 5 0-7m3 9-6 0' stroke='white' strokeWidth={5} strokeLinecap='round'/>
    <path fill='none' d='m21 15-3-3-3 3m3 5 0-7m3 9-6 0' strokeWidth={2}/>
  </>
}

export const Weather: React.FC = () => {
  return <>
    <path fill='#f15d46' stroke='none' d='m16 1a1 1 0 000 12 1 1 0 000-12'/>
    <path fill='#dddddd' stroke='none' d='m4 9h.5a4.3 4.3 90 01-.1-.9 1 1 0 018.6-.1 2.5 2.5 0 014.1 2.7l.6-.1a1 1 0 01.3 6.4h-14a1 1 0 010-8'/>
  </>
}

export const Fullscreen: React.FC = () => {
  return <>
    <path fill='none' d='m2 11 0-7a2 2 0 012-2l16 0a2 2 0 012 2l0 16a2 2 0 01-2 2l-7 0m-1-2a2 2 0 01-2 2l-6 0a2 2 0 01-2-2l0-6a2 2 0 012-2l6 0a2 2 0 012 2l0 6'/>
    <path fill='none' d='m13 11 5-5m1 3 0-4-4 0' strokeWidth={2}/>
  </>
}

export const Calendar: React.FC = () => {
  return <path fill='currentColor' stroke='none' d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
}