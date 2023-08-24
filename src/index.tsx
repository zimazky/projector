import React from 'react'
import {createRoot} from "react-dom/client"

import App from './1-app/App/App'

import './index.css'

const rootElement = document.getElementById('root')
if(rootElement === null) throw new Error('Не найден DOM элемент #root')
const root = createRoot(rootElement)
root.render(<App />)