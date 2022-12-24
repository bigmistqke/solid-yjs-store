import {
  createStore,
  produce,
  reconcile,
  SetStoreFunction,
  unwrap,
} from 'solid-js/store'
import * as Y from 'yjs'

import minimumMutationOperations from './minimumMutationOperations'
import { deleteYValue, getYValue, setYValue } from './utils/yjsHelpers'

import { UNEXPECTED } from './utils/logHelpers'
import setLeaf from './utils/setLeaf'
import concat from './utils/concat'
import Queue from './utils/Queue'

type YMapOrArray = Y.Map<any> | Y.Array<any>

const isPrimitive = (value: any) =>
  typeof value === 'string' || typeof value === 'number'

export default function <T extends { [key: string]: any }>(
  ydoc: Y.Doc,
  value: T,
  log: boolean = false
) {
  const [store, setStore] = createStore<T>(value)
  const q = new Queue()
  const observers = new Map<any, any>()

  const optimizeMutationOperations = (
    ops: ReturnType<typeof minimumMutationOperations>,
    yArray: Y.Array<any>
  ) => {
    //  if multiple delete-operations are sequential: bundle them together
    //  p.ex  yparent.delete(0, 1), yparent.delete(1, 1), yparent.delete(2, 1)
    //        => yparent.delete(0, 3)

    const deleted = ops.moved
      .map(({ oldIndex }) => oldIndex)
      .concat(ops.deleted)
      .sort((a, b) => b - a)

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

    //  if multiple add-operations are sequential: bundle them together
    //  p.ex  yparent.insert(0, [value1]), yparent.delete(1, [value2]), yparent.delete(2, [value3])
    //        => yparent.delete(0, [value1, value2, value3])

    const added = concat(
      ops.moved.map(({ newIndex, oldIndex }) => ({
        index: newIndex,
        value: yArray.get(oldIndex),
      })),
      ops.added.map(({ index, value }) => {
        return { index, value: createYjsBranch(value) }
      })
    ).sort((a, b) => a.index - b.index)

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

  const createYjsBranch = (svalue: any) => {
    if (isPrimitive(svalue)) {
      return svalue
    } else if (Array.isArray(svalue)) {
      const values = svalue.map((value) => createYjsBranch(value))
      const yArray = new Y.Array()
      setObserver(yArray, svalue)
      yArray.insert(0, values)
      return yArray
    } else if (typeof svalue === 'object') {
      const entries: [key: string, value: any][] = Object.entries(svalue).map(
        ([key, value]) => {
          const yvalue = createYjsBranch(value)
          return [key, yvalue]
        }
      )
      const ymap = new Y.Map(entries)
      setObserver(ymap, svalue)
      return ymap
    } else {
      UNEXPECTED(svalue)
    }
  }

  const solidToYjs = (
    yparent: Y.Map<any> | Y.Array<any> | Y.Doc,
    sparent: any,
    key: string | number,
    newValue: any
  ) => {
    if (!sparent) {
      UNEXPECTED('sparent is undefined')
      return false
    }

    if (isPrimitive(newValue)) {
      setYValue(yparent, key, newValue)
    } else if (newValue === undefined && yparent instanceof Y.Map) {
      // in solid setting undefined in setStore -> remove the key
      deleteYValue(yparent, key)
    } else if (Array.isArray(newValue)) {
      solidArrayToYjs(yparent, sparent, key, newValue)
    } else if (typeof newValue === 'object') {
      solidObjectToYjs(yparent, sparent, key, newValue)
    }
  }

  const solidArrayToYjs = (
    yparent: Y.Map<any> | Y.Array<any> | Y.Doc,
    sparent: any,
    key: string | number,
    newValue: any
  ) => {
    if (key && !(key in sparent)) setLeaf(sparent)(key, [])

    const svalue = sparent[key]
    let yvalue = getYValue(yparent, key)

    if (!yvalue) {
      yvalue = new Y.Array()
      setYValue(yparent, key, yvalue)
    }
    if (!(yvalue instanceof Y.Array)) {
      UNEXPECTED(yvalue)
      return
    }

    // TODO:  we compare oldSArray instead of yArray so we can do shallow checks.
    //        but i am not a 100% sure svalue will always gonna be defined when yvalue is defined.

    const ops = minimumMutationOperations(svalue, newValue)
    const { deleted, added } = optimizeMutationOperations(ops, yvalue)

    deleted.forEach(({ index, length }) => yvalue.delete(index, length))
    added.forEach(({ index, values }) => yvalue.insert(index, values))

    if (newValue.length < yvalue.length)
      yvalue.delete(newValue.length, yvalue.length - newValue.length)
  }

  const solidObjectToYjs = (
    yparent: Y.Map<any> | Y.Array<any> | Y.Doc,
    sparent: any,
    key: string | number,
    newValue: any
  ) => {
    if (key && !(key in sparent)) setLeaf(sparent)(key, {})

    const svalue = key ? sparent[key] : sparent
    let yvalue = getYValue(yparent, key)

    if (!yvalue) {
      yvalue = new Y.Map()
      setYValue(yparent, key, yvalue)

      Object.entries(newValue).forEach(([key2, value2]) => {
        if (value === undefined) {
          UNEXPECTED()
        } else if (isPrimitive(value2)) {
          setYValue(yvalue, key2, value2)
        } else {
          if (!(key2 in svalue))
            setLeaf(svalue)(key2, Array.isArray(value2) ? [] : {})
          solidToYjs(yvalue, svalue[key2], key2, value2)
        }
      })
      return
    }

    if (yvalue instanceof Y.Map) {
      //  TODO
      //  solid's stores does a shallow merge on objects
      //  https://www.solidjs.com/docs/latest/api#createstore : 'Objects are always shallowly merged.'
      //  since we are only checking the path, inconsistencies might arise when a signal gets shallowly merged
      //  so that it has mutliple entry-paths in a store

      console.info(
        `be careful: when setting an object in a store, the object gets shallowly merged 
(see https://www.solidjs.com/docs/latest/api#createstore). 
This can possibly create multiple entry-points of the same reactive value in a store:

const [store, setStore] = createStore({firstEntryPoint: "ok"});
setStore({secondEntryPoint: store.firstEntryPoint});

=> store.secondEntryPoint points at store.firstEntryPoint.

Multiple entry-points are currently not supported in yjsStore.`
      )

      if (!svalue) setLeaf(sparent)(key, {})

      Object.entries(newValue).forEach(([key2, value2]) =>
        solidToYjs(yvalue, svalue, key2, value2)
      )
      return
    }
    UNEXPECTED(yvalue)
  }

  const getKeysToUpdateFromTransaction = (transaction: Y.Transaction) => {
    // TODO: this is pretty hacky lol
    return Object.values(Object.fromEntries(transaction.changed))
      .map((set) => Array.from(set) as (string | number)[])
      .flat()
  }

  const setObserver = (yparent: YMapOrArray, sparent: any) => {
    // if (observers.get(sparent) !== undefined) return

    yparent.observe((changes, transaction) => {
      const [key] = transaction.changed.keys()

      const allKeysToUpdate = getKeysToUpdateFromTransaction(transaction)

      if (yparent instanceof Y.Array) {
        iterateObservers(yparent, sparent)
        q.add(() => {
          setLeaf(sparent)(reconcile(yparent.toJSON()))
          iterateObservers(yparent, sparent)
        })
      } else {
        allKeysToUpdate.forEach((keyToUpdate) => {
          const yvalueToUpdate = getYValue(yparent, keyToUpdate)
          if (!keyToUpdate) {
            UNEXPECTED('keyToUpdate is null', keyToUpdate)
            return
          }
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
            q.add(() => setLeaf(sparent)(keyToUpdate, yvalueToUpdate))
          }
        })
      }
    })

    observers.set(sparent, yparent)
    observers.set(yparent, sparent)
  }

  const iterateObservers = (
    yparent: Y.Map<any> | Y.Array<any>,
    sparent: any
  ) => {
    if (!(yparent instanceof Y.Map || yparent instanceof Y.Array)) {
      UNEXPECTED(yparent, sparent)
      return
    }
    yparent.forEach((yvalue, key) => {
      if (yvalue instanceof Y.Map || yvalue instanceof Y.Array) {
        if (!sparent[key]) {
          setLeaf(sparent)(key, Array.isArray(value) ? [] : {})
        }
        setObserver(yvalue, sparent[key])
        iterateObservers(yvalue, sparent[key])
      }
    })
  }

  const _setStore: SetStoreFunction<typeof store> = function (...args: any) {
    const clonedArgs = [...args]

    let nextValue = args.pop()
    let key = args.pop()

    type TreeNode = {
      sparent: any
      yparent: Y.Doc | Y.Array<any> | Y.Map<any>
      key: string
    }

    let tree: TreeNode[][] = [[{ sparent: store, yparent: ydoc, key: '' }]]

    while (args.length > 0) {
      const nextArg = (
        args as (number | string | ((state: any) => boolean))[]
      ).shift()!
      const currentLayer = tree[tree.length - 1]
      const nextLayer: TreeNode[] = []
      //  filter functions inside store
      //  see https://www.solidjs.com/docs/latest/api#updating-stores
      if (typeof nextArg === 'function') {
        currentLayer.forEach(({ sparent, yparent }) => {
          if (Array.isArray(sparent) && yparent instanceof Y.Array) {
            const filtered = sparent.filter((element) => nextArg(element))
            const mapped = filtered.map((svalue) => ({
              sparent: svalue,
              yparent: observers.get(svalue),
              key: nextArg.toString(),
            }))
            nextLayer.push(...mapped)
          } else {
            UNEXPECTED()
          }
        })
      } else {
        currentLayer.forEach(({ sparent, yparent }) => {
          nextLayer.push({
            sparent: sparent[nextArg],
            yparent: observers.get(sparent[nextArg]),
            key: nextArg.toString(),
          })
        })
      }
      tree.push(nextLayer)
    }

    tree[tree.length - 1].forEach(({ sparent, yparent }) => {
      if (typeof nextValue === 'function') {
        //  TODO: figure out a less hacky way to figure out if it is a produce-function or not
        const produceToString = produce(() => {})
          .toString()
          .replace(/\s/g, '')
        const nextValueToString = nextValue.toString().replace(/\s/g, '')

        if (nextValueToString === produceToString) {
          // if produce: pass a mutable reference to the function
          let unwrapped = unwrap(sparent[key])
          nextValue(unwrapped)
          nextValue = unwrapped
        } else {
          // else: set nextValue as the result of the function

          console.log(tree[tree.length - 1])

          nextValue = nextValue(unwrap(sparent)[key])

          console.log('nextValue', nextValue, store)
        }

        // return
      }

      console.log(
        'yparent, sparent, key nextValue',
        yparent,
        sparent,
        key,
        nextValue
      )
      solidToYjs(yparent, sparent, key, nextValue)
    })

    // setStore(...clonedArgs)
  }

  Object.entries(value).forEach(([key, value]) => {
    if (typeof value === 'object') {
      const array = Array.isArray(value) ? ydoc.getArray(key) : ydoc.getMap(key)
      setObserver(array, store[key])
      iterateObservers(array, store[key])
    } else {
      console.error('currently only arrays and objects are allowed')
    }
  })

  return [store, _setStore] as const
}
