export default <T, U>(items, newItems) => {
  let mapped: U[] = [],
    disposers: (() => void)[] = [],
    len = 0,
    indexes: ((v: number) => number)[] | null = []

  let i: number, j: number

  let newLen = newItems.length,
    newIndices: Map<T, number>,
    newIndicesNext: number[],
    temp: U[],
    tempdisposers: (() => void)[],
    tempIndexes: ((v: number) => number)[],
    start: number,
    end: number,
    newEnd: number,
    item: T

  // fast path for empty arrays
  if (newLen === 0) {
    if (len !== 0) {
      // dispose(disposers)
      disposers = []
      items = []
      mapped = []
      len = 0
      indexes && (indexes = [])
    }
  }
  // fast path for new create
  else if (len === 0) {
    mapped = new Array(newLen)
    for (j = 0; j < newLen; j++) {
      items[j] = newItems[j]
      // mapped[j] = createRoot(mapper)
    }
    len = newLen
  } else {
    temp = new Array(newLen)
    tempdisposers = new Array(newLen)
    indexes && (tempIndexes = new Array(newLen))

    // skip common prefix
    for (
      start = 0, end = Math.min(len, newLen);
      start < end && items[start] === newItems[start];
      start++
    );

    // common suffix
    for (
      end = len - 1, newEnd = newLen - 1;
      end >= start && newEnd >= start && items[end] === newItems[newEnd];
      end--, newEnd--
    ) {
      temp[newEnd] = mapped[end]
      tempdisposers[newEnd] = disposers[end]
      indexes && (tempIndexes![newEnd] = indexes[end])
    }

    // 0) prepare a map of all indices in newItems, scanning backwards so we encounter them in natural order
    newIndices = new Map<T, number>()
    newIndicesNext = new Array(newEnd + 1)
    for (j = newEnd; j >= start; j--) {
      item = newItems[j]
      i = newIndices.get(item)!
      newIndicesNext[j] = i === undefined ? -1 : i
      newIndices.set(item, j)
    }
    // 1) step through all old items and see if they can be found in the new set; if so, save them in a temp array and mark them moved; if not, exit them
    for (i = start; i <= end; i++) {
      item = items[i]
      j = newIndices.get(item)!
      if (j !== undefined && j !== -1) {
        temp[j] = mapped[i]
        tempdisposers[j] = disposers[i]
        indexes && (tempIndexes![j] = indexes[i])
        j = newIndicesNext[j]
        newIndices.set(item, j)
      } else disposers[i]()
    }
    // 2) set all the new values, pulling from the temp array if copied, otherwise entering the new value
    for (j = start; j < newLen; j++) {
      if (j in temp) {
        mapped[j] = temp[j]
        disposers[j] = tempdisposers[j]
        if (indexes) {
          indexes[j] = tempIndexes![j]
          indexes[j](j)
        }
      } else mapped[j] = createRoot(mapper)
    }
    // 3) in case the new set is shorter than the old, set the length of the mapped array
    mapped = mapped.slice(0, (len = newLen))
    // 4) save a copy of the mapped items for the next update
    items = newItems.slice(0)
  }
  return mapped
}
