import { setTracing } from 'signalium/debug';
import { computed, enableTracing } from 'signalium';
import { setupReact, useStateSignal } from 'signalium/react';
import './App.css'

setTracing(true);
setupReact();
enableTracing();

function App() {
  const count = useStateSignal(0);
  const double = computed(() => count.get() * 2);
  const doubleCount = double();

  return (
    <>
      <h1>Signalium</h1>
      <div className="card">
        <button onClick={() => {
          count.set(count.get() + 1);
          console.log('count', count.get());
        }}>
          count is {count.get()}
        </button>
      </div>
      <div className="card">
        <span>
          Computed Double: {doubleCount}
        </span>
      </div>
      <p className="read-the-docs">
        Click <a href="https://signalium.dev" target="_blank">here</a> to learn more
      </p>
    </>
  )
}

export default App
