import { $PROXY, Component } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'

import styles from './App.module.css'

function setLeaf<T extends object>(leaf: T) {
  return createStore(leaf)[1]
}

const reconcileYjsToSolid = (
  yparent: Y.Map<any> | Y.Array<any>,
  sparent: any
) => {
  setLeaf(sparent)(reconcile(yparent.toJSON()))
}
type MapOrArray = Y.Map<any> | Y.Array<any>
const LOG = (...args: any[]) => (true ? console.log(...args) : undefined)

const isPrimitive = (value: any) =>
  typeof value === 'string' || typeof value === 'number'

const setYMap = (ymap: Y.Map<any>, key: string, value: any) => {
  if (value[$PROXY]) {
    console.error('trying to set a solid-proxy inside a yjs-object')
    return
  }
  LOG('setYMap', ymap, key, value, value[$PROXY])
  ymap.set(key, value)
}

const createUniversalStore = function <T extends { [key: string]: any }>(
  ydoc: Y.Doc,
  value: T
) {
  const [store, setStore] = createStore<T>(value)

  const observers: { [key: string]: void } = {}

  // set initial observers
  Object.entries(value).forEach(([key, value2]) => {
    if (Array.isArray(value2)) {
      const array = ydoc.getArray(key)
      array.observe(() => {
        reconcileYjsToSolid(array, store[key])
      })

      setTimeout(() => {
        iterateObservers(array, store[key])
      }, 3000)
    } else if (typeof value2 === 'object') {
      const map = ydoc.getMap(key)
      map.observe(() => {
        reconcileYjsToSolid(map, store[key])
        // todo: shouldn't we iterate over the observers here too?
      })

      // TODO: find out a better way to ensure that a Y.Doc has been loaded
      setTimeout(() => {
        iterateObservers(map, store[key])
      }, 3000)
    } else {
      console.error('currently only arrays and objects are allowed')
    }
  })

  const solidToYjs = (
    yparent: Y.Map<any> | Y.Array<any>,
    sparent: any,
    key: string | number,
    value: any
  ) => {
    if (yparent instanceof Y.Array && typeof key === 'number') {
      if (typeof value === 'number' || typeof value === 'string') {
        yparent.insert(+key, [value])
        yparent.delete(+key + 1)
      } else {
      }
    } else if (yparent instanceof Y.Map && typeof key === 'string') {
      if (value === undefined) {
        // in solid setting undefined in setStore -> remove the key
        yparent.delete(key)
      } else if (isPrimitive(value)) {
        setYMap(yparent, key, value)
        // yparent.set(key, value)
      } else if (Array.isArray(value)) {
      } else if (typeof value === 'object') {
        const yvalue = yparent.get(key)
        const svalue = sparent?.[key]

        if (yvalue) {
          console.log('yvalue is ', yvalue)
          iterateObservers(yvalue, sparent[key])
          if (yvalue instanceof Y.Map) {
            Object.entries(value).forEach(([key2, value2]) => {
              // TODO: maybe this check is redundant and we can do straight solidToYjs(...)
              if (
                isPrimitive(yvalue.get(key2)) ||
                isPrimitive(value2) ||
                yvalue.get(key2) === undefined
              ) {
                if (value2 !== yvalue.get(key2)) {
                  setYMap(yvalue, key2, value2)
                  // yvalue.set(key2, value2)
                }
              } else {
                console.log(
                  isPrimitive(yvalue.get(key2)) ||
                    isPrimitive(value2) ||
                    yvalue.get(key2) === undefined
                )
                solidToYjs(yvalue, svalue, key2, value2)
              }
            })
          }
        } else {
          const ymap = new Y.Map()
          setYMap(yparent, key, ymap)
          // yparent.set(key, ymap)
          const svalue = sparent?.[key]
          Object.entries(value).forEach(([key2, value2]) => {
            if (isPrimitive(value2)) {
              setYMap(ymap, key2, value2)
              // ymap.set(key2, value2)
            } else if (Array.isArray(value2)) {
            } else if (typeof value2 === 'object') {
              solidToYjs(ymap, svalue[key2], key2, value2)
            }
          })
        }
      }
    }
  }

  const getKeysToUpdateFromTransaction = (transaction: Y.Transaction) => {
    // TODO: this is pretty hacky lol
    return Object.values(Object.fromEntries(transaction.changed)).map((set) => {
      const [value] = set as Set<string | number>
      return value
    })
  }

  type YMapOrArray = Y.Map<any> | Y.Array<any>

  const setObserver = (yparent: YMapOrArray, sparent: any) => {
    yparent.observe((changes, transaction) => {
      // TODO: should we check for multiple ones?
      const keyToUpdate = getKeysToUpdateFromTransaction(transaction)[0]
      console.log('keyToUpdate', keyToUpdate)

      const yvalueToUpdate = yparent.get(keyToUpdate)

      if (
        yvalueToUpdate instanceof Y.Array ||
        yvalueToUpdate instanceof Y.Map
      ) {
        setLeaf(sparent)(keyToUpdate, reconcile(yvalueToUpdate.toJSON()))
        iterateObservers(yvalueToUpdate, sparent[keyToUpdate])
      } else {
        setLeaf(sparent)(keyToUpdate, yvalueToUpdate)
      }
    })
  }

  const iterateObservers = (
    yparent: Y.Map<any> | Y.Array<any>,
    sparent: any
  ) => {
    if (!(yparent instanceof Y.Map || yparent instanceof Y.Array)) {
      console.error(
        'yparent is not an instance of Y.Map or Y.Array',
        yparent,
        sparent
      )
      return
    }
    yparent.forEach((yvalue, key) => {
      if (yvalue instanceof Y.Map || yvalue instanceof Y.Array) {
        if (!sparent[key]) {
          setLeaf(sparent[key])(Array.isArray(value) ? [] : {})
        }
        setObserver(yvalue, sparent[key])
        iterateObservers(yvalue, sparent[key])
      }
    })
  }

  const _setStore = function (...args: any[]) {
    try {
      const clonedArgs = [...args]
      const rootElement = args.shift()
      const next_value = args.pop()
      const property = args.pop()
      let svalue = store[rootElement]
      let yvalue: Y.Array<any> | Y.Map<any> = ydoc.get(rootElement)
      while (args.length > 0) {
        const property = args.shift()
        if (args.length > 0 && !(property in svalue)) {
          throw 'current is undefined'
        }
        if (typeof property === 'function') {
          console.error('store function-calls currently not implemented')
        } else {
          svalue = svalue[property]
          yvalue = yvalue.get(property)
        }
      }

      solidToYjs(yvalue, svalue, property, next_value)

      setStore(...clonedArgs)
    } catch (err) {
      console.error(err)
    }
  }

  return [store, _setStore] as const
}

const App: Component = () => {
  const ydoc = new Y.Doc()
  const provider = new WebrtcProvider('ydoc34', ydoc)

  // provider.on('status', (event) => console.log('provider', event))
  provider.on('synced', () => console.log('synced'))
  const [store, setStore] = createUniversalStore(ydoc, { test: [], users: {} })

  setTimeout(() => {
    setStore('users', 'fred', {
      id: Math.random(),
      password: Math.random().toString(),
      tests: {},
    })
    /* setTimeout(() => {
      setStore('users', 'fred', 'tests', undefined)
    }, 1000) */
    setStore('users', 'fred', 'tests', 'test1', {
      id: Math.random().toString(),
    })
    // setStore('users', 'fred', 'tests', 'whatever', Math.random().toString())
  }, 1000)

  return (
    <div class={styles.App}>
      <header class={styles.header}>
        <button onclick={() => setStore('users', 'fred', 'tests', undefined)}>
          click
        </button>
        {store.test[0]}
        <br />
        {JSON.stringify(store.users)}
      </header>
    </div>
  )
}

export default App
