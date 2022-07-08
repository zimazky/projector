import {observable} from 'mobx'

export const appState = observable({view:'Calendar', timestamp: Date.now()/1000})