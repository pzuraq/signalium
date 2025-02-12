import { useEffect, useState } from 'react'
import { FlashingDiv } from './FlashingDiv'

let calledNodes: string[] | undefined

const hookWrapper = (id: string, fn: (...args: any[]) => any) => {
  return (...args: any[]) => {
    calledNodes?.push(id)

    return fn(...args)
  }
}

const useCounter = hookWrapper('useCounter', (ms: number) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setCount((v) => v + 1), ms)
    return () => clearInterval(id)
  }, [ms])

  return count
})

const useCurrentValue = hookWrapper('useCurrentValue', () => {
  const leftCount = useCounter(500)
  const rightCount = useCounter(1000)
  const useLeft = useCounter(5000) % 2 === 0

  return useLeft ? leftCount : rightCount
})

export function HooksVisualizer() {
  calledNodes = []

  const value = useCurrentValue()

  return (
    <div>
      <FlashingDiv>
        <div>{value}</div>
      </FlashingDiv>
    </div>
  )
}
