import { Component } from 'solid-js'
import { reconcile } from 'solid-js/store'
import { WebrtcProvider } from 'y-webrtc'
import * as Y from 'yjs'

import styles from './App.module.css'
import createYjsStore from './lib/createYjsStore'

const App: Component = () => {
  const ydoc = new Y.Doc()
  const provider = new WebrtcProvider('ydoc34', ydoc)
  provider.on('synced', () => console.log('synced'))
  const [store, setStore] = createYjsStore(ydoc, { test: [], users: {} })
  // const [store, setStore] = createStore({ test: [], users: {} })

  localStorage.log = 'none'

  const setFred = () => {
    setStore('users', 'fred', {
      id: Math.random(),
      password: Math.random().toString(),
      tests: {},
    })
  }

  const setTests = () => {
    setStore('users', 'fred', 'tests', 'whatever', Math.random())
  }

  const overwriteTests = () => {
    setStore('users', 'fred', 'tests', { lol: 'ok' })
  }

  const setBoris = () => {
    setStore('users', 'boris', {
      id: Math.random(),
      password: Math.random().toString(),
      tests: [],
    })
  }

  const setTestBoris = () => {
    setStore('users', 'boris', 'tests', 0, Math.random())
  }
  const setTest2Boris = () => {
    setStore('users', 'boris', 'tests', [Math.random(), Math.random()])
  }
  const setTest3Boris = () => {
    setStore('users', 'boris', 'tests', [Math.random()])
  }

  const setTest4Boris = () => {
    setStore('users', 'boris', 'tests', [
      { id: Math.random() },
      { id: Math.random() },
    ])
  }
  const setTest5Boris = () => {
    setStore('users', 'boris', 'tests', 0, 'id', 'haaaallooooo' + Math.random())
  }

  const reset = () => {
    setStore('users', 'boris', undefined)
    setStore('users', 'fred', undefined)
  }

  return (
    <div class={styles.App}>
      <header class={styles.header}>
        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'repeat(4, 1fr)',
            gap: '5px',
          }}
        >
          <button onclick={reset}>reset</button>
          <button onclick={setFred}>set fred</button>
          <button onclick={setTests}>set tests</button>
          <button onclick={overwriteTests}>overwrite Tests</button>

          <button onclick={setBoris}>set Boris</button>
          <button onclick={setTest4Boris}>setTest 4 Boris</button>
          <button onclick={setTest5Boris}>setTest 5 Boris</button>
        </div>

        {store.test[0]}
        <br />
        <pre style={{ 'font-size': '10pt' }}>
          {JSON.stringify(store.users, undefined, 1)}
        </pre>
      </header>
    </div>
  )
}

export default App
