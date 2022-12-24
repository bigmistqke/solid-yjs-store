import { batch, Component, For } from 'solid-js'
import { produce } from 'solid-js/store'
import { WebrtcProvider } from 'y-webrtc'
import * as Y from 'yjs'

import styles from './App.module.css'
import createYjsStore from './lib/createYjsStore'

const App: Component = () => {
  const ydoc = new Y.Doc()
  const provider = new WebrtcProvider('ydoc34', ydoc)
  provider.on('synced', () => console.log('synced'))
  const [store, setStore] = createYjsStore<{ users: { [key: string]: any } }>(
    ydoc,
    { users: {} }
  )

  const reset = () => {
    batch(() => {
      Object.keys(store.users).forEach((key) => {
        setStore('users', key, undefined)
      })
    })
  }

  const shallowMerge = () => {
    setStore('users', { shallowly: 'merged' })
  }

  const setBoris = () => {
    setStore('users', 'boris', {
      id: Math.random(),
      password: Math.random().toString(),
      tests: [
        { id: 0, test: ['ok'] },
        { id: 1, test: ['ok'] },
        { id: 2, test: ['ok'] },
      ],
    })
  }

  const setBorisFilter = () => {
    setStore(
      'users',
      'boris',
      'tests',
      ({ id }) => id > 0,
      'test',
      0,
      'yes!!' + Math.random()
    )
  }

  const setBorisProduce = () => {
    setStore(
      'users',
      'boris',
      'tests',
      1,
      produce((state: any) => {
        state.id = state.id + state.id
      })
    )
  }

  const setBorisFilterProduce = () => {
    setStore(
      'users',
      'boris',
      'tests',
      ({ id }) => {
        return id > 0
      },
      'test',
      produce((state: any) => {
        state[0] = Math.random()
      })
    )
  }

  const setBorisFilterCallback = () => {
    setStore(
      'users',
      'boris',
      'tests',
      ({ id }) => {
        return id > 0
      },
      'test',
      0,
      (number) => {
        console.log('number is ', number)
        return number + number
      }
    )
  }

  const tests = {
    reset,
    shallowMerge,
    setBoris,
    setBorisFilter,
    setBorisProduce,
    setBorisFilterProduce,
    setBorisFilterCallback,
  }

  return (
    <div class={styles.App}>
      <div
        style={{
          display: 'grid',
          'grid-template-columns': 'repeat(2, 1fr)',
          gap: '5px',
        }}
      >
        <div class={styles.panel}>
          <For each={Object.entries(tests)}>
            {([key, callback]) => (
              <>
                <span>
                  <button onclick={callback}>{key}</button>
                  <br />
                  <pre class={styles.label} innerHTML={callback.toString()} />
                </span>
              </>
            )}
          </For>
        </div>
        <pre class={styles.panel} style={{ 'font-size': '10pt' }}>
          {JSON.stringify(store.users, undefined, 1)}
        </pre>
      </div>
    </div>
  )
}

export default App
