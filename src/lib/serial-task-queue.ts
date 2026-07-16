export type SerialTaskQueue = Readonly<{
  enqueue: <Result>(task: () => Promise<Result>) => Promise<Result>
}>

/** Executes asynchronous mutations in submission order, including after a failed task. */
export function createSerialTaskQueue(): SerialTaskQueue {
  let tail: Promise<unknown> = Promise.resolve()

  return {
    enqueue(task) {
      const execution = tail.catch(() => undefined).then(task)
      tail = execution
      return execution
    },
  }
}
