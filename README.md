## solid-yjs-store

a synced [solid](https://github.com/solidjs/solid) store built on top of [yjs](https://github.com/yjs/yjs).
inspired by [syncedstore](https://syncedstore.org/) and [valtio-yjs](https://github.com/dai-shi/valtio-yjs).

### setup
```
const ydoc = new Y.Doc()
const provider = new WebrtcProvider('doc-name', ydoc)

const [yjsStore, setYjsStore] = createYjsStore(
  ydoc,
  { data: {} }
)
```
### usage

```
//  set as a normal solid-store
SetYjsStore('data', 'key', 'value')
SetYjsStore('data', 'array', ['value1', 'value2', 'value3'])
SetYjsStore('data', 'object', {key: 'value'})

//  filter-functions for arrays
setYjsStore('array', ({id}) => id > 2 , 'value')

//  callback-setters¹
setYjsStore('data', 'key', (value) => value + value)

//  shallow merging objects²
console.log(yjsStore)                           //  {data: {key: 'value'}}
setYjsStore('data', 'shallow', 'merged' )       //  {data: {key: 'value', shallow: 'merged'}}
```

¹ produce is still in development <br/>
² currently only 1 entry-path per reactive value is allowed: multiple entry-paths of one value could cause bugs!

🚧 !UNDER CONSTRUCTION! 🚧
🚧 !ENTER  AT OWN RISK! 🚧
