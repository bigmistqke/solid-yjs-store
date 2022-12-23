import { $PROXY } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import * as Y from 'yjs'

import minimumMutationOperations from './minimumMutationOperations'

import { ERROR, LOG } from '../utils/logHelpers'
import setLeaf from '../utils/setLeaf'
import Queue from '../utils/Queue'

type YMapOrArray = Y.Map<any> | Y.Array<any>

const isPrimitive = (value: any) =>
  typeof value === 'string' || typeof value === 'number'

//  setYMap and setYArray are here to prevent a solid-object to accidentally
//  be entered into a yjs-datastructure. these functions can be removed once
//  the implementation is completed

const setYMap = (ymap: Y.Map<any>, key: string, value: any) => {
  if (value[$PROXY]) {
    ERROR(['setYMap'], 'trying to set a solid-proxy inside a yjs-object')
    return
  }
  ymap.set(key, value)
}

const setYArray = (yarray: Y.Array<any>, index: number, value: any) => {
  yarray.insert(index, [value])
  if (yarray.length > 1) yarray.delete(index + 1)
}

export default function <T extends { [key: string]: any }>(
  ydoc: Y.Doc,
  value: T
) {
  const [store, setStore] = createStore<T>(value)

  const q = new Queue()
  function concat<T extends any>(arr1: T[], arr2: T[]) {
    return arr1.concat(arr2)
  }

  const optmizeMutationOperations = (
    ops: ReturnType<typeof minimumMutationOperations>,
    yArray: Y.Array<any>
  ) => {
    const deleted = ops.moved
      .map(({ oldIndex }) => oldIndex)
      .concat(ops.deleted)
      .sort((a, b) => b - a)

    const added = concat(
      ops.moved.map(({ newIndex, oldIndex }) => ({
        index: newIndex,
        value: yArray.get(oldIndex),
      })),
      ops.added.map(({ index, value }) => {
        return { index, value: generateYjsFromScratch(value) }
      })
    ).sort((a, b) => a.index - b.index)

    const optimizedDeleted: { index: number; length: number }[] = []

    deleted.forEach((value, index) => {
      if (index !== 0 && value - deleted[index - 1] === 1) {
        optimizedDeleted[optimizedDeleted.length - 1].length++
      } else {
        optimizedDeleted.push({
          index: value,
          length: 1,
        })
      }
    })

    const optimizedAdded: { index: number; values: any[] }[] = []

    added.forEach(({ value, index }, i) => {
      if (i !== 0 && value.index - added[i - 1].index === 1) {
        optimizedAdded[optimizedAdded.length - 1].values.push(value)
      } else {
        optimizedAdded.push({ index, values: [value] })
      }
    })

    return {
      deleted: optimizedDeleted,
      added: optimizedAdded,
    }
  }

  const solidArrayToYjs = (
    oldSArray: any[],
    newSArray: any[],
    yArray: Y.Array<any>
  ) => {
    // TODO:  we compare oldSArray instead of yArray so we can do shallow checks.
    //        but i am unsure if svalue is always gonna be defined when yvalue is defined
    const ops = minimumMutationOperations(oldSArray, newSArray)
    const { deleted, added } = optmizeMutationOperations(ops, yArray)

    deleted.forEach(({ index, length }) => yArray.delete(index, length))

    added.forEach(({ index, values }) => yArray.insert(index, values))

    if (newSArray.length < yArray.length) {
      yArray.delete(newSArray.length, yArray.length - newSArray.length)
    }
  }

  const generateYjsFromScratch = (svalue: any) => {
    if (isPrimitive(svalue)) {
      return svalue
    } else if (Array.isArray(svalue)) {
      const values = svalue.map((value) => generateYjsFromScratch(value))
      const yArray = new Y.Array()
      setObserver(yArray, svalue)
      yArray.insert(0, values)
      return yArray
    } else if (typeof svalue === 'object') {
      const entries: [key: string, value: any][] = Object.entries(svalue).map(
        ([key, value]) => {
          const yvalue = generateYjsFromScratch(value)
          return [key, yvalue]
        }
      )
      const ymap = new Y.Map(entries)
      setObserver(ymap, svalue)
      return ymap
    } else {
      ERROR(['generateYjsFromScratch'], 'unexpected')
    }
  }

  const solidToYjs = (
    yparent: Y.Map<any> | Y.Array<any>,
    sparent: any,
    key: string | number,
    newValue: any
  ) => {
    if (!sparent) {
      ERROR(['solidToYjs'], 'sparent is undefined')
      return false
    }
    if (yparent instanceof Y.Array && typeof key === 'number') {
      if (isPrimitive(newValue)) {
        setYArray(yparent, +key, newValue)
      } else if (Array.isArray(newValue)) {
        solidArrayToYjs(sparent[+key], newValue, yparent.get(+key))
      } else if (typeof newValue === 'object') {
        const yvalue = yparent.get(key)
        const svalue = sparent[key]
        if (yvalue) {
          ERROR(
            [
              'solidToYjs',
              'yparent instanceof Y.Array',
              'typeof newValue === object',
              'yvalue',
            ],
            'NOT YET IMPLEMENTED'
          )
        } else {
          ERROR(
            [
              'solidToYjs',
              'yparent instanceof Y.Array',
              'typeof newValue === object',
              'yvalue',
            ],
            'NOT YET IMPLEMENTED'
          )
        }
      }
    } else if (yparent instanceof Y.Map && typeof key === 'string') {
      if (newValue === undefined) {
        // in solid setting undefined in setStore -> remove the key
        yparent.delete(key)
      } else if (isPrimitive(newValue)) {
        setYMap(yparent, key, newValue)
      } else if (Array.isArray(newValue)) {
        let yvalue = yparent.get(key)
        const svalue = sparent[key]

        if (!yvalue) {
          yvalue = new Y.Array()
          setYMap(yparent, key, yvalue)
        }

        solidArrayToYjs(svalue, newValue, yvalue)
      } else if (typeof newValue === 'object') {
        const yvalue = yparent.get(key)
        const svalue = sparent[key]

        if (!(key in sparent)) setLeaf(sparent)(key, {})

        if (yvalue) {
          // iterateObservers(yvalue, svalue)
          if (yvalue instanceof Y.Map) {
            // delete the deleted keys
            Object.keys(yvalue.toJSON())
              .filter((key) => Object.keys(newValue).indexOf(key) === -1)
              .forEach((key) => yvalue.delete(key))

            Object.entries(newValue).forEach(([key2, value2]) =>
              solidToYjs(yvalue, svalue, key2, value2)
            )
          }
        } else {
          const ymap = new Y.Map()
          setYMap(yparent, key, ymap)
          const svalue = sparent[key]
          Object.entries(newValue).forEach(([key2, value2]) => {
            if (value === undefined) {
              ERROR(['solidToYjs'], 'not yet implemented')
            } else if (isPrimitive(value2)) {
              setYMap(ymap, key2, value2)
            } else {
              if (!(key2 in svalue))
                setLeaf(svalue)(key2, Array.isArray(value2) ? [] : {})
              solidToYjs(ymap, svalue[key2], key2, value2)
            }
          })
        }
      }
    }
  }

  const getKeysToUpdateFromTransaction = (transaction: Y.Transaction) => {
    // TODO: this is pretty hacky lol
    LOG(['getKeysToUpdateFromTransaction'], transaction)
    return Object.values(Object.fromEntries(transaction.changed))
      .map((set) => Array.from(set) as (string | number)[])
      .flat()
  }

  const setObserver = (yparent: YMapOrArray, sparent: any) => {
    LOG(['setObserver', 'init'], yparent.toJSON(), sparent)
    yparent.observe((changes, transaction) => {
      LOG(
        ['setObserver', 'yparent.observe((changes, transaction)'],
        changes,
        transaction,
        transaction.doc.clientID
      )

      // TODO: should we check for multiple ones?
      const allKeysToUpdate = getKeysToUpdateFromTransaction(transaction)
      LOG(['setObserver', 'allKeysToUpdate'], allKeysToUpdate)

      if (yparent instanceof Y.Array) {
        iterateObservers(yparent, sparent)
        LOG(['setObserver', 'yparent instanceof Y.Array'])
        q.add(() => {
          setLeaf(sparent)(reconcile(yparent.toJSON()))
          iterateObservers(yparent, sparent)
        })
      } else {
        allKeysToUpdate.forEach((keyToUpdate) => {
          const yvalueToUpdate = yparent.get(keyToUpdate)

          if (!keyToUpdate) {
            console.error('keyToUpdate is null')
            return
          }

          LOG(
            ['setObserver', 'keyToUpdate, yvalueToUpdate'],
            keyToUpdate,
            yvalueToUpdate
          )

          if (!yvalueToUpdate && keyToUpdate in sparent) {
            q.add(() => setLeaf(sparent)(keyToUpdate, undefined))
          } else if (
            yvalueToUpdate instanceof Y.Array ||
            yvalueToUpdate instanceof Y.Map
          ) {
            q.add(() => {
              setLeaf(sparent)(keyToUpdate, reconcile(yvalueToUpdate.toJSON()))
              setObserver(yvalueToUpdate, sparent[keyToUpdate])
              iterateObservers(yvalueToUpdate, sparent[keyToUpdate])
            })
          } else {
            LOG(
              ['setObserver', 'this should happen'],
              sparent,
              keyToUpdate,
              yvalueToUpdate
            )

            q.add(() => setLeaf(sparent)(keyToUpdate, yvalueToUpdate))
          }
        })
      }
    })
  }

  const iterateObservers = (
    yparent: Y.Map<any> | Y.Array<any>,
    sparent: any
  ) => {
    LOG(['iterateObservers'], { ...yparent }, { ...sparent }, sparent)
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
        console.log('yeeehaaa', sparent, sparent[key], sparent)

        if (!sparent[key]) {
          LOG(['iterateObservers', 'yparent.forEach', '!sparent[key]'])
          setLeaf(sparent)(key, Array.isArray(value) ? [] : {})
        }
        setObserver(yvalue, sparent[key])

        LOG(
          ['iterateObservers', 'yvalue, sparent[key], sparent, key'],
          yvalue,
          sparent[key],
          sparent,
          key
        )
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

      // setStore(...clonedArgs)
    } catch (err) {
      console.error(err)
    }
  }

  // set initial observers
  Object.entries(value).forEach(([key, value2]) => {
    if (Array.isArray(value2)) {
      const array = ydoc.getArray(key)
      array.observe(() => {
        setLeaf(store[key])(reconcile(array.toJSON()))
        // reconcileYjsToSolid(array, store[key])
      })

      setTimeout(() => {
        iterateObservers(array, store[key])
      }, 0)
    } else if (typeof value2 === 'object') {
      const map = ydoc.getMap(key)
      setObserver(map, store[key])

      // TODO: find out a better way to ensure that a Y.Doc has been loaded
      setTimeout(() => {
        iterateObservers(map, store[key])
      }, 0)
    } else {
      console.error('currently only arrays and objects are allowed')
    }
  })

  return [store, _setStore] as const
}
